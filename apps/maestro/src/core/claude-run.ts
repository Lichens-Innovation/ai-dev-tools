// Run — the only module in the app that starts a Claude process, and it will not start one
// without a token `claude-preview.ts` issued.
//
// The entry point takes a token and a sink for output. It does not take a prompt, an argv, a cwd,
// or any other way to influence what runs: those come out of the invocation the token names. A
// caller therefore cannot express "run this other thing", which is a stronger guarantee than
// validating that they didn't (see `claude-tokens.ts` for why the argument list is the design).
//
// Two operational properties the UI depends on:
//
//   • **Output streams.** A create-a-skill run is tens of seconds and a task run is minutes. The
//     result is delivered as it arrives, not accumulated and handed over at the end, because a
//     window with nothing in it is indistinguishable from a window that has hung.
//   • **Cancel actually kills.** The child is spawned into its own process group and the group is
//     signalled, because the CLI spawns its own children — signalling only the parent leaves the
//     grandchildren running and the "stopped" run still burning tokens.

import { spawn, type ChildProcess } from "node:child_process";
import { claimInvocation, TokenRefused } from "./claude-tokens.js";
import { claudeChildPath } from "./claude-cli.js";
import type { ClaudeOutputChunk, ClaudeRunResult } from "./contracts.js";

export { TokenRefused };
export type { ClaudeOutputChunk, ClaudeRunResult };

/**
 * How much output is retained for the result. Streaming is unbounded — every chunk reaches the UI
 * as it arrives — but a run that prints a megabyte a second must not grow the main process's heap
 * without limit. The TAIL is kept: the end of a failing run is the part that says why.
 */
const RETAINED_OUTPUT_BYTES = 512 * 1024;

/** Grace between asking the process group to stop and insisting. */
const SIGKILL_AFTER_MS = 5000;

interface ActiveRun {
  child: ChildProcess;
  /** Set by `cancelClaudeRun`, so the exit is reported as a cancellation and not as a crash. */
  cancelled: boolean;
  killTimer: ReturnType<typeof setTimeout> | null;
}

/** Keyed by the token that authorised the run — the id both sides of the IPC already hold. */
const active = new Map<string, ActiveRun>();

export interface ClaudeRunEvents {
  /** Called for every chunk, as it arrives. */
  output(chunk: ClaudeOutputChunk): void;
}

/** Append with a cap, keeping the tail. */
function appendCapped(buffer: string, chunk: string): { text: string; truncated: boolean } {
  const text = buffer + chunk;
  if (text.length <= RETAINED_OUTPUT_BYTES) return { text, truncated: false };
  return { text: text.slice(text.length - RETAINED_OUTPUT_BYTES), truncated: true };
}

/**
 * Signal the whole process group.
 *
 * `detached: true` at spawn makes the child a group leader, so `process.kill(-pid)` reaches it and
 * everything it started. Falling back to the plain pid matters on platforms where the negative-pid
 * form isn't supported — a cancel that silently does nothing is worse than a noisy one.
 */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Run the invocation a token authorises, streaming its output, and resolve with how it ended.
 *
 * Throws `TokenRefused` — synchronously, before anything is spawned — for a forged, replayed or
 * expired token. Every other failure is a resolved `ClaudeRunResult`: a CLI that exits non-zero and
 * a CLI that could not be executed are both outcomes the user needs reported with their output,
 * not exceptions that reach the UI as a bare string.
 */
export async function runPreviewedClaude(token: unknown, events: ClaudeRunEvents): Promise<ClaudeRunResult> {
  // `async`, but the claim is still the first thing that happens and still happens before any
  // spawn — a refused token rejects the returned promise rather than throwing at the call site,
  // which is what an `await` in an IPC handler can actually catch.
  // "claude": a token issued by the usage-stats preview names an `npx`/`ccusage` invocation, and
  // claiming it here would spawn that while every message on screen said Claude.
  const inv = claimInvocation(token, "claude");
  const startedAt = Date.now();
  const argv = [inv.bin, ...inv.args];

  return new Promise<ClaudeRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const child = spawn(inv.bin, inv.args, {
      cwd: inv.cwd,
      // The child inherits our environment plus the PATH this app resolved for itself. A GUI
      // launch hands us a PATH that may not even contain `node`, and the CLI shells out.
      env: { ...process.env, PATH: claudeChildPath() },
      // Its own process group, so cancelling can reach the CLI's children too.
      detached: true,
      // stdin closed: headless `-p` reads its prompt from argv, and an inherited stdin would leave
      // a run waiting on input nobody can supply.
      stdio: ["ignore", "pipe", "pipe"],
    });

    const entry: ActiveRun = { child, cancelled: false, killTimer: null };
    active.set(inv.token, entry);

    const finish = (
      result: Omit<ClaudeRunResult, "stdout" | "stderr" | "truncated" | "durationMs" | "argv" | "cwd">
    ) => {
      if (settled) return;
      settled = true;
      if (entry.killTimer) clearTimeout(entry.killTimer);
      active.delete(inv.token);
      resolve({
        ...result,
        stdout,
        stderr,
        truncated,
        durationMs: Date.now() - startedAt,
        argv,
        cwd: inv.cwd,
      });
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      const next = appendCapped(stdout, chunk);
      stdout = next.text;
      truncated = truncated || next.truncated;
      events.output({ stream: "stdout", chunk });
    });

    child.stderr?.on("data", (chunk: string) => {
      const next = appendCapped(stderr, chunk);
      stderr = next.text;
      truncated = truncated || next.truncated;
      events.output({ stream: "stderr", chunk });
    });

    // Spawn-level failure: the binary vanished between preview and Run, or is not executable.
    // Reported as a crash naming the path, never as a raw ENOENT — "spawn ENOENT" tells a user
    // nothing about which file was missing.
    child.on("error", (err: NodeJS.ErrnoException) => {
      const reason =
        err.code === "ENOENT"
          ? `Could not run ${inv.bin} — the file is no longer there. It was found when the prompt was previewed.`
          : err.code === "EACCES"
            ? `Could not run ${inv.bin} — it is not executable.`
            : `Could not run ${inv.bin}: ${err.message}`;
      finish({ outcome: "crashed", code: null, signal: null, error: reason });
    });

    child.on("close", (code, signal) => {
      if (entry.cancelled) {
        finish({ outcome: "cancelled", code, signal, error: null });
        return;
      }
      if (signal) {
        // Killed by something that wasn't us — OOM, a shutdown, a stray kill. That is a different
        // event from "the CLI decided this request failed", and is labelled as one.
        finish({
          outcome: "crashed",
          code,
          signal,
          error: `The Claude CLI was terminated by ${signal}.`,
        });
        return;
      }
      finish({ outcome: code === 0 ? "ok" : "failed", code, signal: null, error: null });
    });
  });
}

/**
 * Stop a run. Returns false when there is nothing running under that token.
 *
 * SIGTERM first so the CLI can finish its current write, then SIGKILL if it is still there — a
 * Stop button that leaves the process alive is the failure this exists to prevent, so the escalation
 * is not optional.
 */
export function cancelClaudeRun(token: string): boolean {
  const entry = active.get(token);
  if (!entry) return false;
  entry.cancelled = true;
  signalGroup(entry.child, "SIGTERM");
  if (!entry.killTimer) {
    entry.killTimer = setTimeout(() => signalGroup(entry.child, "SIGKILL"), SIGKILL_AFTER_MS);
    entry.killTimer.unref?.();
  }
  return true;
}

/**
 * Kill every run in flight. Called when the app quits: a detached process group outlives its
 * parent by design, so without this a closed window leaves Claude running against the user's repo.
 */
export function disposeClaudeRuns(): void {
  for (const token of [...active.keys()]) cancelClaudeRun(token);
}
