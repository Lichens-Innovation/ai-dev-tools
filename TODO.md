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
- 021
- 022
- 023

## Next

Two are `ready`. `021` closed the tool gap `026` was waiting on; `025` still waits on `024`, which
is now the only task in the queue that unblocks anything.

- 026-rewrite-the-create-skills-for-interactive-sessions.md — recommended next. `status.json` only
  ever listed `022` as its blocker, but the task's own prose made `021` the real precondition —
  "rewrite them to ask rather than guess" means `AskUserQuestion`, which was in no tool set in the
  app until now. It is done: `PANE_TOOLS = [...SESSION_TOOLS, "Skill", QUESTION_TOOL]`,
  `toolConfig: { askUserQuestion: { previewFormat: "markdown" } }` is passed on the pane query, and a
  question answered through `session:question` reaches the model as `updatedInput` with the labels it
  offered. `026` is now genuinely the only thing left after it — nothing else in the queue is
  `ready` and unblocked by nothing but done work.
- 024-a-budget-ceiling-you-can-continue-past.md — the only one that unblocks anything (`025`). `019`
  passed nothing budget-related, so this slice owns `maxBudgetUsd`, `taskBudget`, `effort`,
  `enableFileCheckpointing` and `persistSession` outright, and items keep leaving it: `020` surfaced
  `interrupt()`'s `still_queued` receipt, and `023`, `022` and `021` each extended `SessionInfo`
  and/or `SessionEvent` in place — so spend and effort are more fields on objects that already reach
  the header, not a second header. One thing `022` added that this slice must not undo: a zero-cost
  `result` answering a `shouldQuery: false` append is deliberately not reported as a turn, and a
  running spend figure has to be fed from that same guard.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/026-rewrite-the-create-skills-for-interactive-sessions.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json. Make sure your tests never grant by accident any sensible directories, like documents or core/kernel ones. Anything it ~/gits is fine for the tests.
