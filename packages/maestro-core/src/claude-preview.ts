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
import { tasksDirFor } from "./tasks.js";
import type { ClaudePreview, ClaudeRequest, ClaudeWriteTarget } from "./contracts.js";

export type { ClaudePreview, ClaudeRequest, ClaudeWriteTarget };

/**
 * Flags every invocation carries, before the prompt.
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

interface BuiltRequest {
  prompt: string;
  targets: ClaudeWriteTarget[];
}

/**
 * The prompt for one request kind, and the paths it may touch.
 *
 * Every branch here is a prompt the app can execute; there is no branch that takes text from the
 * caller. Adding a kind means adding a case, which is the review surface this design is for.
 */
function build(projectRoot: string, request: ClaudeRequest): BuiltRequest {
  switch (request?.kind) {
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
  const { prompt, targets } = build(projectRoot, request);
  const cli = resolveClaudeCli(opts);

  // argv[0] is the resolved path rather than the bare name, so what the modal shows is the exact
  // executable that will run — "claude" would be a claim about PATH resolution the user cannot check.
  const args = [...CLAUDE_BASE_FLAGS, prompt];
  const argv = [cli.bin ?? "claude", ...args];

  if (!cli.available) {
    // No token: there is nothing runnable to authorise. The prompt and argv are still returned in
    // full — Copy prompt is the whole fallback, and it must work in exactly this state.
    return {
      token: null,
      prompt,
      argv,
      cwd: projectRoot,
      targets,
      available: false,
      bin: null,
      searched: cli.searched,
      unavailable: cliNotFoundMessage(cli),
      expiresAt: 0,
    };
  }

  const invocation = issueInvocation({ bin: cli.bin!, args, cwd: projectRoot, prompt });
  return {
    token: invocation.token,
    prompt,
    argv,
    cwd: projectRoot,
    targets,
    available: true,
    bin: cli.bin,
    searched: cli.searched,
    unavailable: null,
    expiresAt: invocation.expiresAt,
  };
}
