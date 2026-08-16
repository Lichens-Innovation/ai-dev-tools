# Changelog

Notable changes, newest first. This file starts at maestro task `018`; everything before it is in
`.claude/maestro-tasks/` and `docs/plans/`.

## Unreleased

### maestro — finish a create-\* artifact in the pane instead of watching a run

- **The confirmation now offers two buttons over one single-use token.** **Run** is the headless
  finish, unchanged; **Continue in the pane** spends the same token on `session:handoff`, with the
  directory it would open rendered beside it. The scaffold still runs first and the artifact is still
  on disk before Claude is mentioned.
- **This is the only thing in the app that can grow a session's write scope**, and it takes a
  **preview token and nothing else** — the discipline `claude:run` already had, applied to paths.
  Main claims the token, refuses any preview whose `handoff` is null (a `maestro-task`'s write target
  is the whole project), and appends exactly one path: the artifact's own directory, or the artifact
  **file** where it has none of its own (a project-target subagent shares `.claude/agents/`). Two
  submits, two entries; a replayed token is refused; no path crosses the wire.
- **A write inside that directory stops asking; everything else still does.** `020`'s prompt is
  unchanged and `grantable` is still false for every write — but the refusal reason now has two
  forms, so a session that was handed a directory is told which scope it just reached outside of
  rather than being told nothing was ever granted.
- **The conversation is seeded without spending a turn.** The `HandoffContext` — the artifact, the
  frontmatter or directory listing read off disk, `016`'s repository state, and the previewed prompt
  verbatim — is appended with `shouldQuery: false` and shown as a collapsible `{ kind: "context" }`
  transcript entry. The user's first typed message is the first thing that costs anything, and the
  model does not re-ask for the name the form captured.
- **Two things were learned in a real window and could not have been caught by a test.** A
  `shouldQuery: false` append is answered by its own zero-cost `result` message, which must not be
  reported as a turn (it clears the renderer's `busy` and takes the Stop button off a live turn); and
  seed wording that describes the boundary as absolute makes the model decline to attempt an outside
  write at all — silently deleting `020`'s "you can allow this once" — so the seed says plainly that
  such a write asks and can be allowed.
- **Anything writable is also readable.** `readable()` includes the write scope, or the read half of
  every edit raises a prompt; the disclosure lists a handed-off directory only when nothing already
  in scope contains it. Telling the CLI about the directory is lazy — `updatedPermissions` rides on a
  permission answer and a handoff has none, so `addDirectories` (`destination: "session"`) is carried
  on the first allow that lands inside a newly-opened directory.
- **The write scope is visible and deliberately not revocable.** A `WriteScope` panel sits beside the
  grants in the pane header, each entry naming the form that opened it and carrying no Revoke button:
  a grant answers a question the session asked, a write scope entry answers a form the user submitted,
  and ending the session — which a project switch does — is how it is withdrawn.
- New core module `session-handoff.ts` (pure: `handoffSeed`, `handoffNotice`, `handoffTitle`,
  `writeScopeNote`). New contracts `HandoffContext` and `SessionWrite`; `ClaudePreview.handoff`,
  `ClaudeInvocation.handoff`, `SessionInfo.writes` (with `writable` derived from it), `SessionEvent`
  gained `{ kind: "context" }` and its `scope` member gained `writable`/`writes`; `CreateTarget`
  gained `dir`. New IPC `session:handoff` / `MaestroApi.session.handoff(token)`. `startPaneSession`
  gained `seed`, `allowWrites` and `writable()` — a function, never a captured array, for the reason
  `023` established for `readable()`.
- Tests: the isolation block _"gives the pane an empty write scope with no channel that could widen
  it"_ was **replaced** by "grows the pane's write scope only from a claimed preview token, and never
  from the renderer", plus a new block "seeds a handoff's context without spending a turn, and says so
  in the transcript" — **443 tests**. Verified in a real Electron window over three probe passes: 13
  mechanics assertions, 11 against a live model, 6 against the headless path.

### maestro — a directory you can authorise for the session, and take back

- **The prompt gained its missing button.** `020` routed an out-of-scope read into a prompt with
  Allow once / Deny / Stop; a read now also offers **grant this file** or **grant its directory** for
  the rest of the session. Each option is its own button carrying its own path and its own sentence —
  "Allow this folder" is a promise the folder is the obvious one, and this prompt exists for the case
  where it is not.
- **A grant never touches disk, and the type is what guarantees it.** `SessionPermissionUpdate` in
  `contracts.ts` is a hand-narrowed member of the SDK's `PermissionUpdate` union: it can express only
  `{ type: "addDirectories", directories, destination: "session" }` — never `addRules`, never
  `setMode`, and none of the three destinations that write (`localSettings`, `projectSettings`,
  `userSettings`). `test/isolation.test.ts` also fails on any of those literals anywhere under
  `src/`. Verified in the window: after granting, every settings file is byte-identical and
  `~/.claude.json` gains no permission-shaped key and never names the granted path.
- **The renderer still nominates no directory — on the permission wire either.** `PermissionChoice`
  is **extended** with a fourth arm `{ choice: "grant", scope: "file" | "directory" }`, carrying a
  scope word and **no path**; main holds the prompt and resolves the path from the
  `SessionGrantOption` it published. Same discipline as `create:scaffold` taking a request and
  `claude:run` taking a token.
- **A grant reaches both enforcement layers or it reaches neither usefully.** `PreToolUse` runs
  _before_ the CLI's permission system, so `updatedPermissions` alone leaves the hook re-prompting
  forever and the hook alone leaves the permission system refusing. Main does three things:
  `session.grant([path])`, the `updatedPermissions` on the allow, and a re-derived disclosure pushed
  as a new `{ kind: "scope" }` `SessionEvent`.
- **The read scope is mutable mid-session for the first time**, so `readable` is now a **function**
  (`readable()`) read fresh per call rather than an array captured at session start — no call site
  can go on answering the old question after a grant.
- **Visible and revocable, or the boundary is not optional but gone.** Grants list in the pane's
  scope panel with a Revoke button and inside `ReadScope` as the fourth `ReadScopeOrigin`,
  `"session"` (dotted amber); the summary gains "You granted N more paths during this session…". New
  IPC `session:revoke` (`MaestroApi.session.revoke(id, path)`) carries a path, which is safe in one
  direction only: it can remove an entry main already holds and has no shape by which it could add
  one. The SDK has no API for withdrawing a `PermissionUpdate` — revocation works because the **hook**
  is the authority and runs before the permission system sees the call.
- **Only a read is grantable.** `PaneVerdict`'s ask arm gained `grantable`, true in the read-boundary
  branch and nowhere else: a refused write keeps Allow once / Deny / Stop (widening writes is still
  `022`'s), and `WebFetch`/`WebSearch` have no path to grant. A directory ≤2 segments deep, or one
  containing something already in scope, is flagged `broad` and rendered in amber with what it would
  swallow.
- **The other two doors are closed by the CLI, not by us — measured.** `/add-dir` typed into the
  composer answers `/add-dir isn't available in this environment.` in an SDK session, inside the cwd
  and outside it alike, and that refusal is already an assistant turn in the transcript. The
  `DirectoryAdded` and `CwdChanged` hooks are registered anyway and are currently **unreachable** from
  the pane; the boundary stays anchored to `request.cwd` and does not follow a working directory that
  moves. Both are pinned so the first time either becomes reachable it is not silent.
- New contracts: `SessionPermissionUpdate`, `GrantScope`, `SessionGrantOption`, `SessionGrant`;
  `ReadScopeOrigin` gained `"session"`, `PermissionPrompt` gained `grants`, `SessionInfo` gained
  `grants`, `SessionEvent` gained `scope`. New pure exports `grantOptionsFor` / `grantOptionFor` in
  `session-scope.ts`.
- Tests: the existing _"lets the renderer send a permission CHOICE and never a permission result"_
  isolation block was **widened** rather than duplicated, plus two new blocks — a grant dies with the
  session and is written nowhere, and the other doors are watched and followed by nothing —
  **425 tests**. Verified in a real Electron window over CDP: 16/16 on the grant flow, 5/5 on the
  other doors.

### maestro — the pane asks before it acts

- **A tool call the app will not answer for now raises a prompt**, pinned above the composer, with
  three controls: **Allow once**, **Deny** and **Stop turn**. Deny refuses the call and lets the model
  adapt; Stop ends the turn. They are two buttons because they are two intents, and every denial
  carries a reason — the UI never sends an empty one.
- **Two new pure core modules.** `src/core/session-permission.ts` is the fourth scope module and
  deliberately **not** a fourth engine: it composes `decideWrite` (`write-scope.ts`) and
  `decideBoundary` (`session-scope.ts`) unchanged and adds the one answer neither can give — ask a
  person. `decidePaneCall` → `PaneVerdict` (`settled` | `ask`); also `describeCall`,
  `permissionReason`, `autoRefusal` and `PANE_ASK_TOOLS = ["WebFetch", "WebSearch"]`.
  `src/core/permission-registry.ts` is the parked promises: `createPermissionRegistry()` →
  `{ request, answer, pending, denyAll }`, idempotent per `requestId` (a redelivered request
  re-attaches, or replays the answer it already got — bounded at 64), and **every exit denies
  everything outstanding**, because prompts do not time out and an unresolved ask is a wedged session
  holding a child process.
- **The pane is no longer read-only, and the write scope is still `[]`.** `decideWrite` still produces
  the refusal and still produces its own reason; what changed is that the user may override it for
  **that one call**. Nothing accumulates — the next write asks again, and `022` is still the only
  thing that can grow the scope.
- **A refused write now carries two sentences.** `PermissionPrompt.reason` is written for the person
  reading the dialog; `denyReason` is `decideWrite`'s model-facing message verbatim, sent only if the
  user denies without typing anything. That is how `018`/`019`'s "a refused write still carries
  `decideWrite`'s reason" survived the write becoming a prompt.
- **The boundary hook returns `"ask"`** — the one-word change `019` wrote it for — **except for a call
  that carries no path**, which still denies: there is nothing there for a person to authorise. That
  branch writes its own transcript entry, because the SDK's `permission_denied` event does not report
  hook denials.
- **Prompts render per tool, never as a payload dump.** A fetch shows the **complete** URL, query
  string included; a write shows the path and clipped hunks; a scan shows the root and the pattern;
  an unrecognised tool is still named with whatever it carried. The network tools always ask — they
  touch no path, so no scope module has an opinion about them, and a `WebFetch` is how the contents of
  a readable project leave the machine.
- **Four refusal routes, distinguished in the transcript.** `SessionEvent`'s `refusal` gained
  `source` (`write-scope` | `read-boundary` | `user` | `auto`) and `decidedBy` (the SDK's
  `decision_reason_type`). `autoRefusal` maps the `permission_denied` stream event and is a **pure**
  function rather than inline in the read loop, because the rule/mode branch cannot be provoked from a
  window: with `settingSources: []` only the machine-wide managed-settings tier survives, and writing
  one needs root. It is covered by unit tests and an isolation pin, not by a live probe.
- New contracts: `RefusalSource`, `PermissionOutcome`, `PermissionAnswer`, `PermissionChoice`,
  `PermissionDiff`, `PermissionDetail`, `PermissionPrompt`; `SessionEvent` gained `permission` and
  `permission-resolved`. `WriteDecision` is now an **alias of `PermissionAnswer`** — one union, two
  producers, and the fall-through is still a deny.
- New IPC `session:permission` / `MaestroApi.session.answer(id, requestId, choice)`. **The renderer
  sends a `PermissionChoice`, never a `PermissionAnswer`**: the SDK's allow arm carries
  `updatedPermissions`, which can add blanket allow rules or flip the session to `bypassPermissions`,
  so main constructs the answer. `023` extends that choice rather than replacing it.
- `stop()` now returns `{ stillQueued }` off the `interrupt()` receipt and `stopSession` emits a
  notice when the interrupt left messages queued — previously discarded, and previously `024`'s.
- A pending prompt is answerable from any route: `session-context.tsx` tracks `pending`/`outcomes` and
  auto-opens the pane, and `top-nav.tsx` shows an amber pending badge that outranks the busy dot.
- Tests: `test/core/session-permission.test.ts` (14) and `test/core/permission-registry.test.ts` (8),
  plus three new blocks in the isolation suite's "the session pane" describe — **404 tests, 23 files**.
  Verified in a real Electron window over CDP against the packaged build.

### maestro — a live Claude session in a right-hand pane, and the help chat is gone

- One live, multi-turn Agent SDK session per open project, in a **resizable right-hand pane that
  shifts the layout** rather than overlaying it. `session-pane.tsx` renders the transcript, composer,
  resize handle and read-scope disclosure; `SessionProvider` in `__root.tsx` owns the state, because
  `TopNav` remounts on every navigation. On the create-\* routes the pane takes the `FilePreview`
  column.
- **The help chat is deleted** — `chat-panel.tsx`, `chat-context.tsx`, the `help-chat` member of
  `ClaudeRequest`, `ChatTurn`, and `buildChat` with its history caps. The pane inherits the
  `super-help` dependency as a **session skill** rather than a name in a prompt string.
- The session lives in main, one per `webContents.id` — the same ownership shape as the log tail.
  `src/main/claude-session.ts` composes no prompt, resolves no CLI path and imports no
  `child_process`; teardown reuses `terminateChildGroup()`, now exported from `claude-run.ts`, so the
  pane performs the identical escalation `cancelClaudeRun` does. A project switch ends every session
  and starts nothing; quitting mid-turn leaves no surviving `claude`.
- New IPC: `session:start`, `session:info`, `session:say`, `session:stop`, `session:end`, and the
  `session:event` push channel. **`session:say` carries user-typed text and nothing else**, stamped
  human-authored — the bridge's invariant restated for a surface with no per-turn confirmation.
- **The pane is read-only.** The write scope is empty and nothing can add to it yet, so a refused
  write carries `decideWrite`'s existing "started to answer, not to author" reason. One permission
  engine, two callers.
- **Reads are bounded for the first time**, by a `PreToolUse` hook over a third scope module:
  `src/core/session-scope.ts` (`decideBoundary`, `boundaryTargetOf`, `BOUNDED_TOOLS`,
  `UNBOUNDED_TOOLS`) — pure, and exhaustively unit-tested. `read-scope.ts` discloses,
  `write-scope.ts` bounds writes, this bounds reads. It returns `"out-of-scope"` rather than
  `"deny"`, so routing it to a prompt in `020` is one word plus a UI.
- The readable set is the open project plus **every** local marketplace, resolved in main by
  `listMarketplaces()`; no name and no path crosses the process boundary. They reach the SDK as
  `additionalDirectories` (a first for this app) and the disclosure as the new `origin: "app"`.
- **`skills` alone loads nothing** — the session also needs a local `plugins` entry pointing at
  `bundledPluginDir()`, or the `Skill` tool answers "Unknown skill" for every name. That is the
  plugin **bundled with the app**, not the user's marketplace cache, so a `SKILL.md` edit in this
  repo reaches the pane with no version bump. The plugin's `hooks.json` does **not** fire in a pane
  session, so its tool calls stay out of `maestro_session.log.jsonl` and `/session-log`.
- `PANE_TOOLS = [...SESSION_TOOLS, "Skill"]`. **`AskUserQuestion` is still offered nowhere**: nothing
  renders a structured question yet, and an unoffered tool costs nothing where an offered-then-refused
  one costs turns. It arrives with `021`.
- `settingSources: []` now appears **four** times in `agent-sdk.ts` (smoke, run session, pane session,
  `resolveEffectiveSettings`); `test/isolation.test.ts` counts four. A pane session therefore
  auto-loads no `CLAUDE.md` either.

### maestro — every Claude run is an Agent SDK session, and nothing pre-accepts edits

- `claude:run` no longer spawns `claude -p --permission-mode acceptEdits <prompt>`. Every run —
  create-\*, `/maestro-tasks`, the help chat — is an Agent SDK session (`startAgentSession()` in
  `src/core/agent-sdk.ts`, still the app's only SDK importer).
- **Edit pre-acceptance exists nowhere in the app.** A session may write only the paths the
  confirmation dialog displayed, carried on the preview token as `ClaudeInvocation.writable`; every
  other write is denied with a reason the model can act on. The decision is `decideWrite` in the new
  `src/core/write-scope.ts` — pure, no `fs`, no spawn, no SDK — reached through the SDK's
  `canUseTool`. `test/isolation.test.ts` fails if `acceptEdits`, `bypassPermissions` or
  `dangerouslySkipPermissions` reappears under `src/`.
- The session is offered no shell and no subagents:
  `SESSION_TOOLS` = `Read, Glob, Grep, TodoWrite, WebSearch, WebFetch, Edit, Write`,
  `SESSION_DISALLOWED_TOOLS` = `Bash, Agent, NotebookEdit`.
  Withholding `Bash` is what makes the path check meaningful, and is affordable because `016` moved
  `git init` into the deterministic scaffold.
- A run loads no filesystem settings (`settingSources: []`), so nothing on disk can widen it and no
  key in a settings file can redirect billing. `resolveEffectiveSettings()` now passes `[]` too, so
  the read disclosure describes the session that actually exists — it narrowed visibly, and
  `CLAUDE.md` files are no longer auto-loaded into a run. The managed (administrator) policy tier
  still applies.
- `CLAUDE_ASK_FLAGS` and `BuiltRequest.flags` are deleted; `CLAUDE_BASE_FLAGS` is `["-p"]`. With
  `acceptEdits` gone there is no flag-level difference between an authoring invocation and an asking
  one — the difference is the write scope, which is a list of paths on screen.
- `ClaudePreview.argv` is now the **equivalent** `claude -p` command line rather than what is
  spawned; the dialog's row is relabelled "Equivalent". `ClaudeRunResult.argv` reports what actually
  went out, `code` is `0` on success and `null` otherwise, and the UI renders `error`.
- The child is still a detached process-group leader (the app supplies `spawnClaudeCodeProcess`), and
  teardown is `query.close()` → SIGTERM to the group → SIGKILL after a grace.
