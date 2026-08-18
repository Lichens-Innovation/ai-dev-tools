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
- 022
- 023

## Next

Three are `ready`. `022` closed the last of the pane's fixed scopes and unblocked `026`; `025` still
waits on `024`, which is now the only task in the queue that unblocks anything.

- 021-structured-questions-from-the-agent.md — recommended next, because `026` is the task that
  wants it and `026` is now the only thing left after it. `026`'s central instruction is "rewrite
  them to ask rather than guess", and the facility it means is `AskUserQuestion` — which is in no
  tool set in the app, so writing those skills first means writing them against a tool that does not
  exist. Everything else this slice needs is already standing: `session:permission`, the
  parked-promise registry, the pending badge and the auto-opening pane from `020`; the extension
  pattern from `023` (a `PermissionChoice` arm carrying a decision word and no payload, resolved in
  main against what the prompt published); and from `022` a `SessionEvent` union that now carries
  both a non-transcript member (`scope`) and a transcript one (`context`), so adding a third is a
  move with two precedents rather than a judgement call. It still owns both mechanical
  preconditions outright — `AskUserQuestion` in `PANE_TOOLS`, and
  `toolConfig.askUserQuestion.previewFormat`, neither of which is passed anywhere today.
- 026-rewrite-the-create-skills-for-interactive-sessions.md — newly `ready`, and it inherits more
  than a channel. `022`'s handoff seeds the session with the artifact, its frontmatter, the
  repository state and the previewed prompt verbatim, so the app-path half of each skill is now
  about what to do with facts the model already holds rather than about how to obtain them — and the
  inlined guidance this task deletes is the same text that arrives in the seed, so deleting it is a
  decision about the seed too. It also inherits `022`'s sharpest live lesson, which applies directly
  to prose these skills are made of: wording that describes a boundary as absolute makes the model
  decline the call rather than attempt it, and the user never gets the prompt they were owed. Best
  done after `021` for the reason above; doable before it only by writing around the missing tool.
- 024-a-budget-ceiling-you-can-continue-past.md — the most self-contained of the three, and the only
  one that unblocks anything (`025`). `019` passed nothing budget-related, so this slice owns
  `maxBudgetUsd`, `taskBudget`, `effort`, `enableFileCheckpointing` and `persistSession` outright,
  and items keep leaving it: `020` surfaced `interrupt()`'s `still_queued` receipt, and `023` and
  `022` both extended `SessionInfo`/`SessionEvent` in place — so spend and effort are more fields on
  objects that already reach the header. One thing `022` added that this slice must not undo: a
  zero-cost `result` answering a `shouldQuery: false` append is deliberately not reported as a turn,
  and a running spend figure has to be fed from that same guard.

## Prompt

For the following task, use the /test-maestro-desktop skill for your tests. Do the task from .claude/maestro-tasks/021-structured-questions-from-the-agent.md. Once you are done, use the @plugins/ai-tools-manager/agents/scribe.md agent to tell him what was done and what was updated from the original plan. Ask the scribe agent to update the following maestro tasks from .claude/maestro-tasks accordingly to avoid having gaps in the task structure when a task has to diverge from it's original planing. The scribe agent can also update the TODO.md file with the next task to do and update the task state in .claude/maestro-tasks/status.json. Make sure your tests never grant by accident any sensible directories, like documents or core/kernel ones. Anything it ~/gits is fine for the tests.
