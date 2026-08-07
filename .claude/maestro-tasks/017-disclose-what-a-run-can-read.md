# Disclose what a run can read before it runs

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The confirmation dialog already tells the user what a run may **write**. It says nothing about what
the run can **read**, and reads are the larger surface: file reads and searches are auto-approved by
the permission system and never raise a prompt, so the directory list handed over at spawn is the
only thing bounding what Claude can see.

Add the read scope to that disclosure, next to the write targets. It is fully known before anything
starts, so this costs nothing structurally — leaving it implicit means the app silently grants read
access to whatever it happened to pass.

Make the disclosure **true**, not merely plausible. The effective configuration of a session is a
merge of what the app passes with settings files on disk, and those files can contribute permission
rules and extra readable directories that the app never chose. Resolve the effective settings and
report where each value came from, rather than echoing the app's intent and hoping nothing else
applied. The SDK exposes this resolution without spawning anything.

This also fixes a real asymmetry: a create run's working directory is the *target* — a marketplace
repo — not the open project. Correct for writing, backwards for exploring. Say so plainly, so the
user can see that a run may read one tree and write into another.

Worth doing before the run path changes underneath it: the dialog should be honest about the current
behaviour first, so the next slice's change is visible as a narrowing rather than arriving with it.

## Acceptance criteria

- [ ] The confirmation dialog lists the directories a run can read, alongside what it may write
- [ ] Read and write scope are visibly distinct, including the case where a run reads the open project and writes into a marketplace
- [ ] The disclosure reflects the *effective* configuration, including anything contributed by settings files, not just what the app passed
- [ ] Where a value came from is available to the user rather than being flattened into one list
- [ ] The disclosure is derived in the main process; no directory is nominated by the renderer
- [ ] Cancelling still leaves the scaffolded artifact untouched on disk

## Blocked by

- `015-externalize-the-agent-sdk.md`
