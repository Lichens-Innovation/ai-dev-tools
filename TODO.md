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
- 023

## Next

Three are `ready`. `025` still waits on `024` and `026` still waits on `022` — `023` unblocked
nothing, because no task listed it as a blocker.

- 022-hand-off-from-a-create-form-into-the-pane.md — recommended next, and the only one of the three
  that unblocks anything (026). Writes are now the last scope in the app that cannot grow: `023`
  deliberately left them alone (`PaneVerdict.grantable` is false for every write, so a refused write
  still gets Allow once / Deny / Stop and nothing more), which means `writable: []` in
  `startPaneSession` is still the literal this slice replaces and this is still the only thing that
  can grow that list. It also inherits a template rather than a blank page: `023` established what
  mutating a live scope costs — widen the enforcement layer, ride the update on the answer,
  re-derive the disclosure — and one lesson it paid for, which is that a mutable scope must be read
  through a function (`readable()`) and never captured, or half the app goes on answering the old
  question with nothing failing.
- 021-structured-questions-from-the-agent.md — the pane's headline feature, and the plumbing is
  now more finished than it was: `session:permission`, the parked-promise registry, the pending badge
  and the auto-opening pane all exist, and `023` proved out the extension pattern this slice needs —
  a fourth `PermissionChoice` arm carrying a decision word and no payload, resolved in main against
  what the prompt itself published. It still owns both mechanical preconditions: `AskUserQuestion` in
  `PANE_TOOLS` and `toolConfig.askUserQuestion.previewFormat`, neither of which is passed anywhere
  today.
- 024-a-budget-ceiling-you-can-continue-past.md — the most self-contained of the three. `019` passed
  nothing budget-related, so this slice owns `maxBudgetUsd`, `taskBudget`, `effort`,
  `enableFileCheckpointing` and `persistSession` outright, and two items have already left it: `020`
  surfaced `interrupt()`'s `still_queued` receipt, and `023` extended `SessionInfo` and `SessionEvent`
  in place — so spend and effort are more fields on objects that already reach the header, not a
  second header.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/023-authorise-a-directory-for-the-session.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json. Make sure your tests never grant by accident any sensible directories, like documents or core/kernel ones. Anything it ~/gits is fine for the tests.
