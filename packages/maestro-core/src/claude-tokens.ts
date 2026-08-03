// The token contract between preview and run.
//
// This is the whole security design of the bridge in one file, so it is worth stating plainly:
//
//   `run` takes a token AND NOTHING ELSE.
//
// Not a token plus a prompt to check against it, not a token plus an argv to validate — a token,
// which names an invocation this process built and handed to the UI. There is consequently no
// argument a caller could pass that would make the run differ from what the preview returned, and
// nothing to get the validation of subtly wrong. The property that buys: *the only executable
// prompts are ones the user was shown*. A renderer bug — or a compromised renderer — cannot invent
// a prompt and execute it, because inventing a prompt is not something the run channel accepts.
//
// Three further rules, each closing a way a token could outlive its meaning:
//
//   • **Single use.** Claiming a token consumes it. A replayed token is refused, so a run cannot be
//     re-triggered from a stale message.
//   • **Expiry.** A preview is a snapshot of a decision the user made; ten minutes later the files
//     it describes may not be the files on disk. An old token is refused rather than run against a
//     changed project.
//   • **Process-local.** Tokens live in this process's memory and die with it. Nothing is persisted,
//     so no token survives a restart to be replayed against a different project.
//
// Refusals carry a reason the UI can show. "Refused" with no explanation is indistinguishable from
// a bug, and the user's next move (preview again) has to be obvious.

import { randomUUID } from "node:crypto";

/** How long a preview stays runnable. Long enough to read the prompt, short enough to still mean it. */
export const TOKEN_TTL_MS = 10 * 60 * 1000;

/** Exactly what will be spawned. Built by preview, never by a caller. */
export interface ClaudeInvocation {
  token: string;
  /** Absolute path of the resolved CLI — argv[0]. */
  bin: string;
  /** Arguments after the binary, including the prompt. */
  args: string[];
  cwd: string;
  /** The prompt as shown to the user; also present inside `args`. */
  prompt: string;
  createdAt: number;
  expiresAt: number;
}

const invocations = new Map<string, ClaudeInvocation>();

/** Thrown when a run request does not carry a token this process issued. */
export class TokenRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRefused";
  }
}

function evictExpired(now: number): void {
  for (const [token, inv] of invocations) if (inv.expiresAt <= now) invocations.delete(token);
}

/** Record an invocation preview built, and return the token that can run it exactly once. */
export function issueInvocation(inv: Omit<ClaudeInvocation, "token" | "createdAt" | "expiresAt">): ClaudeInvocation {
  const now = Date.now();
  evictExpired(now);
  const issued: ClaudeInvocation = {
    ...inv,
    token: randomUUID(),
    createdAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  };
  invocations.set(issued.token, issued);
  return issued;
}

/**
 * Take the invocation a token names, consuming it.
 *
 * Throws `TokenRefused` for anything that isn't a live, unused token from this process. The four
 * cases are distinguished because they mean different things to the user: a forged token is a bug
 * worth reporting, an expired one just needs previewing again.
 */
export function claimInvocation(token: unknown): ClaudeInvocation {
  if (typeof token !== "string" || token.length === 0) {
    throw new TokenRefused(
      "Refused: this run carried no preview token. Every run must come from a preview the user confirmed."
    );
  }
  const inv = invocations.get(token);
  if (!inv) {
    throw new TokenRefused(
      "Refused: no preview matches this token. It was never issued, or it has already run — preview again and confirm the prompt."
    );
  }
  // Consumed either way: a token that reaches this point is spent, expired or not, so no path
  // leaves a claimable token behind.
  invocations.delete(token);
  if (inv.expiresAt <= Date.now()) {
    throw new TokenRefused(
      "This preview expired. The project may have changed since it was built — preview again and confirm the prompt."
    );
  }
  return inv;
}

/** Drop every outstanding token. Tests use it; so does a project switch, which invalidates every cwd. */
export function clearInvocations(): void {
  invocations.clear();
}
