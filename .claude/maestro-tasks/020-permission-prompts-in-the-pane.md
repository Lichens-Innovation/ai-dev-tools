# Permission prompts in the pane

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The pane asks before it acts. Read the "The permission model" section of `SESSION-PANE-PLAN.md`;
the requirements there are precise and several of them are easy to miss.

A permission request parks a promise in the main process and resolves it when the user answers.
That registry is the fiddly part:

- **Idempotent per request.** A request whose answer was lost across a transport gap is delivered
  again. Resolving the existing entry is correct; creating a second pending one leaks.
- **Every teardown path resolves outstanding asks, denying them.** Prompts do not time out. There is
  no backstop, and an unresolved ask is a permanently wedged session holding a child process.
- **A fall-through must be impossible.** Returning nothing from the callback is a real value meaning
  "I answered out of band", and it blocks the tool call forever. Type the resolution so it cannot
  happen by accident.

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

## Acceptance criteria

- [ ] A fetch raises a prompt showing the complete URL; Deny refuses it and the model continues; Stop ends the turn
- [ ] Denials require a reason, and the UI never sends an empty one
- [ ] The same request delivered twice resolves once — one prompt, no leaked entry
- [ ] Closing the window, switching projects, or quitting with a prompt outstanding resolves it as denied and leaves no surviving process
- [ ] A rule-denied or mode-denied call appears in the transcript with the reason its discriminator gives
- [ ] A boundary-hook-denied call also appears in the transcript — asserted separately, since it arrives by a different route
- [ ] A pending prompt is visible and answerable from any route
- [ ] Prompts render per tool rather than as a payload dump

## Blocked by

- `019-a-live-session-in-the-pane.md`
