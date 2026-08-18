# A budget ceiling you can continue past

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

A conversational pane has no natural end, and a measured 25-turn exploration cost $1.43 against a
$1.50 ceiling. Read that as subscription quota, not an invoice — but an always-on pane consumes it
far faster than one-shot runs did, and the surface that replaced the help chat has lost the chat's
natural per-message bound.

Give the session a spend ceiling, and give the ceiling a door.

**The naive version defeats itself.** Reaching the ceiling ends the query — which on a conversation
means the session is over. So the transcript is lost, users raise the ceiling until it never fires,
and it stops being a control at all. Instead: the budget fires, the session ends cleanly, and the
pane says what was spent and offers to continue — resuming the same session with a fresh allowance.
The transcript survives, the user re-consents to spending, and the ceiling can be set genuinely low,
which is the only condition under which it does its job.

Pair the hard ceiling with a budget the **model** is told about, so it paces itself and wraps up
rather than being cut off. For a session that might be mid-write when the limit lands, finishing is
a materially better failure mode than stopping.

Two honesty requirements. The ceiling is compared against a client-side **estimate** with known
accuracy limits, so present it as an approximation rather than an accounting figure. And a turn
limit is worth setting alongside it as a cruder brake on a loop that is cheap per turn but does not
converge.

Some of the plumbing is already there and should not be re-derived: `018`'s `AgentSessionResult`
already carries `costUsd`, `numTurns` and `sessionId` off the SDK's own result message, and `billing`
off its init message. That is the end-of-session figure; what this slice adds is the running one and
the ceiling. `sessionId` is also what **Continue** resumes against, and what `025` lists.

### What `019` already built, and what it deliberately did not

- **`019` passed nothing budget-related at all**, and this slice owns every one of them: no
  `maxBudgetUsd`, no `taskBudget`, no `effort`, no `enableFileCheckpointing`, no `persistSession`.
  `startPaneSession()` in `src/core/agent-sdk.ts` is the single place they go in — extend that
  options object rather than adding a second session builder; it is a sibling of `startAgentSession`
  over the same options and `agent-sdk.ts` is still the only module in the app that imports the SDK.
- **`startPaneSession` simply ends the session when the SDK stream ends.** So the end path exists but
  carries no reason a UI could branch on. "The budget fires, the session ends cleanly, and the pane
  offers Continue" needs the ending to say _why_ — that distinction is new work, and it is the
  difference between a door and a crash.
- **The surfaces to render on already exist.** `SessionInfo` and `session:info` are there to carry
  spend-to-date, `session:event` is the stream to push it on, and the pane header is where `019` put
  the read-scope disclosure — that is where an effort level and a model selector belong.
- **`interrupt()`'s receipt is no longer discarded — `020` picked it up, and this slice does not own
  it.** `stop()` in `src/core/agent-sdk.ts` returns `{ stillQueued }` off the `query.interrupt()`
  receipt, and `stopSession` in `src/main/claude-session.ts` emits a `notice` when the interrupt left
  messages queued. `SESSION-PANE-PLAN.md`'s verification item 12 is **delivered**. Nothing to build
  here; the reason it is still written down is that the budget path ends a session for a reason of its
  own, and `stop()`'s receipt is the shape to follow rather than a second one to invent.

Surface spend as it accrues rather than only at the end, and put an effort level and a model
selector in the header — both can change on a live session without losing the conversation, and
effort is a larger lever than model choice for a session that mostly reads.

## Acceptance criteria

- [ ] A session has a spend ceiling, set low by default, and spend-to-date is visible while it runs
- [ ] Reaching the ceiling ends the session cleanly rather than erroring or hanging
- [ ] Continue resumes the same conversation with a fresh allowance, transcript intact
- [ ] The model is given a budget it can pace against, and wraps up rather than being cut off mid-action
- [ ] A turn ceiling stops a cheap non-converging loop
- [ ] Spend is presented as an estimate, not as a bill
- [ ] Effort level and model can be changed mid-session without losing the transcript
- [ ] A runaway session is stopped by the ceiling — demonstrated, not assumed

## Blocked by

- `019-a-live-session-in-the-pane.md`
