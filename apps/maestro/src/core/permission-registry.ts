// The parked promises — a permission request that is waiting on a person, and every way it ends.
//
// `canUseTool` returns a `Promise`. When the answer has to come from a user, the host parks that
// promise, pushes the question to the renderer, and resolves it when the answer comes back. That is
// three lines of intent and four requirements that are individually easy to miss, so they live here
// with tests rather than inline in the session:
//
//   • **IDEMPOTENT PER REQUEST ID.** A request whose response was lost across a transport gap IS
//     DISPATCHED AGAIN — by `reinitialize()`, and by any `initialize` to a running session, whose
//     response carries `pending_permission_requests` the SDK re-dispatches for you. Returning the
//     promise that already exists is correct; parking a second one beside it leaks an entry the UI
//     has nothing left to answer with, and the tool call it belongs to never returns.
//   • **A REDELIVERY AFTER THE ANSWER STILL NEEDS THE ANSWER.** The prompt is gone from the screen
//     by then, so a fresh park would wait forever. Settled answers are remembered (bounded) and
//     replayed.
//   • **EVERY EXIT RESOLVES EVERYTHING OUTSTANDING, AS A DENY.** Window close, project switch,
//     quit. There is no backstop anywhere below this: permission prompts do not time out, and an
//     unresolved ask is a permanently wedged session holding a detached child process.
//   • **NOTHING RESOLVES TO `undefined`.** `PermissionAnswer` is a two-shape union whose fall-through
//     is a deny, and this module never widens it — the SDK reads a missing answer as "the host
//     replied out of band" and then writes no `control_response` at all.
//
// PURE — a map and some promises. No `fs`, no SDK, no Electron, so the leak cases can be provoked
// in a unit test instead of hoped about.

import type { PermissionAnswer } from "./contracts.js";

/**
 * How many answered requests are remembered for replay.
 *
 * Bounded because this is a cache for a transport gap, not a history: the interesting window is the
 * few seconds around a reconnect, and an unbounded map keyed by request id grows for the life of a
 * session that could run all day.
 */
const SETTLED_CAP = 64;

/** What `request()` gives back: the answer, and whether this is the first time it was asked. */
export interface PermissionRequestHandle {
  /**
   * False when this request id has been seen before — a redelivery. The caller must NOT show a
   * second prompt for it; the promise below is the original one, or the answer it already got.
   */
  fresh: boolean;
  answer: Promise<PermissionAnswer>;
}

export interface PermissionRegistry {
  /** Park a request, or re-attach to one already parked or already answered. */
  request(requestId: string): PermissionRequestHandle;
  /** Resolve a parked request. False when the id names nothing pending — a late or duplicate click. */
  answer(requestId: string, answer: PermissionAnswer): boolean;
  /** The ids still waiting on a person, in the order they arrived. */
  pending(): string[];
  /**
   * Deny everything outstanding and return the ids that were resolved.
   *
   * The teardown path. Called from every exit, and safe to call repeatedly: a registry with nothing
   * pending returns an empty list and does nothing.
   */
  denyAll(message: string): string[];
}

export function createPermissionRegistry(): PermissionRegistry {
  const pending = new Map<string, { answer: Promise<PermissionAnswer>; resolve: (a: PermissionAnswer) => void }>();
  const settled = new Map<string, PermissionAnswer>();

  const remember = (requestId: string, answer: PermissionAnswer): void => {
    settled.set(requestId, answer);
    // Insertion-ordered, so the first key is the oldest.
    while (settled.size > SETTLED_CAP) settled.delete(settled.keys().next().value as string);
  };

  return {
    request(requestId: string): PermissionRequestHandle {
      const already = pending.get(requestId);
      if (already) return { fresh: false, answer: already.answer };

      const recorded = settled.get(requestId);
      if (recorded) return { fresh: false, answer: Promise.resolve(recorded) };

      let resolve!: (a: PermissionAnswer) => void;
      const answer = new Promise<PermissionAnswer>((r) => {
        resolve = r;
      });
      pending.set(requestId, { answer, resolve });
      return { fresh: true, answer };
    },

    answer(requestId: string, answer: PermissionAnswer): boolean {
      const entry = pending.get(requestId);
      if (!entry) return false;
      pending.delete(requestId);
      remember(requestId, answer);
      entry.resolve(answer);
      return true;
    },

    pending(): string[] {
      return [...pending.keys()];
    },

    denyAll(message: string): string[] {
      const ids = [...pending.keys()];
      for (const id of ids) {
        const entry = pending.get(id)!;
        pending.delete(id);
        const answer: PermissionAnswer = { behavior: "deny", message };
        remember(id, answer);
        entry.resolve(answer);
      }
      return ids;
    },
  };
}
