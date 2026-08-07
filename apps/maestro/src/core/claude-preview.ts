// Preview — build the prompt, report whether the CLI exists, issue the token. Spawn nothing.
//
// ┌─ READ THIS BEFORE ADDING AN IMPORT ────────────────────────────────────────────────────────┐
// │ This module must never be able to start a process. Not "does not currently", CANNOT: it     │
// │ imports no `node:child_process`, and neither does anything it imports. `test/claude.test.ts` │
// │ walks the transitive import graph of this file and fails if a spawn reaches it.             │
// └────────────────────────────────────────────────────────────────────────────────────────────┘
//
// The preview/run split is the security design, not an implementation detail, and this half is
// where the property lives. Two operations exist so that the prompt the user was shown and the
// prompt that executes are the same object: preview builds it and hands back a token; run accepts
// the token and nothing else (see `claude-tokens.ts`). Collapse them into one "run this prompt"
// call and the app can execute a string the user never saw, while the diff looks like a
// simplification. If that is ever proposed, the thing being removed is the guarantee.
//
// Availability is reported HERE rather than discovered at spawn time for the same reason: the UI
// has to be able to say "the CLI was not found, here is where I looked" while the Run button is
// still un-pressed. `claude-cli.ts` decides it with `fs`, which is why it can live on this side.

import fs from "node:fs";
import path from "node:path";
import { cliNotFoundMessage, resolveClaudeCli, type ResolveOptions } from "./claude-cli.js";
import { issueInvocation } from "./claude-tokens.js";
import { enclosingRepo } from "./repo.js";
import { resolveCreateTarget } from "./scaffold.js";
import { tasksDirFor } from "./tasks.js";
import { joinOxford } from "./text.js";
import type { ChatTurn, ClaudePreview, ClaudeRequest, ClaudeWriteTarget, CreateRequest } from "./contracts.js";

export type { ClaudePreview, ClaudeRequest, ClaudeWriteTarget };

/**
 * Flags an authoring invocation carries, before the prompt.
 *
 * `-p` is headless print mode: one prompt, output to stdout, no interactive session.
 *
 * `--permission-mode acceptEdits` is deliberate and is the reason the modal shows argv verbatim.
 * A run whose whole job is to author a file cannot stop to ask about writing it — in print mode
 * there is no one to ask, so the default mode turns every useful run into a refusal. Auto-accepting
 * *edits* (and nothing else — Bash and the rest still fall through to the default) is the narrowest
 * setting that lets the run do what the user just confirmed. It is in `argv`, on screen, above the
 * Run button; a user who does not want it can copy the prompt and run it their own way.
 */
export const CLAUDE_BASE_FLAGS = ["-p", "--permission-mode", "acceptEdits"] as const;

/**
 * Flags for a run that only has to ANSWER — the help chat.
 *
 * `acceptEdits` is left off, and that is the point rather than an omission. The flag exists so a
 * create-\* run can finish the file it was started for; a question is not an authoring job, and
 * pre-accepting edits for one would hand a chat message the same write authority as a form submit
 * the user filled in on purpose. Without it the run falls back to the default permission mode,
 * where an edit in print mode has nobody to ask and simply does not happen. The chat therefore
 * reads and answers; if it decides something should be written, it says so and the user goes and
 * does it from a surface that asks about writes.
 */
export const CLAUDE_ASK_FLAGS = ["-p"] as const;

/** Turns of chat history that ride along in the prompt. Older ones are dropped. */
const CHAT_HISTORY_TURNS = 10;

/** Per-turn and per-message caps, so the prompt the user is shown stays a thing they can read. */
const CHAT_MESSAGE_MAX = 4000;
const CHAT_TURN_MAX = 1500;

interface BuiltRequest {
  prompt: string;
  targets: ClaudeWriteTarget[];
  /** Flags before the prompt. Defaults to `CLAUDE_BASE_FLAGS` — the authoring set. */
  flags?: readonly string[];
  /**
   * Where to run, when that is not the open project.
   *
   * A create-* flow can write into a marketplace repo or a brand-new marketplace directory, both of
   * which sit outside the project the window has open. Running there anyway would put every edit
   * outside the CLI's working directory, where `--permission-mode acceptEdits` does not reach and a
   * headless run has no one to ask — so the run would stall or refuse rather than finish the file
   * it was started for. The cwd is derived here, from the same resolution that chose the path, and
   * the modal shows it; it is never taken from the caller.
   */
  cwd?: string;
}

/**
 * The finishing prompt for a create-* flow, and the file it may touch.
 *
 * Shape, and why it is this shape:
 *
 *   • It names an artifact that ALREADY EXISTS. The deterministic scaffold ran when the form was
 *     submitted, so the run's job is to finish a file, not to create one — and the path comes from
 *     `resolveCreateTarget`, the same resolution the scaffold wrote with, so the prompt cannot name
 *     a different file than the one on disk.
 *   • It forbids touching the frontmatter. The `description:` was computed by `buildDesc` and shown
 *     in the form's live preview; a model rewriting it would silently replace the string the user
 *     approved with one they never saw.
 *   • It is self-contained prose, NOT `/create-skill`. The slash command would re-run the skill's
 *     own create flow from the top — re-deriving fields this payload already carries and possibly
 *     recreating what the scaffold just wrote. (It used to be worse: the plugin's
 *     `UserPromptExpansion` hook launched the Docker app and blocked on a form submission a
 *     headless run could never make. M5 deleted that hook; the rule outlives it.) The instructions
 *     the skill would have supplied are inlined here instead.
 */
function buildCreate(projectRoot: string, request: CreateRequest, opts: ResolveOptions): BuiltRequest {
  const target = resolveCreateTarget(projectRoot, request, { home: opts.home });
  // Marketplace-bound artifacts (and a brand-new marketplace) live outside the open project, so
  // that repo is the working directory — see `BuiltRequest.cwd`.
  const cwd = target.marketplacePath || projectRoot;
  const preamble = [
    `The deterministic scaffold has already written ${target.path}, with its frontmatter/manifest complete.`,
    `Do not recreate it, do not move it, and do not change its frontmatter — the description shown there is the one the user approved.`,
    "",
  ];
  const only = (file: string, note: string): ClaudeWriteTarget[] => [{ path: file, action: "modify", note }];

  switch (request.kind) {
    case "create-skill":
      return {
        prompt: [
          ...preamble,
          `Author the body of that SKILL.md from the idea below, replacing the placeholder comment.`,
          `Write it as a domain expert would: a clear workflow, concrete steps, and any reference tables or`,
          `decision trees that help. Leave no placeholder text.`,
          "",
          `Skill name: ${target.name}`,
          `Idea: ${request.idea.trim()}`,
          `Use when: ${request.useWhen.length ? joinOxford(request.useWhen) : "(no triggers given)"}`,
        ].join("\n"),
        targets: only(target.path, "The scaffolded skill file — its body is rewritten, its frontmatter is not."),
        cwd,
      };

    case "create-subagent":
      return {
        prompt: [
          ...preamble,
          `Author the body of that agent file from the idea below, replacing the placeholder comment.`,
          `Follow the agents.md structure: a role description, "When to apply", a step-by-step workflow, and`,
          `the expected output format. Write it as a domain expert would, with no placeholder text.`,
          "",
          `Subagent name: ${target.name}`,
          `Idea: ${(request.mode === "auto" ? request.idea : request.description).trim()}`,
          `When to apply: ${request.triggers.length ? joinOxford(request.triggers) : "(no triggers given)"}`,
          `Tools: ${request.tools.length ? request.tools.join(", ") : "(unrestricted)"}`,
        ].join("\n"),
        targets: only(target.path, "The scaffolded agent file — its body is rewritten, its frontmatter is not."),
        cwd,
      };

    case "create-plugin":
      return {
        prompt: [
          ...preamble,
          `The plugin.json manifest and the skills/ directory exist, and the plugin is registered in the`,
          `marketplace's marketplace.json. Write ${path.join(target.path, "README.md")}: a title, what the plugin`,
          `provides, and how to install it from this marketplace. Change nothing else.`,
          "",
          `Plugin name: ${target.name}`,
          `Description: ${request.description.trim()}`,
          `Keywords: ${request.keywords.length ? request.keywords.join(", ") : "(none)"}`,
        ].join("\n"),
        targets: [{ path: path.join(target.path, "README.md"), action: "create", note: "The plugin's README." }],
        cwd,
      };

    case "create-marketplace":
      return {
        prompt: [
          ...preamble,
          `Finish the marketplace: enrich the starter README.md (title, what it offers, and the`,
          `\`claude plugin marketplace add\` / \`claude plugin install\` instructions), and write a CLAUDE.md`,
          `explaining that this repo is a marketplace catalog, pointing at .claude-plugin/marketplace.json and`,
          `describing the plugins/<name>/ source layout. Do not edit marketplace.json.`,
          // Repository setup left this prompt when it became a scaffold step, and the run is told
          // the OUTCOME instead — read off the disk the scaffold just wrote, so the sentence is true
          // in both cases rather than a claim about what should have happened. Left unsaid, a model
          // finishing a marketplace reasonably reaches for `git init` and either nests a repository
          // or re-commits the scaffold under its own authorship. Remotes and private-repo access
          // are still the user's to arrange; they are not this run's either.
          enclosingRepo(target.path)
            ? `The directory is already a git repository with the scaffold committed: do not run git.`
            : `The directory is not a git repository and the app could not make it one: do not run git — the user will.`,
          request.privateRepo
            ? `\nThis marketplace will live in a PRIVATE repository: document the token env vars (GITHUB_TOKEN / GH_TOKEN, GITLAB_TOKEN / GL_TOKEN, BITBUCKET_TOKEN) that background auto-update needs, since credential helpers are skipped there.`
            : "",
          "",
          `Marketplace name: ${target.name}`,
          `Description: ${request.description.trim()}`,
          `Owner: ${request.ownerName.trim()} <${request.ownerEmail.trim()}>`,
        ]
          .filter((line) => line !== "")
          .join("\n"),
        targets: [
          { path: path.join(target.path, "README.md"), action: "modify", note: "The starter README, enriched." },
          { path: path.join(target.path, "CLAUDE.md"), action: "create", note: "Context for sessions opened here." },
        ],
        cwd,
      };
  }
}

/**
 * The help chat's prompt: one question, plus the exchange it follows.
 *
 * The chat is the one request kind whose payload is free prose the user typed, so it is worth
 * being precise about what that does and does not change. It does not make the renderer the source
 * of a prompt: the sentence around the question — "Use the /super-help skill to answer" — is built
 * here and nowhere else, and there is no field on the request that can reach argv. It is the same
 * arrangement `create-skill`'s `idea` has always had. What makes it safe is the other half of the
 * bridge: whatever comes out of here is shown to the user, in full, before it can run.
 *
 * History travels ON THE REQUEST rather than being kept in this process, and that is deliberate
 * too. A transcript held in main would be prompt text the user could not see accumulating; carried
 * on the request, it is part of the string the preview displays, so "the user saw what ran" stays
 * literally true on the tenth message as much as the first. It is capped for the same reason — a
 * prompt too long to read is one nobody reads.
 */
function buildChat(message: unknown, history: unknown): BuiltRequest {
  const question = String(message ?? "")
    .trim()
    .slice(0, CHAT_MESSAGE_MAX);
  if (!question) throw new Error("Ask a question first — the chat has nothing to send.");

  const turns: ChatTurn[] = (Array.isArray(history) ? history : [])
    .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-CHAT_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, CHAT_TURN_MAX) }))
    .filter((t) => t.content !== "");

  const head = `Use the /super-help skill to answer the user's question: ${question}`;
  const prompt = turns.length
    ? [
        head,
        "",
        "Earlier in this conversation:",
        "",
        ...turns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`),
      ].join("\n")
    : head;

  return {
    prompt,
    // Nothing. The chat runs without `--permission-mode acceptEdits` (see CLAUDE_ASK_FLAGS), so
    // this is a claim about the invocation rather than a hope about the model's behaviour.
    targets: [],
    flags: CLAUDE_ASK_FLAGS,
  };
}

/**
 * The prompt for one request kind, and the paths it may touch.
 *
 * Every branch here is a prompt the app can execute; there is no branch that takes prompt text from
 * the caller. Adding a kind means adding a case, which is the review surface this design is for.
 */
function build(projectRoot: string, request: ClaudeRequest, opts: ResolveOptions): BuiltRequest {
  switch (request?.kind) {
    case "help-chat":
      return buildChat(request.message, request.history);
    case "maestro-task": {
      // basename, not the path as given: a request must not be able to name a file outside the
      // tasks directory, and `filename` crosses a process boundary.
      const filename = path.basename(String(request.filename ?? ""));
      const file = path.join(tasksDirFor(projectRoot), filename);
      if (!filename.endsWith(".md") || !fs.existsSync(file)) {
        throw new Error(`No such task: ${filename || "(none given)"}`);
      }
      const relativePath = path.posix.join(".claude", "maestro-tasks", filename);
      return {
        // The same sentence /maestro-tasks offers as "Copy prompt" — running it here and pasting
        // it into a session by hand must produce the same session.
        prompt: `Use /maestro to complete the task described in file ${relativePath}`,
        targets: [
          {
            path: projectRoot,
            action: "unknown",
            note:
              "A task decides what it edits, so the run can write anywhere in this project. " +
              "Read the task before confirming.",
          },
        ],
      };
    }
    case "create-skill":
    case "create-subagent":
    case "create-plugin":
    case "create-marketplace":
      return buildCreate(projectRoot, request, opts);
    default:
      throw new Error(`Unsupported Claude request: ${JSON.stringify(request)}`);
  }
}

/**
 * Build the invocation the confirmation modal shows, and authorise it.
 *
 * Pure with respect to the machine: it reads the project to build the prompt and reads directories
 * to find the CLI, and writes nothing anywhere.
 */
export function previewClaudeRun(
  projectRoot: string,
  request: ClaudeRequest,
  opts: ResolveOptions = {}
): ClaudePreview {
  if (!projectRoot) throw new Error("No project is open.");
  const built = build(projectRoot, request, opts);
  const { prompt, targets } = built;
  // The open project unless the request resolved somewhere else — a create-* flow writing into a
  // marketplace repo runs there, so its edits are inside the CLI's working directory.
  const cwd = built.cwd ?? projectRoot;
  const cli = resolveClaudeCli(opts);

  // argv[0] is the resolved path rather than the bare name, so what the modal shows is the exact
  // executable that will run — "claude" would be a claim about PATH resolution the user cannot check.
  const args = [...(built.flags ?? CLAUDE_BASE_FLAGS), prompt];
  const argv = [cli.bin ?? "claude", ...args];

  if (!cli.available) {
    // No token: there is nothing runnable to authorise. The prompt and argv are still returned in
    // full — Copy prompt is the whole fallback, and it must work in exactly this state.
    return {
      token: null,
      prompt,
      argv,
      cwd,
      targets,
      available: false,
      bin: null,
      searched: cli.searched,
      unavailable: cliNotFoundMessage(cli),
      expiresAt: 0,
    };
  }

  const invocation = issueInvocation({ purpose: "claude", bin: cli.bin!, args, cwd, prompt });
  return {
    token: invocation.token,
    prompt,
    argv,
    cwd,
    targets,
    available: true,
    bin: cli.bin,
    searched: cli.searched,
    unavailable: null,
    expiresAt: invocation.expiresAt,
  };
}
