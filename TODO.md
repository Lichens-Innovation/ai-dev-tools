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

## Next

- 020-permission-prompts-in-the-pane.md — recommended next. Its only blocker (019) is done, and it is
  what `019`'s boundary hook was written to become: `session-scope.ts` returns `"out-of-scope"` rather
  than `"deny"` so routing it into a prompt is one word in `agent-sdk.ts` plus the UI. It also
  unblocks 021, 022 and 023.
- 024-a-budget-ceiling-you-can-continue-past.md — its only blocker was also 019. `019` passed nothing
  budget-related, so this slice owns `maxBudgetUsd`, `taskBudget`, `effort`,
  `enableFileCheckpointing` and `persistSession` outright.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/020-permission-prompts-in-the-pane.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json
