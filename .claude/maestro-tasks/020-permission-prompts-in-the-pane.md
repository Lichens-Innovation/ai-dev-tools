# Permission prompts in the pane

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The pane asks before it acts. Read the "The permission model" section of `SESSION-PANE-PLAN.md`;
the requirements there are precise and several of them are easy to miss.

**This slice is the UI, not the engine.** `018` built the engine where it needed no interface:
`decideWrite` in `src/core/write-scope.ts` is the decision — pure, no `fs`, exhaustively tested —
and `startAgentSession()` already wires it to the SDK as `canUseTool`. What is missing is the branch
where the answer comes from a person instead of from the path list. Extend that callback and the
`WriteDecision` union; **do not stand up a second permission engine beside it**, or the form path and
the pane path will end up with different authority, which is the one thing
`SESSION-PANE-PLAN.md`'s "two write paths" section rules out.

Two of the requirements below are therefore already met on the form path and must survive here:
`WriteDecision` is a two-shape union whose fall-through is a **deny**, so returning `undefined`/`null`
is already unrepresentable; and every deny already carries a reason the model reads and adapts to.

### What `019` already built, and what it deliberately did not

The pane, the transcript and the boundary hook all exist. This slice is smaller than it reads.

- **The `PreToolUse` boundary hook is built, and it denies rather than asks.** `src/core/session-scope.ts`
  is the decision — `decideBoundary` / `boundaryTargetOf` / `BOUNDED_TOOLS` / `UNBOUNDED_TOOLS`, pure,
  with exhaustive tests in `test/core/session-scope.test.ts`. It returns `{ decision: "allow" }` or
  `{ decision: "out-of-scope", path, reason }` — **deliberately not the word `"deny"`**, because
  `agent-sdk.ts` is the only place that translates it, and it currently maps it to
  `permissionDecision: "deny"`. Routing an out-of-scope read into the prompt UI is **one word there**
  plus the UI on this side of the wire. Do not rewrite the module.
- **The hook runs only over the read-only tools, and must keep doing so.** `019` also required that a
  refused write carry `decideWrite`'s reason rather than a new one, and letting the boundary answer
  first would have replaced it. `session-scope.ts` knows how to check write tools too, so widening
  what it is wired to is a live hazard rather than a theoretical one.
- **The stream, the channel and the single owner exist.** `SessionEvent` / `SessionEventBody` are in
  `src/core/contracts.ts`, `session:event` is the push channel, and
  `renderer/src/utils/session-context.tsx` is the **only** module in the renderer allowed to touch
  `window.maestro.session`. A pending prompt is another `SessionEventBody` variant and another
  handler beside `session:start/info/say/stop/end` — not a second subscriber, which would steal the
  session the way a second log subscriber steals the tail.
- **The teardown paths that must resolve outstanding asks already exist and are already called.**
  `announce()` calls `endAllSessions()` on a project switch; `disposeIpc()` calls `disposeSessions()`;
  the escalation is `terminateChildGroup()`, shared with `cancelClaudeRun`. Each is a place an
  unresolved parked promise would wedge a session — they are the hooks to hang the default denial on,
  not new work.
- **Stop already exists as its own control.** `session:stop` interrupts the turn and leaves the
  session usable, verified live. That is one of the two controls this slice needs; the `interrupt: true`
  deny is the other. Note that `stop()` currently **awaits `query.interrupt()` and discards the
  result**, so a `still_queued` receipt reaches nothing — surface it here or leave it explicitly to
  `024`, but do not leave it unnoticed.
- **No question can arrive through the callback yet.** `AskUserQuestion` is not in `PANE_TOOLS`
  (`019` added only `Skill`), so the branch for it is `021`'s, not this slice's.

A permission request parks a promise in the main process and resolves it when the user answers.
That registry is the fiddly part:

- **Idempotent per request.** A request whose answer was lost across a transport gap is delivered
  again. Resolving the existing entry is correct; creating a second pending one leaks.
- **Every teardown path resolves outstanding asks, denying them.** Prompts do not time out. There is
  no backstop, and an unresolved ask is a permanently wedged session holding a child process.
- **A fall-through must be impossible.** Returning nothing from the callback is a real value meaning
  "I answered out of band", and it blocks the tool call forever. Type the resolution so it cannot
  happen by accident — `WriteDecision` in `src/core/write-scope.ts` already is that type, and
  widening it for the pane must not open the hole back up.

**Deny and Stop are two controls, not one.** A plain denial refuses the call and lets the model
adapt — measured behaviour, not hope: it will try something else and finish the job. Stopping the
turn is a different intent. Collapsing them picks one on the user's behalf. Every denial carries a
reason, and the reason is the only channel for steering, so the UI must always produce a real one
rather than an empty string.

**Prompts render per tool.** A path and a diff for a write; the **complete** URL, query string
included, for a fetch — never elided to a hostname, because the pane can read the user's project and
an outbound request is how its contents leave. A generic payload dump is technically correct and
practically useless: users click Allow blindly, which is worse than pre-accepting, because it looks
like consent. Use what the request carries — the triggering path, the reason it triggered, and which
agent asked — rather than rendering the raw input.

**Two denial paths must both reach the transcript**, and they arrive differently. Denials from rules
or modes are announced on the message stream with a discriminator saying which component decided.
Denials issued by the boundary hook are **not** — that layer has to write its own transcript
entries. Building only the first makes hook-denied calls vanish silently, which is the worse half,
because the gap stays invisible until someone wonders why a tool did nothing.

A prompt can arrive while the user is on another route, so it must be answerable from wherever they
are and impossible to miss.

When a prompt has to name what the session may already reach, use the shapes `017` added —
`ClaudeReadScope` and `ClaudePermissionRule` in `src/core/contracts.ts`, which already carry each
value's tier and originating file. A prompt that re-derives that list will disagree with the one the
header and the confirmation are showing.

## Acceptance criteria

- [ ] A fetch raises a prompt showing the complete URL; Deny refuses it and the model continues; Stop ends the turn
- [ ] Denials require a reason, and the UI never sends an empty one
- [ ] The same request delivered twice resolves once — one prompt, no leaked entry
- [ ] Closing the window, switching projects, or quitting with a prompt outstanding resolves it as denied and leaves no surviving process
- [ ] A rule-denied or mode-denied call appears in the transcript with the reason its discriminator gives
- [ ] A boundary-hook-denied call also appears in the transcript — asserted separately, since it arrives by a different route
- [ ] A pending prompt is visible and answerable from any route
- [ ] Prompts render per tool rather than as a payload dump
- [ ] The form path still runs unprompted and unchanged — one engine, two callers, and `018`'s isolation pins still hold

## Blocked by

- `019-a-live-session-in-the-pane.md`
