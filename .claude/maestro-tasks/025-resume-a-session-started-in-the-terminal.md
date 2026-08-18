# Resume a session started in the terminal

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

A user starts a skill in their own terminal, gets partway, and wants the app. Today everything they
said getting there is lost and has to be retyped. Sessions are persisted, so the pane can list the
recent ones for the open project — with their summary, first prompt, branch and working directory —
and pick one up with its history intact.

The value is not the artifact; the file on disk was always the easy part. It is the *context*: "I
want a skill that does this, but our repo does that, so avoid the other thing."

Three things decide whether this is safe.

**Fork on resume.** Continuing the original session means the app writes into the history of the
user's own terminal session. Fork so the two stay separate.

**Disclose what the imported transcript already read.** This is the one that matters, and it is easy
to skip. A resumed conversation was produced under *the terminal session's* rules — any tools, any
permission mode, possibly with permissions skipped entirely — so it can already contain the contents
of files from anywhere on disk. The pane's boundary applies going *forward only*. Without a
disclosure, "this session cannot leave the selected directory" is true of future turns and quietly
false of the context it starts with, which is the worst kind of wrong: the guarantee reads as intact
while a hole sits underneath it. Show what that session read, and let the user decline.

**Probe whether resuming honours the pane's directories or restores the recorded ones.** The
reference does not say, and the answer is load-bearing for the boundary. Settle it by testing the
running CLI, not by reading source, and record the answer where the next person will find it. Probe
the same question for `settingSources`: every session this app starts passes `[]` (since `018`, that
is the run, the smoke query and the settings resolution alike), and a resume that restored the
recorded session's sources would reopen both doors `[]` closes — a permissions widening, and an
`ANTHROPIC_API_KEY` in a settings file redirecting the bill off the subscription.

**`023` settled half of that probe in advance, and the half it settled is the reassuring one.** The
`PreToolUse` boundary hook runs *before* the CLI's permission system, so whatever a resume restores
into the permission system, the hook is still the authority over what the session may read — that is
the same property that makes `session:revoke` work at all, since the SDK has no API for withdrawing a
`PermissionUpdate`. What still has to be probed is `settingSources`, and whether a resumed session's
recorded `cwd` displaces the pane's. The boundary is anchored to `request.cwd`, and `023` pinned that
it does not follow a working directory that moves.

**A resumed session starts with no grants, and that is correct rather than an omission.** Session
grants live on main's per-window `LiveSession` entry, die with it on every teardown path, and are
written nowhere — so there is nothing on disk for a resume to restore, and a path the terminal
session read freely raises a prompt on the first turn in the pane. That belongs in the disclosure
this task already requires: what the imported transcript already read is exactly the set the pane
will now start asking about.

A long transcript is replayed as context on the first turn, so resuming is not free. Show the user
what they are picking up before they pick it up.

## Acceptance criteria

- [ ] The pane lists recent sessions for the open project with enough detail to recognise one
- [ ] Resuming restores the conversation and continues it in the pane
- [ ] Resuming forks: the original terminal session's history is not written to — verified on disk
- [ ] Before resuming, the user is shown what that session previously read, and can decline
- [ ] Whether resume honours the pane's directory scope is established by probe and recorded, and the boundary behaves correctly either way
- [ ] A resumed session is subject to the same tool set, boundary and prompts as a fresh one
- [ ] The cost of replaying a long transcript is surfaced before the user commits to it
- [ ] Sessions belonging to other projects are not offered

## Blocked by

- `024-a-budget-ceiling-you-can-continue-past.md`
