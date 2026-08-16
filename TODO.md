# Todo

## Done

- 001
- 002
- 003
- 004
- 005
- 006
- 007
- 008
- 009
- 010
- 011
- 012
- 013
- 014
- 015
- 016
- 017
- 018
- 019
- 020

## Next

All four are `ready` — 020 was the only blocker on 021, 022 and 023, and 024's was 019.

- 023-authorise-a-directory-for-the-session.md — recommended next. It is the half of the boundary
  `020` left open, and the shortest path to it: the hook already returns `"ask"`, the prompt already
  renders the path and the reason, and `PermissionChoice` + the `session:permission` channel + the
  isolation pin all exist to be **extended** rather than built. What is missing is one more button —
  grant the directory for the session — and the `updatedPermissions` half main authors behind it.
  Without it `020` is a prompt that asks the same question every time, which is the state in which
  users stop reading prompts.
- 022-hand-off-from-a-create-form-into-the-pane.md — the larger slice and the larger payoff: the
  write-scope accumulator, the handoff from a create-\* submit, and seeding the transcript without
  spending a turn. Its premise survived `020` intact — the pane still reaches `decideWrite` with
  `writable: []`, and this is still the only thing that can grow that list — but note the direction
  reversed: a granted directory now turns a **prompt into a silent allow**, not a refusal into a
  prompt. It is also the only one of the four that unblocks anything (026).
- 021-structured-questions-from-the-agent.md — the pane's headline feature, and now mostly plumbing
  it can reuse: `session:permission`, the `PermissionPrompt`/`PermissionChoice` pair, the parked-promise
  registry and the pending badge are all in place. It still owns both mechanical preconditions —
  `AskUserQuestion` in `PANE_TOOLS` and `toolConfig.askUserQuestion.previewFormat`, neither of which
  is passed anywhere today.
- 024-a-budget-ceiling-you-can-continue-past.md — `019` passed nothing budget-related, so this slice
  owns `maxBudgetUsd`, `taskBudget`, `effort`, `enableFileCheckpointing` and `persistSession`
  outright. One item left it: `020` surfaced `interrupt()`'s `still_queued` receipt, so verification
  item 12 is delivered.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/020-permission-prompts-in-the-pane.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json
