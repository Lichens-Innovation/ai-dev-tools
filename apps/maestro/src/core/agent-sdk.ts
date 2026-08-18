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
// Nothing here is user-facing yet. `runAgentSdkSmoke` exists to prove, on the machine the app is
// actually installed on, that a query runs at all — see SESSION-PANE-PLAN.md, of which this is the
// first slice.
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
import { resolveClaudeCli, claudeChildPath, type ResolveOptions } from "./claude-cli.js";

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
