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
- 024
- 025
- 026

## Next

**Nothing. The board is empty — `001` through `026` are all `done`.** `025` was the last task with a
`ready` status and it shipped: the session pane now lists the conversations the CLI's own store holds
for the open project, discloses what a chosen transcript already read and what replaying it costs, and
attaches by **forking** so the original history is never written to. That also closed the last of the
`SESSION-PANE-PLAN.md` probes — a resume restores neither the recorded `settingSources` nor the
recorded working directory, both measured against a running CLI rather than read off the reference.

`SESSION-PANE-PLAN.md` is the plan `015`–`026` were cut from; its acceptance list is now fully ticked
apart from the running "isolation pins the invariants" tally, which is a standing measure rather than
a task, and its drift log carries a section per slice from `020` on. Anything next has to be
**written** first — a numbered page in `.claude/maestro-tasks/` and an entry in `status.json`. There
is no queued page to pick up.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/025-resume-a-session-started-in-the-terminal.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json. Make sure your tests never grant by accident any sensible directories, like documents or core/kernel ones. Anything it ~/gits is fine for the tests.
