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
- 026

## Next

One is `ready`, and it is the last one on the board. `024` is done — the pane now runs under a spend
ceiling with a Continue that resumes the same conversation on a fresh allowance — which clears
`025`'s only blocker.

- 025-resume-a-session-started-in-the-terminal.md — recommended next, and now a much smaller slice
  than the page was written for. `024` built the resume machinery in order to build Continue:
  `persistSession: true` is passed explicitly, `resume` is a `startPaneSession` option,
  `PaneSession.sessionId()` reads the CLI's own id, and `openSession` in `claude-session.ts` is the
  single builder that carries a conversation into a new session through a `CarriedSession` — so a
  resumed session gets the same tool set, boundary and prompts as a fresh one by construction, not by
  a new code path. Attaching to a terminal session is a fourth caller of that builder. What genuinely
  remains is the picker: enumerate the user's own sessions for the open project, describe each well
  enough to recognise, disclose what that transcript already read and what replaying it will cost,
  and **fork** rather than continue — `024`'s Continue deliberately resumes in place, so not writing
  to the terminal session's history is new behaviour. The three probes are also untouched: `024` only
  ever resumed sessions this app started under its own options, so it settled nothing about what a
  foreign resume restores for `settingSources` or a recorded `cwd`.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/024-a-budget-ceiling-you-can-continue-past.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json. Make sure your tests never grant by accident any sensible directories, like documents or core/kernel ones. Anything it ~/gits is fine for the tests.
