# Hand off from a create-* form into the pane

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The two halves meet. A create-\* submit still scaffolds deterministically and still opens the
confirmation — that ordering is untouched, because the artifact being on disk before Claude is
mentioned is what makes cancelling harmless. What changes is that finishing the artifact can now
continue **in the pane**, as a conversation you steer, instead of only as a run you watch.

**This is the only thing that can grow the write scope**, and how it does so is the point. The
session opens with an empty write scope; a submitted form adds exactly one directory — the one the
create resolution returned and the confirmation displayed. Every writable directory therefore traces
to a form the user filled in and a scaffold that already wrote a file there. Not a dialog they
clicked through: an artifact they made, minutes ago.

Each addition is announced inline in the transcript at the moment it happens and listed in the pane
header, so the scope is readable at a glance rather than inferred. Submit a second form and it grows
by one more. Nothing else can add to it.

**Seed the conversation without spending a model call.** The handoff appends context — what was
scaffolded, where it landed, what its frontmatter says, whether it is already a git repository
(`ScaffoldResult.repo`, since `016`), what is left to write — as a transcript entry that does not
trigger a turn. The user's first typed message is the first thing that costs anything. This also
means the model starts knowing what has already been decided, so it does not re-ask for a name the
form captured. Leave the repository state out and a pane session will helpfully offer to `git init` a
directory that already is one.

Because writes are now confined to the artifact's own directory, the per-write prompt on this path
is close to ceremonial: the model cannot propose a write the user has not already approved by
submitting the form. That is intended. The prompts worth the user's attention are the ones for
anything outside it.

The existing headless finish stays available. The two paths differ in who is driving, not in what
they are allowed to do.

## Acceptance criteria

- [ ] A create-\* submit can hand off into the pane, and still shows its confirmation first, with the artifact already on disk
- [ ] The handoff adds exactly one directory to the write scope, announced in the transcript and listed in the header
- [ ] A second submit grows the scope by one more; nothing else in the app can add to it
- [ ] The seeded context does not trigger a model turn and costs nothing until the user types
- [ ] The model does not re-ask for fields the form already captured
- [ ] A write inside the granted directory prompts and succeeds; a write outside every granted directory is refused
- [ ] The existing headless finish still works and produces the same artifacts
- [ ] Switching projects clears the accumulated write scope along with the session

## Blocked by

- `020-permission-prompts-in-the-pane.md`
