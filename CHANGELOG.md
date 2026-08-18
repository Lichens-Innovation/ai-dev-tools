# Changelog

Notable changes, newest first. This file starts at maestro task `018`; everything before it is in
`.claude/maestro-tasks/` and `docs/plans/`.

## Unreleased

### maestro — resume a session started in the terminal

- **The pane can pick up a conversation it did not start, and it forks rather than continues.** A
  History control in the session header lists the conversations the CLI's own store holds for the open
  project (summary, first prompt, branch, cwd, age, size); choosing one shows what that transcript
  already read and what replaying it will cost, and Decline starts nothing. Three new channels —
  `session:resumable` (no argument), `session:resume-detail` (id), `session:resume` (id) — and an id is
  honoured only if it came from the list main published. `resumeSession` is the fourth caller of the
  single `openSession` builder, so a resumed session gets the same tool set, boundary and prompts as a
  fresh one; `CarriedSession.fork` becomes `forkSession: true` on the query, only ever with `resume`.
  New pure module `src/core/session-resume.ts` decides what may be offered and owns every sentence
  about it.
- **The three probes, measured against a running CLI.** A resume does **not** restore the recorded
  session's `settingSources` (a project-tier slash command present in the terminal session was absent
  from the resumed one, so `settingSources: []` holds — no permissions widening, no settings-file
  `ANTHROPIC_API_KEY` redirecting billing); it does **not** restore the recorded working directory or
  readable set (`init.cwd` is the resuming query's, and a `Read` of the recorded cwd reached
  `canUseTool`); and `forkSession: true` leaves the source transcript byte-identical while writing the
  fork into the resuming project's store under a new id. Why the disclosure is not optional was also
  measured: the resumed conversation answered a question about a file's contents with **no tool call at
  all**, because the bytes were already in the transcript.
- **Divergences from the plan.** The picker lists every conversation recorded for the project, not only
  terminal-started ones — `listSessions({ includeProgrammatic: false })` returns zero rows for
  SDK-started sessions, which would hide every conversation the app itself has run, so the filter is
  recorded-`cwd` equality plus `includeWorktrees: false` minus this window's own ids. The store is read
  through the SDK's `listSessions` / `getSessionMessages` (new `listStoredSessions` /
  `readStoredMessages` in `agent-sdk.ts`, neither of which throws) rather than by walking
  `~/.claude/projects/`. The disclosure states that it is built from recorded **tool calls** and cannot
  enumerate attached or pasted text. The replay estimate is quoted at a named rate
  (`REPLAY_USD_PER_MTOK = 3`) because the pane's model is selectable. Earlier turns are not re-rendered
  in the scrollback — one notice says what was picked up.
- Tests: `test/core/session-resume.test.ts` (16) plus one isolation block, and 15/15 assertions driven
  in a real window against fixtures under `~/gits` — including that a session in a second fixture
  project was not offered and that both fixture stores were byte-identical afterwards. One bug only a
  window found: the renderer must clear the transcript **before** the resume round trip, since main
  pushes its notice during the call.

### maestro — a budget ceiling you can continue past

- **A session runs under three limits, and a Continue that makes a low ceiling survivable.**
  `maxBudgetUsd` (default $0.50) hard-stops against the CLI's own client-side estimate, `taskBudget`
  tells the model how much room is left so it wraps up rather than being cut off, and `maxTurns`
  (40 per allowance) brakes a cheap non-converging loop. `session:continue` carries a session id and
  nothing else: main resumes the same CLI session, renews the allowance, keeps the lifetime figure,
  and carries the grants, write scope, effort and model across. New pure module
  `src/core/session-budget.ts` holds the policy and every user-facing sentence about it.
- **Divergence from the plan: reaching the ceiling does not end a streaming-input query.** Measured in
  a window — after the `error_max_budget_usd` result the pump stays open and the CLI answers 12
  further turns with error results in 1.6 seconds, none reaching the model, while the composer stays
  enabled. The read loop now leaves on a ceiling (`break`, `finish`, `query.close()`) instead of
  waiting for a stream end that never arrives; the latch is still read in the `catch` for the one-shot
  shape. Also measured: `maxTurns` counts **agent** turns inside a request rather than user messages,
  `total_cost_usd` is cumulative for the query rather than per turn, and Haiku 4.5 rejects
  `taskBudget` with a 400 on every turn with nothing in `ModelInfo` advertising it — hence
  `isPacingUnsupported` and a reopen without the pacing budget, leaving the hard ceiling intact.
- `startPaneSession` also passes `effort`, `persistSession: true`, `enableFileCheckpointing: true` and
  `resume`; new `session:effort` and `session:model` channels change a live session from the header,
  choosing only from the list `supportedModels()` published. `contracts.ts` was extended in place
  (`SpendCeiling`, `SessionEndReason`, `SessionEffort`, `SessionModel`, `SessionSpend`; `spend` /
  `settings` / an extended `ended` on `SessionEvent`; `spend`, `endReason`, `canContinue`, `effort`,
  `model`, `models` on `SessionInfo`). `MAESTRO_SESSION_CEILING_USD` / `MAESTRO_SESSION_MAX_TURNS` are
  read from the launching process's environment only, so the ceiling can be demonstrated for cents.
- Tests: `test/core/session-budget.test.ts` (15) plus two isolation blocks; 477 passing, both
  typechecks clean, packaged build green and driven in a real window.

### maestro — rewrite the create-\* skills for interactive sessions

- **One copy of the create-\* finishing guidance, not two.** The four
  `plugins/ai-tools-manager/skills/create-*/SKILL.md` files are now the single source of it — rewritten
  to serve three entries (app pane, app headless, bare terminal) and to ask rather than guess, using
  `AskUserQuestion` in the pane. `claude-preview.ts`'s `buildCreate` no longer inlines a second copy:
  it states facts only — the scaffold already wrote the target with its frontmatter/manifest complete,
  do not recreate it, move it, or change its frontmatter — and names the skill that holds the
  guidance.
- **Divergence from the plan: `Skill` is no longer pane-only, and a headless run now loads a plugin.**
  The plan assumed `Skill` was a pane-only tool and that a headless run loaded no plugin and no
  skills; deleting the inlined guidance would then have left a headless run reading an instruction
  with its middle removed. `Skill` moved into the base `SESSION_TOOLS`; new `SESSION_SKILLS` (the
  four create-\* skills) and `PANE_SKILLS` (`SESSION_SKILLS` plus `super-help`); `AgentSessionRequest`
  and `ClaudeRunEvents` gained `pluginDir?: string | null`, plumbed from `ipc.ts`'s
  `bundledPluginDir()` through `claude-run.ts` into `agent-sdk.ts` so a headless run can load the
  bundled plugin the same way the pane always has. `AskUserQuestion` stays pane-only.
- `plugin.json` bumped `0.7.0` → `0.8.0` so a terminal reading the version-keyed marketplace cache
  picks up the rewritten skills.
- Tests: 460 tests / 25 files, `pnpm verify` green. Verified in the packaged build: a live pane run, a
  headless create-subagent run, a headless create-marketplace run (repo untouched beyond the
  scaffold's own commit), a headless create-plugin run, and all four skills run from a bare terminal —
  fixtures under `~/gits`, deleted afterward.

### maestro — structured questions from the agent

- **The pane's headline feature: a real choice, not a paragraph to answer in prose.** When
  `AskUserQuestion` arrives, `canUseTool` in `startPaneSession` branches on the tool name **before**
  `decidePaneCall` runs — "Claude wants to use a tool — Allow / Deny" is the wrong sentence for
  "which of these three frontmatter shapes do you want" — and hands it to a card of its own
  (`agent-question.tsx`): per-option description and a monospace preview, single- vs multi-select
  stated on screen, Send disabled until every question is answered, and a freeform reply textarea for
  a user who disagrees with every option.
- **`AskUserQuestion` and its previews are both new to the tool set.** `PANE_TOOLS` gained
  `QUESTION_TOOL` (`[...SESSION_TOOLS, "Skill", QUESTION_TOOL]`) and the pane query now passes
  `toolConfig: { askUserQuestion: { previewFormat: "markdown" } }` — without that second piece Claude
  emits no `preview` on any option and the list arrives bare. Neither was passed anywhere before this.
- **The answer travels back through `updatedInput`, the one field this app otherwise refuses to
  expose, and the carve-out is checkable rather than trusted.** The renderer sends only a _selection_
  — which question, which option labels, via `session:question` and a `QuestionChoice` — and
  `answerQuestions` (`src/core/session-question.ts`, pure) rebuilds the payload from the questions the
  model asked, **rejecting any label that was not among the options it offered** rather than filtering
  it out. `describeQuestions` reads the tool input defensively, dropping unlabelled options and
  questions with no text or fewer than two options.
- **The validation runs in `startPaneSession` (`agent-sdk.ts`), not in the main process — one step
  stronger than planned.** The task called for main to construct and validate the payload; as built,
  the check runs against the tool input exactly as the SDK delivered it, rather than against a copy
  that crossed two process boundaries. `src/main/claude-session.ts` stays a pure forwarder and keeps
  no copy of the question at all — the opposite of how a grant works, deliberately.
- **One registry, two kinds of ask.** `PermissionAnswer` was widened to a union, `ParkedAnswer`
  (`PermissionAnswer | QuestionAnswer`), rather than a second registry being added beside
  `createPermissionRegistry()` — a second one is a second thing to remember to drain on teardown, and
  the forgotten one wedges the session exactly as hard. `PermissionOutcome` gained `answered` (a
  question is never allowed or denied) and `RefusalSource` gained `question` — the fifth and
  narrowest refusal route: an `AskUserQuestion` call carrying nothing renderable is refused outright
  with `QUESTION_REFUSAL`, fully formed by the pure module, rather than parked.
- **A new IPC channel, `session:question`, rather than a fifth arm of `PermissionChoice`** — the
  task's own instruction not to widen an existing wire to mean two things. `SessionEvent` gained
  `{ kind: "question" }`.
- **The renderer keeps `questions` as its own list beside `pending`**, with a derived `waiting`
  count, rather than folding questions into `pending` — the two render and answer too differently for
  one array re-discriminated by every consumer; what they share is `outcomes` and the badge/status
  count. `top-nav.tsx`'s pending badge counts asks of either kind.
- New core module `session-question.ts` (pure: `describeQuestions`, `answerQuestions`, plus
  `QUESTION_TOOL`, `QUESTION_PREVIEW_FORMAT`, `QUESTION_UNRENDERABLE`, `QUESTION_REFUSAL`). New
  contracts `AgentQuestionOption`, `AgentQuestion`, `QuestionPrompt`, `QuestionSelection`,
  `QuestionChoice`, `QuestionAnswer`, `ParkedAnswer`. New component `agent-question.tsx`. New IPC
  `session:question` / `MaestroApi.session.answerQuestion(id, requestId, choice)`.
- Tests: 13 new in `test/core/session-question.test.ts`, including a direct assertion that an
  unoffered label is rejected; a new isolation block, "lets the renderer send a question SELECTION
  and never the answer payload" — **458 tests, 25 files**. Verified in a real Electron window over
  CDP against the packaged build across three probes, fixtures under `~/gits` only and since deleted:
  a two-question call rendered with per-option descriptions and previews, single-select replacing its
  pick and multi-select accumulating, Send staying disabled until both were answered, and the model
  reading back exactly the labels picked; a freeform reply reached the model (`response` on
  `updatedInput` **is** honoured by the CLI — the one open question the plan left); and both closing
  the pane and switching projects with a question outstanding resolved it rather than wedging the
  session, with the next session answering a turn normally afterward.

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
