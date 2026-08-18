# Session pane — a Claude session inside the desktop app

**Status: draft, unqueued.** Written 2026-08-04, after M5. Should probably move to
`docs/plans/m7-session-pane.md` and get a task file under `.claude/maestro-tasks/` before it runs.

## Context

Every Claude interaction in `apps/maestro` today is **one-shot and unsteerable**. A create-\* run
produces a body you either accept or redo from the form. `/maestro-tasks`' **Run with Claude**
streams a run you can only watch or kill. If a task needs one clarification, it guesses.

That is the hole. It is not "the app has no terminal" — a terminal is worse than the user's real
terminal for anything power-usery, and the people who would use one already have tmux. It is that
the app can *start* Claude and cannot *talk to* it.

This plan closes that, and it is only worth doing on the **Claude Agent SDK**
(`@anthropic-ai/claude-agent-sdk`). Not the raw `claude -p` bridge the app has now. The reason is
measured, not assumed — see below.

## What was measured, and why it decides the design

All of this was probed against Claude Code 2.1.221 and SDK 0.3.221 on this machine. Re-run before
building; do not take it on faith.

**1. The raw CLI cannot surface permission prompts.** `--permission-mode manual` is accepted by the
flag parser, but the session's own init line reports `"permissionMode":"default"`, no permission
request ever appears on the stream-json channel, and the CLI synthesizes a denial as a
`tool_result` error telling the model *"this session is non-interactive so I can't prompt for it."*
Holding stdin open changes nothing. The init payload advertises
`capabilities: ["interrupt_receipt_v1","interrupt_cancel_queued_v1","msg_lifecycle_v1"]` — no
permission capability. `--permission-prompt-tool` no longer exists in this version.

**2. The SDK can, because it negotiates.** `can_use_tool` is a `control_request` established in an
initialize handshake the raw probe never performed. With the SDK:

```
ANTHROPIC_API_KEY set? false
init → permissionMode: default | model: claude-opus-5
  ↳ canUseTool FIRED: Write  denied.txt
  ↳ canUseTool FIRED: Write  allowed.txt
result: success

=== files on disk ===
ls: cannot access 'denied.txt': No such file or directory
allowed.txt
```

The callback fires per tool call **with the full tool input, before execution**. Deny prevents the
action. This is the entire reason the SDK is a requirement rather than a preference.

**3. Auth comes free from the Claude Code subscription.** No `ANTHROPIC_API_KEY` was set. The SDK
spawns the same CLI binary the app already spawns, which is already logged in.

**4. `canUseTool` fires only for tools that would otherwise prompt.** A 25-turn repository
exploration produced **five** callback invocations. Every `Read`, `Glob`, and `Grep` was
auto-allowed and never consulted the host. This is the single most consequential finding in this
document and the rest of the design follows from it — see *Read scope is the security boundary*.

**5. Denials are recoverable.** In that run the model tried `Bash` four times to batch-read files,
was refused each time, fell back to the permitted read tools, and completed the task. A denial is a
signal to the model, not an abort. A real permission UI is therefore viable rather than a footgun.

**6. Cost is the actual tax.** That exploration was **$1.43 across 25 turns**, brushing the
`maxBudgetUsd: 1.5` ceiling. An always-on conversational pane consumes subscription quota far
faster than one-shot `-p` runs.

## Scope

**In:** a pane, inside the app, holding one live multi-turn Claude session per open project;
streamed transcript; a real permission prompt UI; a read-scope disclosure; a budget ceiling; and
two entry points — a create-\* flow handing off, and the user typing.

**Out:** a terminal emulator (`node-pty`, xterm.js). Rejected: it costs a native module across
every Electron bump, and it buys fidelity at the exact price of the integration this exists for —
you cannot render a "skill created at `<path>`" card from a TTY.

**Out:** replacing the `claude:preview` → token → `claude:run(token)` path. It stays exactly as it
is. See *The invariant*.

**Out:** an MCP server letting an outside session drive the app. Separate idea, separate plan, and
largely redundant once the user has a session *inside* the app next to the form.

## Architecture

The session lives in **main**, never the renderer. It is the same ownership shape as the log tail:
one per `webContents.id`, retargeted on project switch, disposed on quit.

```
src/main/claude-session.ts     owns the SDK query(), the message pump, the permission registry
src/main/ipc.ts                channels + lifecycle wiring
src/shared/ipc.ts              the typed contract
src/renderer/src/components/session-pane.tsx     transcript + composer
src/renderer/src/components/permission-prompt.tsx  the ask UI
src/renderer/src/utils/session-context.tsx        single-owner subscriber, mirrors SessionLogProvider
```

Channels, mirroring the bridge's existing split:

```
session:start   → { projectRoot, readScope[], budgetUsd, seed? }  starts a session, returns id
session:say     → { sessionId, text }        a turn the USER typed
session:stop    → { sessionId }              interrupt
session:permit  → { requestId, decision }    allow | deny (+ optional deny message)
session:message ← streamed assistant text, tool calls, results   (push)
session:ask     ← a pending permission request                    (push)
session:ended   ← outcome, usage, cost                            (push)
```

`session:say` is the new thing and it is deliberately not `claude:run`. Its payload can originate
**only** from a text input the user typed. That is the rule; see below.

## The permission model

`canUseTool` returns a `Promise`. Main parks it, pushes `session:ask` to the renderer, and resolves
it when `session:permit` arrives. That registry is the fiddly part and it has three requirements
that are easy to miss:

- **Idempotent per `request_id`.** The SDK dedupes in-flight requests, but one whose response was
  lost in a reconnect gap **is dispatched again**. A registry keyed by request id that resolves the
  existing promise on a repeat is correct; one that creates a second pending entry leaks.
- **A default resolution for every exit.** If the window closes, the project switches, or the user
  walks away, the parked promise must resolve — **deny** — or the SDK hangs forever holding a child
  process. Every teardown path resolves outstanding asks.
- **Auto-denies bypass the callback entirely.** `SDKPermissionDeniedMessage` (`type: 'system'`,
  `subtype: 'permission_denied'`) covers the short-circuit path — deny rules, `dontAsk` mode, the
  auto-mode classifier. The UI needs both: the interactive ask, and this message for denials that
  never asked. Rendering only the first makes tool calls vanish with no explanation.

The prompt UI must render **per tool**, not as a JSON dump. `Bash` shows the command; `Write`/`Edit`
show the path and a diff; `WebFetch` shows the URL. A generic `{tool, input}` blob is technically
correct and practically useless — users click Allow blindly, which is *worse* than `acceptEdits`
because it looks like consent.

## Read scope is the security boundary

Because reads never prompt (finding 4), **the directory list passed at spawn is the only thing
bounding what Claude can see.** There is no per-file gate to fall back on.

So `cwd` + `additionalDirectories` must be shown to the user **before the session starts**, in the
same disclosure that `ClaudeRunDialog` already gives for "what may be written". It is fully known
at start time, so this costs nothing structurally — but leaving it implicit means the app silently
grants read access to whatever it happened to pass.

This also fixes a real asymmetry in the create-\* flows: `CLAUDE.md` documents that a create run's
cwd is the *target* (a marketplace repo), not the open project. Correct for writing, backwards for
exploring — you want it reading the user's project and writing into the marketplace.
`additionalDirectories` decouples the two, and a probe confirmed the shape works end to end:
running in a marketplace dir with the repo as an additional root, it produced a 198-line skill
citing real files and constraints, and left the repo untouched.

## Reuse, and one trap in it

`/session-log` already renders humanized tool calls — `humanizeLog` in
`renderer/src/utils/session-log.ts` is directly reusable for the transcript.

**But `buildInstances` is not.** It segments the *hook-written* `maestro_session.log.jsonl` by
origin change, and correlates dispatch↔handoff by `agent_id`. The session pane reads the **SDK
message stream** — a different source with different shapes. Reuse at the humanize level; do not
try to force SDK messages through the instance model.

## The invariant

The bridge's guarantee is: **the only executable prompts are ones the user was shown.** It is
enforced by `claude:run` taking a token and nothing else, and pinned by `test/isolation.test.ts`.

The pane does not weaken it, but it does restate it:

> The renderer never authors a prompt. The user does.

Concretely:

- **First turn keeps preview → token.** A create-\* flow handing off to the pane still goes through
  `claude:preview` and the confirmation dialog. That ordering — artifact on disk before Claude is
  mentioned — is the best decision in the app and this plan does not touch it.
- **`session:say` carries only user-typed text.** Not a renderer-constructed prompt, not a template
  the UI filled in. If a feature wants to send a composed prompt, it goes through preview and gets
  a token like everything else.
- **`session:permit` carries a bounded decision.** `allow` | `deny` (+ message). The SDK's allow
  branch also accepts `updatedInput` — **do not expose that across the preload.** It is a channel
  that can alter what executes, and it would reopen the hole in a diff that reads as a convenience.
- `test/isolation.test.ts` gets assertions for all three.

## Things that bite

- **The SDK must be externalized, and it will not be by default.** `externalizeDepsPlugin` derives
  its externals from package.json **`dependencies`** — and `apps/maestro/package.json` lists only
  `@repo/maestro-core` there; everything else is a `devDependency`. Add the SDK the way the rest of
  that file does and it gets *bundled*, which breaks it: it resolves the `claude` binary on disk at
  runtime. It must be a real `dependency`, and it must not join the
  `exclude: ["@repo/maestro-core", "@repo/claude-fs"]` list (that list is for workspace *source*
  packages, which are the opposite case). This fails only in the packaged build, never in `dev`.
- **Feed it the resolved binary path.** `pathToClaudeCodeExecutable` is an SDK option. The app
  already solves this — `claude-cli.ts` resolves explicitly because a GUI-launched Electron app's
  PATH lacks `~/.local/bin`, and this does not reproduce from a terminal. Pass the resolved path;
  do not let the SDK do its own PATH lookup and re-acquire a bug that is already fixed.
- **Verify the SDK's abort kills the whole tree.** The app currently spawns detached into its own
  process group *specifically* so Stop reaches the CLI's own children, with `disposeClaudeRuns()`
  on quit. The SDK owns the subprocess now. If its abort does not reach grandchildren, quitting the
  window leaves Claude running against the user's repo with nothing left to stop it.
- **`ANTHROPIC_API_KEY` shadows the subscription.** If it is set anywhere in the environment the
  app inherits, runs bill the API instead of the user's Claude Code plan, silently. Build the
  child's env explicitly rather than passing `process.env` through.
- **Sessions must be keyed on `projectRoot` and dropped on switch.** Same failure class as
  `seedWorkflowStore`'s keying and `clearInvocations()` — a live session left across a project
  switch is pointed at the repo the window has moved off, and every read it does is scoped to the
  wrong tree. Both prior instances of this bug were silent.
- **Budget must be a real ceiling, not a display.** `maxBudgetUsd` is an SDK option and a 25-turn
  exploration hit $1.43. Wire it per session, surface it, and default it low enough that a runaway
  loop is an annoyance rather than a quota event. A model selector belongs here too.
- **Do not gate on `pause_turn`-style assumptions.** The pane's read loop should end on the SDK's
  result message, not on the first quiet moment.

## Sequencing

**After M6 (tasks `012`–`014`), not before.** Task `013` — *put chat and stats behind the bridge* —
forces most of this machinery for help-server's chat tab anyway. Building it there first, against
one concrete use case, tells you whether the permission UI is a day or a week before you commit the
create flows to it. Building it now means carrying a half-finished conversation layer through the
core-absorption work in `010`.

The one thing worth pulling forward: **the read-scope disclosure**. It is small, it is independent
of the pane, and it makes `ClaudeRunDialog` honest about what a run can see rather than only what
it can write.

## Verification

1. `canUseTool` round-trips through the UI: a `Write` outside the project pops a prompt, **Deny**
   leaves no file, **Allow** writes it. Verified in the window, not a unit test.
2. Killing the window mid-ask resolves the parked promise and reaps the child. `ps` shows nothing
   left; no orphaned `claude` process.
3. A project switch with a live session ends that session and starts nothing against the new repo
   implicitly.
4. The same `request_id` delivered twice resolves once — no duplicate prompt, no leaked entry.
5. An auto-denied tool (deny rule) renders in the transcript via `SDKPermissionDeniedMessage`
   rather than silently vanishing.
6. A create-\* handoff still shows the confirmation dialog before its first turn, and the artifact
   is on disk before the pane opens.
7. `test/isolation.test.ts` fails if the preload gains `updatedInput`, a generic invoke, or a
   `session:say` call site whose payload is not a user input value.
8. A session with no `ANTHROPIC_API_KEY` reports subscription usage; one with the var set is
   rejected or warned, not silently billed.
9. Budget ceiling actually stops a runaway loop.

## Acceptance criteria

- [ ] A live, multi-turn Claude session runs inside the app, per project, on the Agent SDK
- [ ] Permission requests render per-tool (command, path + diff, URL) and are answerable
- [ ] Read scope is disclosed before a session starts and is bounded by `cwd` + `additionalDirectories`
- [ ] Auto-denied tool calls are visible in the transcript
- [ ] A create-\* flow can hand off into the pane without weakening its confirmation
- [ ] `acceptEdits` is gone from every path the pane owns
- [ ] No orphaned child process survives window close, project switch, or app quit
- [ ] A per-session budget ceiling is enforced and surfaced
- [ ] `test/isolation.test.ts` pins the three invariant properties above
