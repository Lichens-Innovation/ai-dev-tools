// The Claude Agent SDK — the ground the session pane stands on.
//
// GET THE PACKAGE RIGHT. This is `@anthropic-ai/claude-agent-sdk`: it spawns the `claude` CLI the
// user is already logged into, and the work draws on their subscription. It is NOT
// `@anthropic-ai/sdk`, the REST client for the Messages API — that one takes an API key, bills
// pay-as-you-go, spawns nothing and has no `canUseTool`. The names differ by one path segment, both
// install without complaint, and the wrong one defeats the entire point while looking correct.
// Same trap in the repos: `anthropics/claude-agent-sdk-typescript` is this SDK,
// `anthropics/anthropic-sdk-typescript` is not.
//
// Three things live here. `runAgentSdkSmoke` exists to prove, on the machine the app is actually
// installed on, that a query runs at all — see SESSION-PANE-PLAN.md, of which this is the first
// slice. `nodeSettings()` resolves the effective settings cascade so the confirmation dialog can
// state what a run will actually be able to read; it spawns no CLI (see its own comment) and is
// handed to the preview as a PORT, because the preview may not import this module.
// `startAgentSession()` is the third and the one that does the work: it is what `claude-run.ts`
// executes a previewed invocation with, in place of the `claude -p` spawn it used to be.
//
// This is also the only module in the app that imports the SDK, and `test/isolation.test.ts` pins
// that: the SDK is a second path to the `claude` binary, and the options it is given decide the
// permission model of everything built on it.
//
// ┌─ THREE THINGS THAT ONLY FAIL IN A PACKAGED BUILD ──────────────────────────────────────────┐
// │                                                                                             │
// │ 1. THE SDK MUST BE EXTERNALIZED. It is in the desktop app's package.json `dependencies` —   │
// │    the block `externalizeDepsPlugin` derives its externals from, and a block this app did    │
// │    not have until this slice, since everything it uses is a devDependency. Bundled instead,  │
// │    the SDK's own `require.resolve` of a CLI on disk resolves against the bundle and throws   │
// │    `Native CLI binary for <platform> not found`. It must NOT join the `exclude:` list in     │
// │    electron.vite.config.ts — that list is for workspace SOURCE packages with no build        │
// │    artifact to resolve, which is the opposite case.                                         │
// │                                                                                             │
// │ 2. ASAR IS THE SECOND HALF, AND IS NOT ACTIONABLE YET. Externalizing gets `require` to look  │
// │    for the package at runtime; in a packaged app it then looks inside `app.asar`, where a    │
// │    native binary cannot be executed. The fix is `asar: { unpack:                             │
// │    "**/node_modules/@anthropic-ai/**" }` plus rewriting `app.asar` → `app.asar.unpacked` on  │
// │    the resolved path. It is the single most reported Agent-SDK-in-Electron failure. THERE IS │
// │    NO electron-builder CONFIG IN THIS REPO, so there is nowhere to write it: this is a       │
// │    constraint on whoever adds packaging, not an omission here. (We sidestep the bundled      │
// │    binary entirely — see 3 — but the app's own `node_modules` copy of the SDK is still       │
// │    inside the archive.)                                                                     │
// │                                                                                             │
// │ 3. THE CLI PATH IS HANDED OVER, NEVER LOOKED UP. Left to itself the SDK spawns NODE to run   │
// │    a bundled `cli.js`, and a GUI-launched Electron app has a PATH with no `node` on it — the │
// │    failure reads `spawn node ENOENT` and does not reproduce from a terminal. `claude-cli.ts` │
// │    already resolves the real binary with `fs` for exactly this reason (on a machine with the │
// │    native installer, `~/.local/bin/claude` is a single-file binary needing no runtime at     │
// │    all), so `pathToClaudeCodeExecutable` gets that answer and the SDK never guesses.         │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
//
// A note on versions: the SDK tracks the CLI it was cut against patch-for-patch (0.3.222 ↔ 2.1.222)
// and the stdio control protocol between them is private. Pointing it at the user's own,
// self-updating `claude` is the right trade — that binary is the one they are logged into — but it
// means the two can drift. The smoke result reports both versions so a support answer can say so.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { cliNotFoundMessage, resolveClaudeCli, claudeChildPath, type ResolveOptions } from "./claude-cli.js";
import { decideWrite, targetPathOf, READ_ONLY_TOOLS } from "./write-scope.js";
import { decideBoundary } from "./session-scope.js";
import { autoRefusal, decidePaneCall, permissionReason, PANE_ASK_TOOLS } from "./session-permission.js";
import { createPermissionRegistry } from "./permission-registry.js";
import type {
  ClaudeOutputChunk,
  EffectiveSettingsSnapshot,
  PermissionAnswer,
  SessionEvent,
  SessionEventBody,
  SettingsPermissions,
  SettingsPort,
  SettingsSourceInfo,
  SettingsTier,
} from "./contracts.js";

// Type-only, and therefore erased: `claude-run.ts` supplies the spawn function and must be able to
// type it without importing the SDK, which this module is the app's only importer of.
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";
export type { SpawnOptions, SpawnedProcess };

/** The one correct package name, in one place, so a typo is a diff rather than a silent downgrade. */
export const AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk";

/**
 * Credentials that silently move the bill off the user's subscription and onto an API account.
 *
 * The SDK's `env` option REPLACES the subprocess environment rather than merging into it, which is
 * what makes dropping these possible at all — but also means the environment has to be built in
 * full, `PATH` included, or we re-acquire the bug `claude-cli.ts` exists to prevent.
 *
 * Both entries are here because both are believed-you rather than asked-about: a stray
 * `ANTHROPIC_API_KEY` in a shell profile, or an `ANTHROPIC_AUTH_TOKEN` from a gateway experiment,
 * turns every turn in this app into a pay-as-you-go API call with nothing on screen saying so.
 * Deliberately NOT here: `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` and the like. Those
 * are a deployment the user configured on purpose, and dropping them would break a working setup
 * to defend an assumption; the smoke reports them instead (`otherProviderVars`).
 */
export const BILLING_ENV_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;

/** Provider-selection variables left alone but worth reporting — they change WHO serves the model. */
const PROVIDER_ENV_VARS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
] as const;

/** How long a smoke query may take before it is aborted. It is one turn with no tools. */
const SMOKE_TIMEOUT_MS = 90_000;

/** What the smoke query asks for. Short, deterministic, and cheap enough to run on every launch. */
export const SMOKE_PROMPT = "Reply with exactly `MAESTRO_SDK_OK` and nothing else.";

/** The description of the environment handed to the child, for disclosure and for tests. */
export interface AgentChildEnv {
  env: Record<string, string | undefined>;
  /** Billing credentials that were present in the parent and are absent from `env`. */
  dropped: string[];
  /** Provider-selection variables still set — not removed, but not silent either. */
  otherProviderVars: string[];
}

/**
 * The environment the `claude` child runs in — constructed, not inherited.
 *
 * Two properties, and they pull in opposite directions, which is why this is a function rather than
 * an object literal at the call site:
 *
 *   • No billing credential survives. `{ ...process.env }` passed through would hand an
 *     `ANTHROPIC_API_KEY` to a CLI that would then happily use it, and the user would find out on
 *     an invoice. The keys are DELETED rather than set to `undefined`: `undefined` is dropped by
 *     `child_process.spawn` and is what the SDK's own type suggests, but absence is the property we
 *     actually want and the only one a test can assert without knowing how the SDK spreads it.
 *   • `PATH` survives, and is the expanded one. `env` replaces rather than merges, so the naive
 *     "just drop the key" also drops PATH — and the CLI shells out to `git`, to hooks, to whatever
 *     the project runs. It gets the same list `claude-cli.ts` searched, for the same reason.
 */
export function agentChildEnv(opts: ResolveOptions = {}): AgentChildEnv {
  const parent = opts.env ?? process.env;
  const env: Record<string, string | undefined> = { ...parent };

  const dropped: string[] = [];
  for (const key of BILLING_ENV_VARS) {
    if (env[key]) dropped.push(key);
    delete env[key];
  }

  env.PATH = claudeChildPath(opts);

  return {
    env,
    dropped,
    otherProviderVars: PROVIDER_ENV_VARS.filter((key) => Boolean(parent[key])),
  };
}

/** Where the money for a query goes, as the CLI itself reports it on the init message. */
export type AgentBilling = "subscription" | "api-key" | "unknown";

/**
 * Read the billing shape off the init message's `apiKeySource`.
 *
 * `"oauth"` is the subscription login. `"none"` also means the subscription: the documented union
 * does not contain it, but the CLI emits it at runtime when no API key is in play, which is exactly
 * the state this app wants to be in. Everything else names a place an API key came from — so it is
 * an API bill, and the caller should say so rather than assume.
 */
export function billingFrom(apiKeySource: string | null): AgentBilling {
  if (apiKeySource === "oauth" || apiKeySource === "none") return "subscription";
  if (apiKeySource === null) return "unknown";
  return "api-key";
}

/** The receipt a smoke query leaves. Everything a support answer or a next slice would want. */
export interface AgentSdkSmokeResult {
  ok: boolean;
  /** ISO timestamp, so a stale receipt on disk cannot be mistaken for this launch's. */
  at: string;
  durationMs: number;
  /** The exact executable handed to the SDK. Null means the CLI was not found and nothing ran. */
  bin: string | null;
  cwd: string;
  sdkVersion: string | null;
  /** What the child reported about itself — the other half of the version pair. */
  cliVersion: string | null;
  apiKeySource: string | null;
  billing: AgentBilling;
  model: string | null;
  /** The text of the SDK result message. Its presence IS the acceptance criterion. */
  result: string | null;
  costUsd: number | null;
  numTurns: number | null;
  env: {
    /** Billing credentials found in the parent environment and withheld from the child. */
    dropped: string[];
    /** Provider-selection variables still set. Not removed; see BILLING_ENV_VARS. */
    otherProviderVars: string[];
    /** Both asserted rather than assumed: `env` replaces, so either could be lost in one edit. */
    hasPath: boolean;
    hasApiKey: boolean;
  };
  /** Whatever the CLI wrote to stderr, tail-capped. Empty on a healthy run. */
  stderr: string;
  error: string | null;
}

/**
 * The SDK's own version, read from the package `require` actually resolves to.
 *
 * Resolved rather than imported from a constant: the number that matters is the one on disk next to
 * the running bundle, which in a packaged app is not necessarily the one in the manifest. Null when
 * resolution fails, which is itself the interesting answer — it is what the asar failure looks like.
 */
function sdkVersion(): string | null {
  try {
    // The entry point, then its manifest beside it — NOT `resolve("<pkg>/package.json")`, which
    // throws ERR_PACKAGE_PATH_NOT_EXPORTED: this package's `exports` map lists ".", "./extract",
    // "./browser", "./bridge" and "./sdk-tools", and a manifest that is not exported is not
    // resolvable however obviously it is there.
    const entry = createRequire(import.meta.url).resolve(AGENT_SDK_PACKAGE);
    const manifest = path.join(path.dirname(entry), "package.json");
    return (JSON.parse(fs.readFileSync(manifest, "utf8")).version as string) ?? null;
  } catch {
    return null;
  }
}

export interface SmokeOptions extends ResolveOptions {
  /** Where to run. Defaults to the app's own cwd; nothing is read and nothing is written. */
  cwd?: string;
  timeoutMs?: number;
}

/**
 * Run one query through the SDK and report what came back.
 *
 * The import is dynamic, and that is not laziness about typing — it is what keeps 1.3 MB of SDK off
 * the app's startup path, since a launch that never opens a session should never parse it. It is
 * still a runtime resolution of an EXTERNAL package either way, which is the property this slice is
 * about; `test/isolation.test.ts` asserts the built bundle carries the specifier rather than the
 * source.
 *
 * Never throws. A missing CLI, a failed import (the asar case above), an aborted read loop and a
 * CLI that errors are all outcomes to report, because every one of them is a thing a user could be
 * looking at and the difference between them is the whole diagnostic value.
 */
export async function runAgentSdkSmoke(opts: SmokeOptions = {}): Promise<AgentSdkSmokeResult> {
  const startedAt = Date.now();
  const cwd = opts.cwd ?? process.cwd();
  const cli = resolveClaudeCli(opts);
  const { env, dropped, otherProviderVars } = agentChildEnv(opts);

  const base: AgentSdkSmokeResult = {
    ok: false,
    at: new Date().toISOString(),
    durationMs: 0,
    bin: cli.bin,
    cwd,
    sdkVersion: sdkVersion(),
    cliVersion: null,
    apiKeySource: null,
    billing: "unknown",
    model: null,
    result: null,
    costUsd: null,
    numTurns: null,
    env: {
      dropped,
      otherProviderVars,
      hasPath: Boolean(env.PATH),
      hasApiKey: BILLING_ENV_VARS.some((key) => key in env),
    },
    stderr: "",
    error: null,
  };

  const done = (patch: Partial<AgentSdkSmokeResult>): AgentSdkSmokeResult => ({
    ...base,
    ...patch,
    durationMs: Date.now() - startedAt,
  });

  if (!cli.available || !cli.bin) {
    return done({
      error: `The \`claude\` CLI was not found; looked in ${cli.searched.length} directories. Nothing was spawned.`,
    });
  }

  const stderr: string[] = [];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? SMOKE_TIMEOUT_MS);
  timer.unref?.();

  try {
    // The specifier is a literal, not `AGENT_SDK_PACKAGE`: a variable would type the whole query as
    // `any` and every field read below would stop being checked. It stays external either way.
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    let cliVersion: string | null = null;
    let apiKeySource: string | null = null;
    let model: string | null = null;

    for await (const message of query({
      prompt: SMOKE_PROMPT,
      options: {
        cwd,
        // (3) above: the resolved binary, never the SDK's own PATH lookup or bundled cli.js.
        pathToClaudeCodeExecutable: cli.bin,
        env,
        // No tools at all. `allowedTools` would be the wrong lever — it auto-approves without
        // restricting, and unlisted tools still fall through to a prompt nobody is here to answer.
        tools: [],
        permissionMode: "default",
        // The second door for an API key: one in ~/.claude/settings.json would override the
        // environment built above. Nothing on disk configures this query.
        settingSources: [],
        maxTurns: 1,
        abortController: abort,
        stderr: (chunk: string) => {
          stderr.push(chunk);
          if (stderr.length > 50) stderr.shift();
        },
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        cliVersion = message.claude_code_version ?? null;
        apiKeySource = message.apiKeySource ?? null;
        model = message.model ?? null;
        continue;
      }
      if (message.type === "result") {
        // The read loop ends on the RESULT message, not on the first quiet moment.
        return done({
          ok: message.subtype === "success" && !message.is_error,
          cliVersion,
          apiKeySource,
          billing: billingFrom(apiKeySource),
          model,
          result: message.subtype === "success" ? message.result : null,
          costUsd: message.total_cost_usd ?? null,
          numTurns: message.num_turns ?? null,
          stderr: stderr.join("").trim(),
          error: message.subtype === "success" ? null : `The query ended as ${message.subtype}.`,
        });
      }
    }

    return done({
      cliVersion,
      apiKeySource,
      billing: billingFrom(apiKeySource),
      model,
      stderr: stderr.join("").trim(),
      error: abort.signal.aborted ? "The query timed out." : "The query ended without a result message.",
    });
  } catch (err) {
    return done({
      stderr: stderr.join("").trim(),
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Write a smoke receipt where a human — or a probe driving the packaged app — can read it.
 *
 * This exists because the failure this slice is about is invisible from a terminal: the app has to
 * be launched the way it is actually launched, from a desktop entry with no shell rc sourced, and
 * that launch has no stdout anyone is watching. A file is the only channel back.
 */
export function writeSmokeReceipt(file: string, result: AgentSdkSmokeResult): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// The session — what a previewed invocation actually runs as.
//
// This replaced `spawn("claude", ["-p", "--permission-mode", "acceptEdits", prompt])`. The prompt,
// the working directory and the binary are unchanged and still come from the token `claude-preview.ts`
// issued; what changed is that the host process is now SOMEBODY TO ASK. `acceptEdits` existed only
// because a headless run had nobody — and it granted writes to anything anywhere under the working
// directory, which for a marketplace target is a whole repository. `canUseTool` grants exactly the
// paths the confirmation displayed instead, silently, with no prompt and nothing for the user to
// notice beyond a run that can no longer wander.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The built-in tools a session is offered. Everything absent from this list is absent from the
 * model's context, which costs nothing; a tool that is present and denied costs turns to argue with.
 *
 * `Bash` is gone and can be, because `016` moved `git init` and the first commit into the
 * deterministic scaffold and the create-marketplace prompt now forbids git rather than asking for
 * it. It is also the one tool whose filesystem reach cannot be bounded by inspecting `tool_input` —
 * a path check cannot see what `cd .. && cat` does at runtime — so withholding it is what makes the
 * check below meaningful rather than decorative.
 *
 * `AskUserQuestion` and `Skill` are in SESSION-PANE-PLAN.md's set and deliberately not here: this
 * path is still headless, so a question has nobody to answer it. They arrive with the pane.
 */
export const SESSION_TOOLS = [...READ_ONLY_TOOLS, "Edit", "Write"] as const;

/**
 * Named as forbidden as well as omitted from `SESSION_TOOLS`, and the redundancy is the point:
 * `tools` sets the base list, `disallowedTools` removes a tool from the model's context even if
 * something else would have put it back. `Agent` goes because a subagent's prompts arrive with an
 * `agentID` nothing here disambiguates; `NotebookEdit` because it writes and this app never wants it.
 */
export const SESSION_DISALLOWED_TOOLS = ["Bash", "Agent", "NotebookEdit"] as const;

/** One tool call this session refused, kept so the run can report what it would not do. */
export interface AgentDenial {
  tool: string;
  /** The path it was aimed at, when it named one. */
  path: string | null;
  /** The reason handed back to the model — the same string, so the transcript matches. */
  message: string;
}

export interface AgentSessionRequest {
  /** The prompt the preview built and the confirmation displayed. Never assembled here. */
  prompt: string;
  cwd: string;
  /** The resolved `claude` binary, from the invocation. Never a PATH lookup. */
  bin: string;
  /** Absolute paths this session may write. A directory means anything under it; empty means none. */
  writable: readonly string[];
  /**
   * How to start the CLI.
   *
   * Supplied by the caller rather than left to the SDK because the child must be its own process
   * group: the CLI spawns its own children, and a Stop that signals only the process we started
   * leaves the grandchildren running. `claude-run.ts` owns that, and owns the teardown that goes
   * with it, so the SDK is handed a spawner rather than trusted with a lifecycle.
   */
  spawn: (options: SpawnOptions) => SpawnedProcess;
  /** Output as it arrives — assistant text, tool activity, and the CLI's stderr. */
  output(chunk: ClaudeOutputChunk): void;
  /** Resolution options for the child environment. Tests pass a fake machine; the app passes none. */
  envOptions?: ResolveOptions;
}

/** How a session ended. Never a throw: every failure is one of these. */
export interface AgentSessionResult {
  ok: boolean;
  /** The SDK result message's subtype (`success`, `error_max_turns`, …), or null if none arrived. */
  subtype: string | null;
  /** The final assistant text, as the result message reported it. */
  text: string | null;
  /** Why it is not `ok`. Null on success. */
  error: string | null;
  costUsd: number | null;
  numTurns: number | null;
  sessionId: string | null;
  /** Where the money went, as the CLI reported it on init. */
  billing: AgentBilling;
  /** Everything `canUseTool` refused, in order. */
  denied: AgentDenial[];
}

export interface AgentSession {
  /** Resolves when the session ends. Never rejects. */
  result: Promise<AgentSessionResult>;
  /**
   * End the session and terminate the CLI.
   *
   * Interrupting a turn, aborting the read loop and closing the query are three different things,
   * and only this one releases the child. Idempotent, and safe to call before the dynamic import
   * has even resolved — a close that lands first prevents the query rather than racing it.
   */
  close(): void;
}

/** Text and tool activity out of one assistant message, rendered the way a terminal would show it. */
function renderAssistant(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
    if (block?.type === "tool_use") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      const target = typeof input.file_path === "string" ? input.file_path : "";
      parts.push(`⏺ ${String(block.name)}${target ? `(${target})` : ""}`);
    }
  }
  return parts.filter(Boolean).join("\n");
}

/**
 * Start a session for a previewed invocation and stream what it does.
 *
 * Returns synchronously — the SDK import is dynamic (1.3 MB that a launch which never runs anything
 * should not parse), so the query does not exist yet when this returns, and `close()` is written to
 * cope with being called in that window.
 *
 * Never rejects. A failed import (the asar case at the top of this file), a CLI that cannot be
 * spawned, an aborted read loop and a session that errored are all outcomes to report: each one is
 * a different thing for the user to do next, and collapsing them into a rejection loses that.
 */
export function startAgentSession(request: AgentSessionRequest): AgentSession {
  const { env } = agentChildEnv(request.envOptions);
  const stderr: string[] = [];
  const denied: AgentDenial[] = [];
  let closed = false;
  let query: { close(): void } | null = null;

  const result = (async (): Promise<AgentSessionResult> => {
    const base: AgentSessionResult = {
      ok: false,
      subtype: null,
      text: null,
      error: null,
      costUsd: null,
      numTurns: null,
      sessionId: null,
      billing: "unknown",
      denied,
    };

    try {
      // Literal specifier, not AGENT_SDK_PACKAGE — see the note at `runAgentSdkSmoke`.
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      if (closed) return { ...base, error: "The session was closed before it started." };

      let apiKeySource: string | null = null;
      let sessionId: string | null = null;

      const q = sdk.query({
        prompt: request.prompt,
        options: {
          cwd: request.cwd,
          // The resolved binary, never the SDK's own lookup — see (3) in the box at the top.
          pathToClaudeCodeExecutable: request.bin,
          env,
          spawnClaudeCodeProcess: request.spawn,
          // The base tool set, and the same names forbidden outright. See both constants above.
          tools: [...SESSION_TOOLS],
          disallowedTools: [...SESSION_DISALLOWED_TOOLS],
          // `default`, never `acceptEdits` and never `bypassPermissions`: the callback below is the
          // whole permission model, and a mode that pre-decides would make it unreachable.
          permissionMode: "default",
          // Nothing on disk configures this session — not its permissions, and not where the bill
          // goes. `agentChildEnv` closed the environment door; this is the other one.
          settingSources: [],
          // `claude -p` runs with Claude Code's own system prompt. The SDK does not use it unless
          // asked, and a create-* run that lost it would author against a different set of defaults
          // than the one every prompt in this app was written for.
          systemPrompt: { type: "preset", preset: "claude_code" },
          canUseTool: async (tool, input) => {
            const decision = decideWrite({ tool, input, writable: request.writable, cwd: request.cwd });
            if (decision.behavior === "allow") return { behavior: "allow" };
            const target = typeof input?.file_path === "string" ? input.file_path : null;
            denied.push({ tool, path: target, message: decision.message });
            // Surfaced as stderr rather than swallowed: a run that quietly declined half of what it
            // was asked to do, and then said it was finished, is the failure worth seeing.
            request.output({
              stream: "stderr",
              chunk: `Denied ${tool}${target ? ` ${target}` : ""}: ${decision.message}\n`,
            });
            return decision;
          },
          stderr: (chunk: string) => {
            stderr.push(chunk);
            if (stderr.length > 50) stderr.shift();
            request.output({ stream: "stderr", chunk });
          },
        },
      });
      query = q;
      if (closed) q.close();

      for await (const message of q) {
        if (message.type === "system" && message.subtype === "init") {
          apiKeySource = message.apiKeySource ?? null;
          sessionId = message.session_id ?? null;
          continue;
        }
        if (message.type === "assistant") {
          const text = renderAssistant(message.message?.content);
          if (text) request.output({ stream: "stdout", chunk: `${text}\n` });
          continue;
        }
        if (message.type === "result") {
          return {
            ...base,
            ok: message.subtype === "success" && !message.is_error,
            subtype: message.subtype,
            text: message.subtype === "success" ? message.result : null,
            costUsd: message.total_cost_usd ?? null,
            numTurns: message.num_turns ?? null,
            sessionId: message.session_id ?? sessionId,
            billing: billingFrom(apiKeySource),
            error:
              message.subtype === "success" && !message.is_error
                ? null
                : `The session ended as ${message.subtype}.${stderr.length ? ` ${stderr.join("").trim()}` : ""}`,
          };
        }
      }

      // The loop ends on the RESULT message. Falling out of it means the stream stopped without
      // one, which is a closed query or a child that went away — not a session that finished.
      return {
        ...base,
        sessionId,
        billing: billingFrom(apiKeySource),
        error: closed ? null : "The session ended without a result.",
      };
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) };
    }
  })();

  return {
    result,
    close() {
      closed = true;
      query?.close();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The pane session — the same SDK, driven as a conversation rather than as a job.
//
// `startAgentSession` above takes a `prompt` STRING, which gives a one-shot query: there is no way
// to add a turn to it and no working Stop, because `interrupt()` exists only in streaming-input
// mode. So the pane's session is a sibling of that function over the same options rather than a
// second SDK importer — this module is still the only one in the app that imports the SDK, and
// `test/isolation.test.ts` pins that.
//
// Three things are genuinely new here, and each is load-bearing:
//
//   • **Input is a stream the app yields into.** A queue plus an async generator, closed when the
//     session is disposed. Deciding this later would mean rewriting the message pump.
//   • **A turn is stamped `origin: { kind: "human" }`.** Claude Code treats an unattributed user
//     message differently, and checks that require a human-typed prompt reject it. That is what
//     makes "the user writes the prompts, not the renderer" enforceable at the SDK boundary rather
//     than only in a test.
//   • **A `PreToolUse` hook bounds READS.** `canUseTool` cannot: it fires only for calls that would
//     otherwise prompt, and `Read`/`Glob`/`Grep` never do. The hook fires for every tool call,
//     before the permission flow, so it is the only place a read can be stopped at all.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The tools a PANE session is offered — `SESSION_TOOLS` extended, never a second list.
 *
 * `Skill` arrives here and not in the headless set for the reason `SESSION_TOOLS` states: a session
 * can be asked a follow-up question and a print-mode run cannot. It is also what the deleted help
 * chat is replaced by — that chat asked for `super-help` by pasting its name into a prompt string;
 * the pane declares it as a session skill and lets the model reach it as a tool.
 *
 * `AskUserQuestion` is in SESSION-PANE-PLAN.md's set and is deliberately still absent: nothing in
 * this slice can render a structured question, and a tool that is offered and then refused costs
 * turns to argue with, where one that was never offered costs nothing. It arrives with the
 * question UI in `021`.
 */
export const PANE_TOOLS = [...SESSION_TOOLS, "Skill"] as const;

/**
 * The skills a pane session may reach by name.
 *
 * The four create-\* skills so a conversation can finish the work a form started (`022`/`026` build
 * on that), and `super-help` because it is the one thing the pane inherits from the help chat —
 * now a declared session skill rather than a sentence in a generated prompt.
 */
/**
 * What an outstanding permission request is told when the session goes away underneath it.
 *
 * It reaches the model, not the user — the window is already closing — but it still has to be a
 * real sentence: a deny with an empty message is the one shape the SDK does not define behaviour
 * for, and a run reading its transcript later should be able to tell this apart from a refusal
 * somebody actually meant.
 */
export const TEARDOWN_DENIAL = "The session ended before this could be answered, so it was refused. Nothing was done.";

export const PANE_SKILLS = [
  "create-skill",
  "create-subagent",
  "create-plugin",
  "create-marketplace",
  "super-help",
] as const;

/** What the pane can say about the CLI before a session exists. Resolved here, never in main. */
export interface PaneSessionTarget {
  bin: string | null;
  available: boolean;
  searched: string[];
  /** Set only when `available` is false: what was looked for, and where. */
  unavailable: string | null;
}

/**
 * Where the pane's `claude` would come from.
 *
 * Exists so `src/main/claude-session.ts` does not have to call `resolveClaudeCli` itself: the list
 * of modules that produce a path to the CLI is the list of ways to reach it, `test/isolation.test.ts`
 * asserts it is two modules long, and a session pane is not a reason to make it three.
 */
export function paneSessionTarget(opts: ResolveOptions = {}): PaneSessionTarget {
  const cli = resolveClaudeCli(opts);
  return {
    bin: cli.bin,
    available: cli.available,
    searched: cli.searched,
    unavailable: cli.available ? null : cliNotFoundMessage(cli),
  };
}

export interface PaneSessionRequest {
  /** Where the session runs, and the root of what it can read. */
  cwd: string;
  /** The resolved `claude` binary. Never a PATH lookup — see `paneSessionTarget`. */
  bin: string;
  /**
   * Trees beyond `cwd` this session may read, passed to the SDK as `additionalDirectories` AND used
   * as the boundary the hook enforces. One list, so the disclosure and the check cannot disagree.
   */
  additionalDirectories: readonly string[];
  /**
   * The Maestro plugin's root directory, or null when this build does not ship it.
   *
   * `settingSources: []` loads no installed plugins, so naming a skill in `skills` is not enough
   * to make it resolvable — measured in the window, the `Skill` tool answered "Unknown skill" for
   * every name in `PANE_SKILLS` until the plugin was loaded here. Passing the path is the same
   * trade this app makes everywhere else: what the session gets is what this process handed it,
   * not what a file on disk happened to say.
   */
  pluginDir: string | null;
  /** How to start the CLI — a detached process-group leader, supplied by the caller. */
  spawn: (options: SpawnOptions) => SpawnedProcess;
  /** Everything that happens, in order, as it happens. */
  emit(event: SessionEvent): void;
  envOptions?: ResolveOptions;
}

export interface PaneSession {
  /**
   * Add a turn. The text is the USER'S, verbatim: nothing here wraps it, and nothing may.
   *
   * Returns false when the session has already ended, so the caller can say so rather than dropping
   * the turn into a closed stream.
   */
  say(text: string): boolean;
  /**
   * Answer a parked permission request.
   *
   * False when the id names nothing pending — a click that arrived after the session ended, or a
   * second click on a prompt already answered. Both are ordinary, and neither may park anything.
   */
  answer(requestId: string, answer: PermissionAnswer): boolean;
  /** Request ids still waiting on a person, so a reconnecting UI can re-render them. */
  pendingPermissions(): string[];
  /**
   * Interrupt the turn in flight, leaving the session usable.
   *
   * Resolves with the uuids of queued user messages that SURVIVED the interrupt, when the CLI
   * advertises `interrupt_receipt_v1`. Each of those runs as its own turn afterwards, so a Stop
   * that reported nothing while a message was still queued would be a lie on screen.
   */
  stop(): Promise<{ stillQueued: string[] }>;
  /** End the session and release the CLI. Idempotent, and safe before the import resolves. */
  close(): void;
  /** Resolves when the session is over. Never rejects. */
  ended: Promise<{ error: string | null }>;
}

/**
 * The third argument `canUseTool` is called with, as much of it as this app reads.
 *
 * Declared here rather than imported: the SDK's own `CanUseTool` type would have to be imported as
 * a VALUE-adjacent type from the package this module is the app's only importer of, which is fine —
 * but every field below is optional on older CLIs (`requestId` and `title` are recent additions),
 * and writing them out is what makes the fallbacks at the call site legible.
 */
interface CanUseToolOptions {
  signal?: AbortSignal;
  blockedPath?: string;
  decisionReason?: string;
  /** The CLI's own prompt sentence, when it rendered one. Preferred over reconstructing it. */
  title?: string;
  toolUseID?: string;
  agentID?: string;
  requestId?: string;
}

/** The user turn, in the SDK's own shape. The `origin` is the point — see the block comment above. */
function humanTurn(text: string): {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: null;
  origin: { kind: "human" };
} {
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    origin: { kind: "human" },
  };
}

/**
 * Start a live session and drive it from a stream of user turns.
 *
 * Returns synchronously for the same reason `startAgentSession` does: the SDK import is dynamic, so
 * the query does not exist yet, and `say`/`close` are written to cope with being called in that
 * window — a turn typed before the import resolves is queued, not lost.
 *
 * Never rejects. Every failure is an `ended` event with a reason on it.
 */
export function startPaneSession(request: PaneSessionRequest): PaneSession {
  const { env } = agentChildEnv(request.envOptions);
  const readable = [request.cwd, ...request.additionalDirectories];

  let seq = 0;
  const emit = (event: SessionEventBody): void => request.emit({ ...event, seq: ++seq } as SessionEvent);

  // ── the input pump ────────────────────────────────────────────────────────
  // A queue and one waiting resolver. `say` pushes; the generator below yields. Closing resolves
  // the waiter with `null`, which ends the generator, which ends the query — that is the only
  // orderly way out of a stream the SDK is iterating.
  const queue: Array<ReturnType<typeof humanTurn>> = [];
  let wake: ((value: null) => void) | null = null;
  let closed = false;

  async function* turns() {
    for (;;) {
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (closed) return;
        yield next;
      }
      if (closed) return;
      await new Promise<null>((resolve) => {
        wake = resolve;
      });
    }
  }

  let query: { close(): void; interrupt(): Promise<{ still_queued?: string[] } | undefined> } | null = null;
  let resolveEnded: (value: { error: string | null }) => void = () => {};
  const ended = new Promise<{ error: string | null }>((resolve) => {
    resolveEnded = resolve;
  });

  /** Last-resort key for a CLI too old to send `requestId`. Ascending, so it cannot collide. */
  let askSeq = 0;

  /** The hook output that routes a call into the prompt instead of answering it. */
  const askHook = (reason: string) => ({
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "ask" as const,
      permissionDecisionReason: reason,
    },
  });

  // ── the permission registry ───────────────────────────────────────────────
  // Parked promises, one per outstanding ask. See ./permission-registry.ts for the four things that
  // make it fiddly; the one that matters HERE is that every exit below resolves what it holds.
  const permissions = createPermissionRegistry();

  /**
   * Deny everything outstanding, and tell the UI so it can stop showing questions nobody can answer.
   *
   * Called from `finish` and from `close`, because they are not the same moment: `close()` runs the
   * instant the window goes away, while `finish` waits for the SDK's stream to actually end — which
   * it cannot do while a `canUseTool` promise is still parked. Denying first is what unblocks it.
   */
  const releasePermissions = (message: string): void => {
    for (const requestId of permissions.denyAll(message)) {
      emit({ kind: "permission-resolved", requestId, outcome: "cancelled" });
    }
  };

  const finish = (error: string | null): void => {
    if (!closed) closed = true;
    releasePermissions(TEARDOWN_DENIAL);
    wake?.(null);
    wake = null;
    emit({ kind: "ended", error });
    resolveEnded({ error });
  };

  void (async () => {
    try {
      // Literal specifier, not AGENT_SDK_PACKAGE — see the note at `runAgentSdkSmoke`.
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      if (closed) return finish(null);

      const q = sdk.query({
        prompt: turns(),
        options: {
          cwd: request.cwd,
          pathToClaudeCodeExecutable: request.bin,
          env,
          spawnClaudeCodeProcess: request.spawn,
          // The first time this app passes any: `018` widened nothing, so a run reads its cwd. The
          // same list the boundary hook below checks against.
          additionalDirectories: [...request.additionalDirectories],
          tools: [...PANE_TOOLS],
          disallowedTools: [...SESSION_DISALLOWED_TOOLS],
          // The skills the pane may reach, and the plugin they live in. Both, or neither works —
          // see `PaneSessionRequest.pluginDir`.
          skills: [...PANE_SKILLS],
          plugins: request.pluginDir ? [{ type: "local" as const, path: request.pluginDir }] : [],
          permissionMode: "default",
          // Nothing on disk configures this session — not its permissions, not its skills, and not
          // where the bill goes. Note the consequence: CLAUDE.md files are NOT auto-loaded, since
          // the SDK needs `settingSources` to include 'project' for that. The model can still Read
          // them, and the pane should expect to be told to.
          settingSources: [],
          systemPrompt: { type: "preset", preset: "claude_code" },
          hooks: {
            // THE READ BOUNDARY. `canUseTool` cannot do this: it fires only for calls that would
            // otherwise prompt, and reads never do. This fires for every tool call.
            PreToolUse: [
              {
                hooks: [
                  async (input: unknown) => {
                    const hook = input as { tool_name?: string; tool_input?: Record<string, unknown> };
                    const tool = String(hook.tool_name ?? "");
                    const toolInput = hook.tool_input ?? {};

                    // The network tools reach `canUseTool` only because this says so. They pass
                    // every path check there is — they touch no path — so without a route into the
                    // prompt they are auto-approved, and a `WebFetch` is how the contents of the
                    // project the session can read leave the machine.
                    if ((PANE_ASK_TOOLS as readonly string[]).includes(tool)) {
                      return askHook(`${tool} reaches the network. The app does not decide that for you.`);
                    }

                    // Only where `decideWrite` does not answer. Every write is already answered by
                    // the write scope with a reason the model can act on, and letting the boundary
                    // answer first would replace that reason with a different one.
                    if (!(READ_ONLY_TOOLS as readonly string[]).includes(tool)) return {};

                    const verdict = decideBoundary({
                      tool,
                      input: toolInput,
                      directories: readable,
                      cwd: request.cwd,
                    });
                    if (verdict.decision === "allow") return {};

                    // A call with NO PATH IN IT STAYS A DENY, and it is the only one that does.
                    // There is nothing here for a person to authorise — the call named no file, so
                    // "allow it" would mean allowing an unknown read — and a prompt whose subject
                    // is blank is a prompt answered by reflex.
                    //
                    // This is also why the transcript entry below still exists. Hook denials are
                    // NOT reported through `SDKPermissionDeniedMessage`, so this layer owns its own
                    // entry or the call vanishes: no prompt, no auto-deny event, and a tool that
                    // simply appears to have found nothing.
                    if (!verdict.path) {
                      emit({
                        kind: "refusal",
                        tool,
                        target: null,
                        reason: verdict.reason,
                        source: "read-boundary",
                        decidedBy: null,
                      });
                      return {
                        hookSpecificOutput: {
                          hookEventName: "PreToolUse" as const,
                          permissionDecision: "deny" as const,
                          permissionDecisionReason: verdict.reason,
                        },
                      };
                    }

                    // ROUTED, NOT REFUSED. `"ask"` is what makes a read the boundary stopped reach
                    // `canUseTool` at all: reads are auto-approved and never prompt on their own,
                    // so without this the call is silently allowed or silently denied and the user
                    // is asked nothing. The verdict is spelled "out-of-scope" rather than "deny"
                    // precisely so this stayed the one-word change it was written to be. The
                    // transcript entry then comes from the ANSWER, so a routed read is written down
                    // once rather than twice.
                    return askHook(verdict.reason);
                  },
                ],
              },
            ],
          },
          canUseTool: async (tool: string, input: Record<string, unknown>, options: CanUseToolOptions) => {
            // The SAME engines the form path and the hook use, composed — not a second one.
            // `writable: []` is still the pane's write scope and `decideWrite` still produces the
            // refusal; what `decidePaneCall` adds is the branch where that refusal becomes a
            // question for the user rather than the end of the matter.
            const verdict = decidePaneCall({
              tool,
              input,
              writable: [],
              directories: readable,
              cwd: request.cwd,
            });

            if (verdict.outcome === "settled") {
              if (verdict.decision.behavior === "deny") {
                emit({
                  kind: "refusal",
                  tool,
                  target: targetPathOf(input),
                  reason: verdict.decision.message,
                  source: "write-scope",
                  decidedBy: null,
                });
              }
              return verdict.decision;
            }

            // ── the ask ──────────────────────────────────────────────────────
            // `requestId` is the SDK's own envelope id and therefore the idempotency key: the same
            // request redelivered after a transport gap carries the same one, and the registry
            // resolves the entry that already exists instead of parking a second.
            const requestId = options?.requestId || options?.toolUseID || `${tool}-${++askSeq}`;
            const { fresh, answer } = permissions.request(requestId);
            if (fresh) {
              emit({
                kind: "permission",
                request: {
                  requestId,
                  toolUseId: options?.toolUseID ?? null,
                  tool,
                  agentId: options?.agentID ?? null,
                  // The path the SDK says triggered it, when it named one — it knows about reasons
                  // this app does not, such as a rule matching a path our own check waved through.
                  target: options?.blockedPath ?? verdict.target,
                  reason: permissionReason(verdict.reason, `${tool} needs your permission.`),
                  denyReason: permissionReason(
                    verdict.denyReason,
                    `The user did not allow this ${tool} call. Say what you needed it for instead.`
                  ),
                  decisionReason: options?.decisionReason ?? null,
                  title: options?.title ?? null,
                  detail: verdict.detail,
                },
              });
            }

            const decision = await answer;
            emit({
              kind: "permission-resolved",
              requestId,
              outcome: decision.behavior === "allow" ? "allow" : decision.interrupt === true ? "stop" : "deny",
            });
            if (decision.behavior === "deny") {
              emit({
                kind: "refusal",
                tool,
                target: verdict.target,
                reason: decision.message,
                source: "user",
                decidedBy: null,
              });
            }
            return decision;
          },
          stderr: (chunk: string) => {
            const text = chunk.trim();
            if (text) emit({ kind: "notice", text });
          },
        },
      });
      query = q;
      if (closed) {
        q.close();
        return finish(null);
      }

      for await (const message of q) {
        if (message.type === "assistant") {
          for (const event of assistantEvents(message.message?.content)) emit(event);
          continue;
        }
        if (message.type === "system" && message.subtype === "permission_denied") {
          // THE OTHER DENIAL ROUTE, and it shares no code with the two above. The permission system
          // auto-denies some calls without ever reaching `canUseTool` — a deny RULE, or the mode —
          // and says so only here. Without this branch those calls are invisible: no prompt, no
          // refusal, and a tool that looks like it did nothing. `decision_reason_type` is the
          // discriminator naming which component decided, and the transcript shows it, because
          // "a rule refused this" and "the model's own classifier refused this" are different
          // things for the user to do something about.
          emit(autoRefusal(message));
          continue;
        }
        if (message.type === "result") {
          // A turn ended — NOT the session. A streaming-input query emits one result per turn and
          // keeps running, which is exactly why the pump above stays open.
          emit({
            kind: "turn",
            ok: message.subtype === "success" && !message.is_error,
            error: message.subtype === "success" && !message.is_error ? null : `The turn ended as ${message.subtype}.`,
            costUsd: message.total_cost_usd ?? null,
          });
        }
      }
      finish(null);
    } catch (err) {
      finish(err instanceof Error ? err.message : String(err));
    }
  })();

  return {
    ended,
    say(text: string): boolean {
      if (closed) return false;
      queue.push(humanTurn(text));
      wake?.(null);
      wake = null;
      return true;
    },
    answer(requestId: string, decision: PermissionAnswer): boolean {
      return permissions.answer(requestId, decision);
    },
    pendingPermissions(): string[] {
      return permissions.pending();
    },
    async stop(): Promise<{ stillQueued: string[] }> {
      try {
        // THE RECEIPT IS READ, not discarded. On a CLI advertising `interrupt_receipt_v1` this
        // resolves with the uuids of queued user messages the interrupt did NOT reach — each of
        // which runs as its own turn immediately afterwards. Dropping it made Stop claim to have
        // stopped a session that was about to start talking again.
        const receipt = await query?.interrupt();
        return { stillQueued: receipt?.still_queued ?? [] };
      } catch {
        /* nothing in flight, or a CLI that does not answer — Stop still tears down above */
        return { stillQueued: [] };
      }
    },
    close(): void {
      closed = true;
      // BEFORE the query is closed, not after: a `canUseTool` promise parked on a prompt nobody is
      // left to answer holds the SDK's read loop open, and with it the detached child. This is the
      // window-close / project-switch / quit path, and it is the one with no user action to hang a
      // resolution off.
      releasePermissions(TEARDOWN_DENIAL);
      wake?.(null);
      wake = null;
      query?.close();
    },
  };
}

/** Assistant text and tool calls, as separate transcript entries rather than one rendered string. */
function assistantEvents(content: unknown): SessionEventBody[] {
  if (!Array.isArray(content)) return [];
  const events: SessionEventBody[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
      events.push({ kind: "assistant", text: block.text });
    }
    if (block?.type === "tool_use") {
      const input = (block.input ?? {}) as Record<string, unknown>;
      // The humanizer in the renderer renders `Tool(target)`; what counts as the target differs per
      // tool, and picking it here keeps the renderer from learning tool-input shapes.
      const target =
        targetPathOf(input) ??
        (typeof input.pattern === "string"
          ? input.pattern
          : typeof input.command === "string"
            ? input.command
            : typeof input.skill === "string"
              ? input.skill
              : null);
      events.push({ kind: "tool", tool: String(block.name), target });
    }
  }
  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// The settings cascade — what a run will ACTUALLY be configured with.
// ─────────────────────────────────────────────────────────────────────────────

/** The shape of a `permissions` block, normalised. Absent lists become empty ones, never undefined. */
function permissionsOf(settings: { permissions?: Record<string, unknown> } | undefined): SettingsPermissions {
  const p = settings?.permissions ?? {};
  const list = (key: string): string[] => (Array.isArray(p[key]) ? (p[key] as unknown[]).map(String) : []);
  const mode = p.defaultMode;
  return {
    additionalDirectories: list("additionalDirectories"),
    allow: list("allow"),
    deny: list("deny"),
    ask: list("ask"),
    defaultMode: typeof mode === "string" ? mode : null,
  };
}

/** The SDK's `ResolvedSettingSource` is our `SettingsTier` — asserted rather than assumed. */
function tierOf(source: string): SettingsTier | null {
  return source === "user" || source === "project" || source === "local" || source === "managed" || source === "flag"
    ? source
    : null;
}

/**
 * Resolve the settings a run in `cwd` would actually see, through the CLI's own merge engine.
 *
 * `resolveSettings` is the reason this disclosure can claim to be true rather than plausible. The
 * alternative was to read `~/.claude/settings.json` and the project's two files here and merge them
 * ourselves — a second implementation of a cascade the CLI owns, drifting silently the first time
 * a tier or a precedence rule changes. Same argument as `ccusage`: do not become a second reader of
 * someone else's format.
 *
 * Three things about the call are deliberate:
 *
 *   • **`settingSources` matches the session's**, and that is the whole reason this function has to
 *     be edited whenever `startAgentSession` is. It was left UNSET while a run was `claude -p`,
 *     because an unset value loads every tier and that is what such a run got. A run is now an SDK
 *     session configured entirely by this app, so `[]` is passed here for the same reason it is
 *     passed there: the disclosure describes the session that exists. Note what `[]` does NOT drop —
 *     the managed (administrator) policy tier is still read from disk, so an admin deny rule still
 *     appears, and still applies.
 *   • **`defaultMode` goes through `filterEscalatingDefaultMode`.** The raw cascade reports an
 *     escalating mode from a repo-committed file as though it applied; the CLI does not honour it
 *     without a trust check. Reporting the unfiltered value would overstate what a run can do.
 *   • **It spawns no `claude`.** It may shell out to `plutil`/`reg.exe` on a machine with MDM
 *     policy — which is why this lives in `agent-sdk.ts` behind a port, and not somewhere
 *     `claude-preview.ts` can import.
 */
export async function resolveEffectiveSettings(cwd: string): Promise<EffectiveSettingsSnapshot> {
  // Literal specifier, not AGENT_SDK_PACKAGE — see the note at the query above.
  const { resolveSettings, filterEscalatingDefaultMode } = await import("@anthropic-ai/claude-agent-sdk");
  const resolved = await resolveSettings({ cwd, settingSources: [] });

  const sources: SettingsSourceInfo[] = [];
  for (const entry of resolved.sources) {
    const tier = tierOf(entry.source);
    if (!tier) continue;
    sources.push({ tier, path: entry.path ?? null, permissions: permissionsOf(entry.settings) });
  }

  return {
    sources,
    effective: {
      ...permissionsOf(resolved.effective),
      defaultMode: permissionsOf(filterEscalatingDefaultMode(resolved)).defaultMode,
    },
  };
}

/**
 * The `SettingsPort` the composition root hands to the preview.
 *
 * A one-line factory rather than the function itself, so that what `src/main/ipc.ts` passes reads
 * the same as `nodeGit()` beside it: a capability being supplied, at the one place in the app that
 * is allowed to supply capabilities.
 */
export function nodeSettings(): SettingsPort {
  return { resolve: (cwd) => resolveEffectiveSettings(cwd) };
}
