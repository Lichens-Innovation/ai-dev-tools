# Authorise a directory for the session

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The "unless authorized" half of the boundary. A user authoring a skill will reasonably say *"make it
like my existing one"* — and their own global skills live outside the project and outside any
marketplace. Denying that outright is wrong; granting it silently is worse.

**The mechanism is not obvious, and getting it wrong makes the feature impossible.** File reads and
searches never raise a prompt on their own — the permission callback fires only when the evaluation
already resolved to one, and reads inside scope are auto-approved. So an out-of-scope read raises
nothing: it quietly works or quietly fails. The pre-tool boundary layer therefore does more than
block. It can **route** a call into the prompt UI, and that is what turns a wall into a request.

A grant is scoped to the session and **never touches disk**. The alternatives are worse than they
look: writing a rule to local settings survives the session and lands in the user's repository;
writing to user settings is global to the machine. The same field can also flip the session's
permission mode wholesale or widen the readable set permanently, which is why the main process
authors the update and the renderer sends only a bounded decision. This is the third use of that
pattern in the app.

The three properties come from a decision this app already made once, for the chat's confirmation
opt-out, and inheriting them beats inventing a second policy: **it defaults to asking, it dies with
the session, and it is visible and revocable from the header.** A grant the user cannot find again
has not made the boundary optional, it has removed it.

The user should be able to grant just the one file or the whole directory, and the difference should
be obvious in the prompt.

**Add to the scope that already exists; do not build a second one.** `017` modelled readable
directories as `ClaudeReadDirectory` in `src/core/contracts.ts`, each carrying an origin, a settings
tier and the file it came from, and `additionalDirectories` provenance is already part of that. A
session grant is one more origin on that list, which is also what makes it listable and revocable in
the header without a second rendering path. Keep the provenance: "the user granted this, in this
session" is exactly the distinction a flat list of directories destroys.

**The form path has still never widened a read scope, so the ground is emptier than the shape
suggests.** `018` deliberately did **not** widen reads: it passes **no `additionalDirectories`**, and
a run's read scope is its cwd. It also loads no filesystem settings (`settingSources: []`), so the
user-, project- and local-tier directories `017` was built to disclose are no longer contributed by
anything — what remains is the cwd plus the managed (administrator) policy tier, which `[]` does not
drop. Do not read "the settings say so" as a live origin in a run.

### What `019` already built, and what it deliberately did not

- **`additionalDirectories` already exists and is already populated — this slice grows a list rather
  than introducing one.** The pane's read scope is the open project **plus every local marketplace**,
  not "the resolved marketplace": with no create-form handoff in `019` there was no single one to
  name, so main resolves them itself with `listMarketplaces()` over the `source: "directory"` entries
  of `~/.claude/plugins/known_marketplaces.json`. They render with the new `ReadScopeOrigin` value
  `"app"`. A session grant is one more origin beside it, which is what makes it listable and
  revocable in the header without a second rendering path.
- **The boundary layer exists and currently denies.** `src/core/session-scope.ts` (`decideBoundary`,
  `boundaryTargetOf`, `BOUNDED_TOOLS`, `UNBOUNDED_TOOLS`) is the pure decision, returning
  `{ decision: "out-of-scope", path, reason }`; `agent-sdk.ts` maps that to
  `permissionDecision: "deny"` today, and `020` is what turns it into `"ask"` and gives it a prompt to
  route into. By the time this slice runs, that routing is the thing a grant answers.
- **The hook is wired only to the read-only tools, and that separation is load-bearing here.**
  `session-scope.ts` knows how to check write tools as well, precisely so widening writes cannot
  widen reads by accident — which is the mistake this slice is best placed to make.

Watch the other doors while you are here. The scope can also be widened by a directory-add command
typed into the composer, by a control request from outside, and by the working directory moving.
Hooks exist that report all three; treat them as boundary events rather than log lines.

## Acceptance criteria

- [ ] A read outside the read scope raises a prompt naming the path and why it was stopped, rather than silently failing
- [ ] The user can allow that path once, or grant its directory for the session, or deny with a reason
- [ ] A session grant is listed in the header, revocable there, and gone when the session ends
- [ ] No grant writes anything to disk — asserted by checking settings files are untouched after granting
- [ ] The main process authors the permission update; the renderer sends only a decision
- [ ] A directory-add typed into the composer does not widen the scope, and is surfaced
- [ ] A working-directory change is observed and does not silently move the boundary
- [ ] The isolation tests fail if the renderer gains the ability to author a permission update or set a permission mode

## Blocked by

- `020-permission-prompts-in-the-pane.md`
