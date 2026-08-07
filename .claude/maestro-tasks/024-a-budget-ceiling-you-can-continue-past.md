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
