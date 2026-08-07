# Session pane — a Claude session inside the desktop app

**Status: designed, queued as tasks `015`–`026`.** Written 2026-08-04 after M5. Revised 2026-08-05
twice: first against the vendored SDK reference, then against a design interview that changed
roughly half of it. The earlier draft's conclusions about transport and permissions survive; its
scope, sequencing and tool story did not.

**Get the package right.** This plan is about **`@anthropic-ai/claude-agent-sdk`**, documented at
`code.claude.com/docs/en/agent-sdk/typescript` and vendored at `agent-sdk-typescript.md` in this
repo. It is _not_ `@anthropic-ai/sdk`, the REST client for the Messages API — that one takes an API
key, bills pay-as-you-go, spawns no CLI and has no `canUseTool`. The names differ by one path
segment and the wrong one silently defeats the entire point. Same trap in the repos:
`anthropics/claude-agent-sdk-typescript` is this SDK; `anthropics/anthropic-sdk-typescript` is not.

## Context

Every Claude interaction in `apps/maestro` today is **one-shot and unsteerable**. A create-\* run
produces a body you either accept or redo from the form. The help chat re-sends its own capped
history in every prompt precisely because it has no session. If a task needs one clarification, it
guesses.

That is the hole. It is not "the app has no terminal" — a terminal is worse than the user's real
terminal for anything power-usery. It is that the app can _start_ Claude and cannot _talk to_ it.

## What the pane is

One live session per open project, in a **resizable right-hand pane that shifts the layout rather
than overlaying it**. On the create-\* routes it takes the `FilePreview` column once authoring
begins: that column exists to show the file that _will be_ generated, and once Claude is writing
it, the conversation is the more useful thing to have there — the artifact is already on disk.

It **replaces the help chat**. `chat-panel.tsx`, `utils/chat-context.tsx`, the `{ kind: "help-chat" }`
request and `CLAUDE_ASK_FLAGS` are all deleted. Two conversational surfaces would mean two
transcripts and two consent models, and the help chat is strictly weaker — its whole design rests
on a guarantee ("the user saw exactly what ran", `CLAUDE.md:341`) that a live session abandons
anyway. What the pane inherits from it: the `super-help` skill dependency, now expressed as the
SDK's `skills` option rather than a name in a prompt string.

## What was measured, and why it decides the design

Originally probed against Claude Code 2.1.221 / SDK 0.3.221; re-probed 2026-08-05 against
**2.1.222 / 0.3.222**. Re-run before building; do not take it on faith — one of these was wrong for
four days precisely because nobody did.

**1. ~~The raw CLI cannot surface permission prompts.~~ It can — one undocumented flag.**
`--permission-mode manual` alone does nothing, and the init line reports `"permissionMode":"default"`
even when prompts work — that readback is a red herring. The actual switch is
**`--permission-prompt-tool stdio`**, absent from `--help` but alive in 2.1.222; the SDK's own argv
builder emits it whenever a `canUseTool` callback is supplied. The `initialize` handshake is not
required. The whole raw transport is ~60 lines.

**2. The SDK is still the right choice — for maintenance, not capability.** `can_use_tool` is a
`control_request` on a stdio protocol that is a **private contract between the SDK and the CLI**.
The SDK is versioned in lockstep (`0.3.222` against `2.1.222`) and the CLI moves constantly —
`2.1.220` (Jul 29), `2.1.221` (Aug 3), `2.1.222` (Aug 4). Hand-rolling against an undocumented flag
on a self-updating binary means owning a silent-breakage surface the SDK already owns for us.

Keep finding 1 anyway: it means a raw fallback exists, and it tells us `--help` is not the authority
on what the CLI supports.

**3. Auth comes free from the Claude Code subscription.** No `ANTHROPIC_API_KEY` was set. The SDK
ships no model access and no CLI of its own — it spawns the same binary the app already spawns,
already logged in. Anthropic's support page confirms the billing shape: _"Claude Agent SDK,
`claude -p`, and third-party app usage still draw from your subscription's usage limits."_

A separate Agent-SDK credit pool was announced and **paused on 2026-06-15**. Under that scheme
`claude -p` was slated to be covered by the _same_ credits, so the raw CLI was never an escape hatch
from it. If metering returns, it lands on both paths.

**4. `canUseTool` fires only for tools that would otherwise prompt.** A 25-turn exploration produced
**five** callback invocations; every `Read`, `Glob` and `Grep` was auto-allowed and never consulted
the host. The reference confirms it and names the fix: _"To gate every tool call, use a `PreToolUse`
hook instead."_

The exception matters and is the pane's headline feature: **`AskUserQuestion`, MCP tools marked
`requiresUserInteraction`, and org-`ask` connector tools reach the callback even when an allow rule
matches** — because they need a human by definition.

**5. Denials are recoverable.** The model tried `Bash` four times to batch-read files, was refused
each time, fell back to the permitted read tools, and completed the task. A denial is a signal, not
an abort — **unless** the deny sets `interrupt: true`, which stops the turn. So the pane wants two
controls: **Deny** (refuse this call, let it adapt) and **Stop** (`interrupt: true`).

Note what this finding also costs: four wasted turns arguing with a tool that was never going to be
allowed. Removing a tool from the model's context is cheaper than denying it.

**6. Cost is a _usage_ tax, not an SDK tax.** That exploration was **$1.43 across 25 turns**. The
same turns cost the same through `claude -p`, the SDK, or a hand-rolled stdio client — same binary,
same login, same tokens. Choosing a transport to save money is a category error; the only levers are
`maxBudgetUsd`, `taskBudget`, `effort`, model selection, and how often the pane is allowed to talk.

## Scope

**In:** the pane; a real permission prompt UI; a structured `AskUserQuestion` UI; a two-set
directory boundary with session-scoped widening; a budget ceiling with an explicit continue; the
migration of `claude-run.ts` onto the SDK; resuming a session started in the user's terminal.

**Out:** a terminal emulator (`node-pty`, xterm.js). It costs a native module across every Electron
bump and buys fidelity at the price of the integration this exists for — you cannot render a
"skill created at `<path>`" card from a TTY.

**Out:** an MCP server letting an outside session drive the app _while it runs_. Considered and
declined during design: it inverts control, and it is the shape of the Docker-form deadlock recorded
at `CLAUDE.md:511`. Console-started work reaches the pane through resume instead — see below.

**Out:** persisting any permission grant to disk.

## The directory boundary — two sets, not one

The requirement is that a session cannot leave the selected directory and its subdirectories unless
authorised. The complication is that this app has **three** roots in play: the open **project**, an
arbitrary **marketplace repo** (resolved from `~/.claude/plugins/known_marketplaces.json` by name),
and `~/.claude/` itself. `resolveCreateTarget` in `src/core/scaffold.ts` already juggles all three.

|                 | Contents                                                          | How it grows                             |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| **Read scope**  | open project + subdirectories, plus the resolved marketplace repo | a session-scoped grant the user approves |
| **Write scope** | **empty at session start**                                        | one directory per create-\* form submit  |

The asymmetry is the design. A create run's cwd is the _marketplace_ — right for writing, backwards
for exploring. You want it reading the user's project to learn their conventions and writing only
into the artifact it was opened for. A single set makes write authority as wide as read authority,
and read has to be wide to be useful.

**The write scope's provenance is the point.** Every writable directory traces to a form the user
filled in and a scaffold that already wrote a file there — not to a dialog they clicked. Each
addition is announced inline in the transcript and listed in the pane header. Both sets are derived
in main, inheriting the rule `scaffold.ts:16` already states: _"a renderer describes an artifact and
never nominates a directory."_

`~/.claude/` is outside both by default, and is the natural first customer for authorisation: a user
authoring a skill will reasonably say _"make it like my existing `foo` skill"_.

### Widening: session-scoped, never persisted

Because reads never prompt (finding 4), an out-of-scope read raises nothing on its own — it quietly
works or quietly fails. The `PreToolUse` hook therefore does more than block: it returns
**`permissionDecision: "ask"`**, which _routes_ the call into the prompt UI. The plan's earlier
description of that layer as only "silent, deterministic and unbypassable" was half the story.

A grant is `{ type: "addDirectories", destination: "session" }` — nothing touches disk, it dies with
the session, and it is listed and revocable in the header. **Main authors the `PermissionUpdate`;
the renderer sends a bounded decision and nothing else.** These are the same three properties
`CLAUDE.md:344` already established for the chat's opt-out, and inheriting them beats inventing a
second policy.

## The tool set is the first permission layer

The single biggest control, and absent from the first draft. Reaching for `allowedTools` is the
trap: it auto-approves without restricting, and unlisted tools fall through to `canUseTool` anyway.

```ts
tools: ["Read", "Glob", "Grep", "Edit", "Write", "AskUserQuestion", "Skill", "TodoWrite", "WebSearch", "WebFetch"];
disallowedTools: ["Bash", "Agent", "NotebookEdit"];
```

**No `Bash`.** Its only genuine consumer in this system is a _prompt string_ — `scaffold.ts:430`
asks Claude to set up git for a new marketplace — and a `git init` is exactly as deterministic as a
`mkdir`, so it moves into `scaffold.ts` with the rest of the all-or-nothing writes. A bare name in
`disallowedTools` removes the tool from the model's context entirely, so it never tries and finding
5's four wasted turns never happen. This deletes the entire `sandbox` layer from the build: Bash is
the only tool whose filesystem reach cannot be bounded by inspecting `tool_input`, because a path
check cannot see what `cd .. && cat` does at runtime.

**Web tools stay in, deliberately.** Authoring a skill usually means authoring _about something
external_, and this repo has the staleness problem twice already (`docs/claude-code.md`,
`agent-sdk-typescript.md`). Neither tool touches the filesystem, so neither can breach the boundary.
The real risk is exfiltration — a wide read scope plus an outbound channel — and the control is that
**every `WebFetch` prompt renders the complete URL, query string included, never elided to a
hostname.** This matches the posture the app already took with `ccusage` (`CLAUDE.md:351`): surface
it, pin it, do not silently forbid it.

**No `Agent`.** Subagent prompts arrive with an `agentID` the UI would have to disambiguate, and the
cost multiplies for no gain here.

## The permission model

`canUseTool` returns a `Promise`. Main parks it, pushes to the renderer, and resolves it on the
answer. The registry has four requirements that are easy to miss:

- **Idempotent per `request_id`.** A request whose response was lost in a reconnect gap **is
  dispatched again** — by `reinitialize()`, and also by any `initialize` to a running session, whose
  response wrapper carries `pending_permission_requests` that the SDK dispatches for you.
- **A default resolution for every exit.** Window close, project switch, user walks away — the
  parked promise must resolve, **deny**, or the SDK hangs forever holding a child process. The
  reference is explicit: _"permission prompts don't time out."_ There is no backstop.
- **Never return `null` unless you have already answered out-of-band.** `null` means _"I sent the
  `control_response` myself, echoing `requestId`"_. Return it otherwise and the tool call blocks
  forever. Type the resolution so a fall-through cannot produce `undefined`.
- **Auto-denies bypass the callback.** `SDKPermissionDeniedMessage` (`type: 'system'`, `subtype:
'permission_denied'`) covers deny rules and mode denials, carrying `tool_name`, `tool_use_id`,
  `agent_id`, `message` and a `decision_reason_type` of `"rule"`/`"mode"`/`"classifier"`/
  `"asyncAgent"`. **Hook denials are not reported through it** — so the hook layer owns its own
  transcript entries, and "auto-denied calls are visible" is two separate assertions.

The result shape, from the SDK types — **this is the authority, not the docs page**, which describes
an `approve`/`deny`/`ask` union that does not exist:

```ts
type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | { behavior: "deny"; message: string; interrupt?: boolean; toolUseID?: string };
```

- **`message` is required on deny.** Finding 5 showed the model _reads_ the denial and adapts, so a
  Deny button that sends `"denied"` wastes the one channel for steering it.
- **`interrupt` makes deny two actions** — _"no, do it differently"_ and _"stop"_. Two controls.
- **`updatedPermissions` is the dangerous mutation channel.** `addRules` / `setMode` /
  **`addDirectories`**, each with a destination of `session`, `localSettings`, `projectSettings`,
  `userSettings` or `cliArg` (five, not four). A single accepted update can grant blanket allow
  rules, flip to `bypassPermissions`, or widen the read scope permanently and machine-wide.
- **The callback carries more than tool + input**: `blockedPath`, `decisionReason`, `toolUseID`,
  `agentID`, `requestId`, and `suggestions`. A prompt saying _"`Write` to `<path>`, because
  `<decisionReason>`"_ is a different artifact from a JSON dump.

Prompts render **per tool** — `Write`/`Edit` show path and diff, `WebFetch` shows the full URL. A
generic `{tool, input}` blob is technically correct and practically useless: users click Allow
blindly, which is _worse_ than `acceptEdits` because it looks like consent.

**Permission mode is `default`.** Of the six modes, four are disqualified: `acceptEdits` and
`bypassPermissions` obviously, but also **`auto`** (a model classifier decides for the user) and
**`dontAsk`** (denies without asking — and denies `AskUserQuestion` outright, which would break the
pane's main feature). `allowDangerouslySkipPermissions` is never set.

## Questions are not permissions

`AskUserQuestion` arrives through `canUseTool` like a permission request and is nothing like one.
The callback branches on tool name into a separate component rendering the questions, per-option
`description`, and markdown `preview` — enabled by
`toolConfig: { askUserQuestion: { previewFormat: 'markdown' } }`, without which Claude emits no
previews at all.

The answer travels back in **`updatedInput`**, which this plan otherwise bars from crossing the
preload. That is a real collision and it gets an explicit, _checkable_ carve-out: the renderer sends
`{ questionIndex, labels[] }`, main constructs the object, and **main validates that every label was
present in the options it received.** Arbitrary input cannot be laundered through it. This is the
third use of the pattern the preview token established — a decision crosses the boundary, never a
payload.

The freeform `response` field is kept: it is literally user-typed text, which is what `session:say`
is already allowed to carry.

## The invariant

The bridge's guarantee is: **the only executable prompts are ones the user was shown.** Enforced by
`claude:run` taking a token and nothing else, pinned by `test/isolation.test.ts`.

The pane restates it: **the renderer never authors a prompt. The user does.**

- **First turn keeps preview → token.** A create-\* handoff still goes through `claude:preview` and
  the confirmation dialog. Artifact on disk before Claude is mentioned; this plan does not touch it.
- **`session:say` carries only user-typed text**, and stamps `origin: { kind: "human" }`. That field
  is not decoration: Claude Code treats a user message with no origin as _unattributed_, and checks
  requiring a human-typed prompt reject it. It makes the invariant enforceable at the SDK boundary,
  not only in a test.
- **Seeded context uses `shouldQuery: false`**, which appends to the transcript **without spending a
  model call**. That is the create-\* handoff: inject "the scaffold wrote X at `<path>`" as context,
  and let the user's first typed turn be the one that costs anything.
- **`session:permit` carries a bounded decision.** `updatedInput` and `updatedPermissions` never
  cross the preload except through the two validated carve-outs above.

## Architecture

The session lives in **main**, never the renderer — same ownership shape as the log tail: one per
`webContents.id`, retargeted on project switch, disposed on quit. State sits in a provider above the
`Outlet` in `__root.tsx`, because `TopNav` remounts on every navigation and losing the handle on a
run in flight means losing the Stop (`CLAUDE.md:407`).

```
src/main/claude-session.ts   the SDK query, the message pump, the permission registry
src/main/claude-run.ts       still the only module that spawns — now an SDK query
src/renderer/src/components/session-pane.tsx        transcript + composer
src/renderer/src/components/permission-prompt.tsx   the ask UI
src/renderer/src/components/agent-question.tsx      the AskUserQuestion UI
src/renderer/src/utils/session-context.tsx          single-owner subscriber
```

```
session:start   → { projectRoot, seed? }      returns id
session:say     → { sessionId, text }         a turn the USER typed
session:stop    → { sessionId }               interrupt
session:permit  → { requestId, decision }     allow | deny (+message, +interrupt) | grant-dir
session:answer  → { requestId, questionIndex, labels[] | response }
session:message ← streamed assistant text, tool calls, results
session:ask     ← a pending permission request
session:ended   ← outcome, usage, cost
```

### Spawn options

```ts
{
  cwd: projectRoot,
  additionalDirectories: [marketplacePath],
  tools, disallowedTools,                      // above
  permissionMode: 'default',
  settingSources: [],                          // see below
  settings: { /* explicit, app-authored */ },
  skills: ['create-skill','create-subagent','create-plugin','create-marketplace','super-help'],
  systemPrompt: { type: 'preset', preset: 'claude_code', append: maestroContext },
  toolConfig: { askUserQuestion: { previewFormat: 'markdown' } },
  canUseTool,
  hooks: { PreToolUse, DirectoryAdded, CwdChanged, PermissionDenied },
  spawnClaudeCodeProcess: existingDetachedSpawn,
  pathToClaudeCodeExecutable: resolveClaudeCli().bin,
  env: { ...process.env, ANTHROPIC_API_KEY: undefined },
  maxBudgetUsd, maxTurns, taskBudget, effort: 'medium',
  enableFileCheckpointing: true,
  persistSession: true,
}
```

**`systemPrompt` is not optional.** Its default is a _minimal_ prompt, not Claude Code's — a pane
built without setting it behaves unlike every other Claude surface the user knows.

**`settingSources: []`**, with an inline `settings` object main authors. Three reasons specific to
this app. Maestro's own hooks live in the project's `.claude/settings.json` (`CLAUDE.md:212`), so
loading project settings writes the pane's every tool call into `maestro_session.log.jsonl` and into
`/session-log`, a view built for orchestrator runs. "Project settings" resolve against `cwd`, and a
marketplace is a repo the user cloned from someone else — third-party input configuring the session.
And it is the second door for `ANTHROPIC_API_KEY`, which overrides the env we carefully built and
bills the API silently. Everything needed is passed programmatically instead, so the pre-start
disclosure describes the whole configuration rather than a merge with files nobody looked at.

## Instructions come from the skills, not the prompt

Today `claude-preview.ts:100` inlines what the SKILL.md would have said, because "a slash command
re-enters the skill from the top and re-derives fields the payload already carries."

That rule exists **because headless print mode has nobody to ask** — the same root cause as
`acceptEdits`. The pane can ask. So the four create-\* SKILL.mds are loaded through the `skills`
option and rewritten to assume an interactive session, and the inlined copies go. One source of
guidance for both the app and the terminal, instead of two that drift.

The rewrite must handle **both entries**: "the artifact exists, finish it" (the app) and "nothing
exists yet, gather what is missing" (a bare `/create-skill` in a terminal). Assuming a scaffold is
present is how you get a terminal session talking about a file nobody made.

## The two write paths

Both stay, because they differ in _who is driving_ — a form you filled in and approved once, versus
a conversation you steer turn by turn. What would make that indefensible is the two paths having
different **authority**, so they share one permission engine:

- **Form path.** `claude-run.ts` becomes an SDK query. It still takes a token and nothing else and
  is still the only module that can start anything. `canUseTool` silently auto-allows `Edit`/`Write`
  to exactly the path `resolveCreateTarget` returned and the dialog displayed, and denies everything
  else. No prompt UI, no interruption — and **strictly narrower than the `acceptEdits` it replaces**,
  which permits writing anything anywhere under the marketplace repo.
- **Pane path.** Per-action prompts, as above.

`acceptEdits` then exists nowhere in the app.

## Budget is a ceiling with a door

`maxBudgetUsd` is compared against a **client-side estimate** with documented accuracy caveats — a
real ceiling on an approximation. Hitting it **ends the query**, which on a conversational surface
means the session is over.

So the naive implementation loses the conversation, people set the ceiling high enough that it never
fires, and it stops being a control. Instead: the budget fires, the session ends cleanly, and the
pane offers _"this session has used $X. Continue?"_ — a new query with `resume: sessionId` and a
fresh allowance. The transcript survives, the user re-consents to spending, and the ceiling can be
set genuinely low, which is the only way it does its job.

`taskBudget: { total }` (alpha) sits underneath: it tells the _model_ its remaining token budget so
it paces and wraps up, where `maxBudgetUsd` just stops the world. For a pane that might be mid-write
when the ceiling lands, "wrap up" is a materially better failure mode.

`effort` defaults to `medium` and the header carries a model selector — `setModel()` works on a live
session, so switching costs no transcript.

## Resuming a session started in the terminal

`listSessions({ dir })` returns every session for a project with `summary`, `cwd`, `gitBranch`,
`firstPrompt` and `lastModified`; `getSessionMessages()` reads the transcript; `resume` continues
it. So a user can start with `/create-skill` in their own terminal and pick the conversation up in
the pane — carrying not just the artifact but everything they said getting there.

Three things to get right:

- **`forkSession: true`**, or the app writes into the user's own terminal session history.
- **The imported transcript was never gated by this boundary.** It was produced under the terminal
  session's rules — any tools, any mode, possibly `--dangerously-skip-permissions` — so it can
  already contain the contents of files from anywhere on disk. The pane's options apply going
  _forward_ only. Before resuming, disclose what that session read. Without this, "cannot leave the
  selected directory" is true of future turns and quietly false of the starting context.
- **Probe whether `resume` honours the pane's `cwd`/`additionalDirectories`** or restores the
  recorded ones. Load-bearing for the boundary; unanswered by the reference.

## Reuse, and one trap in it

`humanizeLog` in `renderer/src/utils/session-log.ts` renders humanized tool calls and is directly
reusable for the transcript.

**But `buildInstances` is not.** It segments the _hook-written_ `maestro_session.log.jsonl` by
origin change and correlates dispatch↔handoff by `agent_id`. The pane reads the **SDK message
stream** — a different source with different shapes. Reuse at the humanize level.

## Things that bite

- ~~**The SDK must be externalized, and there is nowhere to put it.**~~ **Done in 015, and it was
  worse than this.** The block was indeed missing and had to be created, and the SDK indeed must
  _not_ join the `exclude: ["@repo/claude-fs"]` list — that list is for workspace _source_
  packages, the opposite case. But `externalizeDepsPlugin` **does not externalize anything under
  vite 8**: it assigns `config.build` from inside the `config` hook, the same breakage
  `electron.vite.config.ts` already documented for its `include` option. Measured: with the SDK in
  `dependencies` and only the plugin to act on it, the build inlined **1.34 MB into
  `out/main/chunks/`**. Externals are now derived from the manifest into
  `rollupOptions.external` — where `electron` already was, which is why nobody noticed. Anything
  added to `dependencies` from here on is external automatically; nothing else is.
- **Externalizing is necessary but not sufficient — asar is the second half.** A packaged build also
  needs `asar: { unpack: "**/node_modules/@anthropic-ai/**" }` plus `app.asar` → `app.asar.unpacked`
  rewriting on the resolved path. The single most reported Agent-SDK-in-Electron failure. **Not yet
  actionable:** there is no electron-builder config in the repo, so this is a constraint on whoever
  adds packaging.
- **Feed it the resolved binary path.** `claude-cli.ts` resolves explicitly because a GUI-launched
  Electron app's PATH lacks `~/.local/bin`, and this does not reproduce from a terminal. Sharper
  still: the SDK's default path spawns **Node** to run a bundled `cli.js`, which fails as `spawn node
ENOENT` in a GUI-launched app. On this machine `~/.local/bin/claude` is a bun-compiled native
  single-file binary, so passing the resolved path sidesteps the Node lookup entirely.
- **`env` REPLACES the subprocess environment rather than merging it.** Passing it naively drops
  `PATH` and re-acquires the bug `claude-cli.ts` exists to prevent. The shape is
  `{ ...process.env, ANTHROPIC_API_KEY: undefined }`; the type admits `undefined` for exactly this.
- **Keep the process-group spawn.** The app spawns detached _specifically_ so Stop reaches the CLI's
  own children, with `disposeClaudeRuns()` on quit. Do not trade that for the SDK's teardown —
  `spawnClaudeCodeProcess` takes a custom spawn function, so the working answer stays. Teardown must
  still call `close()`; `interrupt()` stops a turn, `abortController` aborts the query, and
  `close()` is explicit teardown, and they are not interchangeable.
- **Sessions are keyed on `projectRoot` and dropped on switch.** Same failure class as
  `seedWorkflowStore`'s keying and `clearInvocations()`. Both prior instances were silent.
- **The scope can be widened by things other than `updatedPermissions`.** `/add-dir` typed into the
  composer, the `register_repo_root` control request, and a Bash `cd` persisting the working
  directory. `DirectoryAdded` (with a `source` discriminator) and `CwdChanged` hooks exist to
  observe all three; subscribe to them and treat them as boundary events, not log lines.
- **Do not gate on `pause_turn`-style assumptions.** The read loop ends on the SDK's result message,
  not the first quiet moment.

## Probes to run before building

- Does `resume` honour the pane's `cwd`/`additionalDirectories`, or restore the recorded ones?
- Does the **`PermissionDenied` hook** fire for hook-issued denials? If so it collapses the
  hook-owns-its-own-transcript-entries awkwardness into one funnel, and its `retry` output is
  interesting.
- **`PermissionRequest` hook vs `canUseTool`** — a second interactive decision point returning a
  full `{ behavior, updatedInput, updatedPermissions, interrupt }`. Establish precedence and pick
  one deliberately.
- Can a runtime `setMode` reach `bypassPermissions` without `allowDangerouslySkipPermissions`?

## Verification

1. `canUseTool` round-trips through the UI: a `Write` outside the write scope pops a prompt, **Deny**
   leaves no file, **Allow** writes it. Verified in the window, not a unit test.
2. Killing the window mid-ask resolves the parked promise and reaps the child. `ps` shows nothing.
3. A project switch with a live session ends that session and starts nothing implicitly.
4. The same `request_id` delivered twice resolves once — no duplicate prompt, no leaked entry.
5. An auto-denied tool renders via `SDKPermissionDeniedMessage`; a **hook**-denied tool renders too.
   Two assertions, because hook denials do not emit that message.
6. A create-\* handoff still shows the confirmation dialog before its first turn, and the artifact is
   on disk before the pane opens.
7. `test/isolation.test.ts` fails if the preload gains a raw `updatedInput` or `updatedPermissions`,
   a generic invoke, or a `session:say` call site whose payload is not a user input value.
8. A session with no `ANTHROPIC_API_KEY` reports subscription usage; one with the var set is rejected
   or warned. Repeat with a key in `~/.claude/settings.json` — `settingSources: []` must close it.
9. `/add-dir` typed into the composer does not widen the scope, and is visible.
10. A `Read` outside the read scope raises a prompt via the hook's `"ask"`; granting it adds the
    directory for the session only, and nothing is written to disk.
11. An outstanding ask that is never answered stays outstanding — kill the window, confirm no
    `claude` survives. There is no prompt timeout to rescue a leaked resolver.
12. Stop mid-turn interrupts and leaves the session usable; the receipt's `still_queued` is reflected
    in the UI rather than dropped.
13. Budget fires, the session ends, **Continue** resumes it with the transcript intact.
14. The packaged build resolves the CLI. Only fails in `build`, never in `dev`.

## Acceptance criteria

- [ ] A live, multi-turn Claude session runs inside the app, per project, on the Agent SDK
- [ ] The help chat is gone and the pane is the only conversational surface
- [ ] Permission requests render per-tool (path + diff, full URL) and are answerable
- [ ] `AskUserQuestion` renders as a structured choice, answered by validated selection
- [ ] Read scope is disclosed before a session starts; write scope starts empty and grows only per submit
- [ ] A `PreToolUse` hook enforces the boundary and routes out-of-scope calls to the prompt UI
- [ ] Session-scoped directory grants work and never touch disk
- [ ] Auto-denied and hook-denied tool calls are both visible in the transcript
- [ ] `Bash` is absent from the session and `git init` is deterministic
- [ ] `acceptEdits` exists nowhere in the app
- [ ] No orphaned child process survives window close, project switch, or app quit
- [ ] A per-session budget ceiling is enforced, surfaced, and continuable
- [ ] A terminal-started session can be resumed, with its prior reads disclosed first
- [ ] `test/isolation.test.ts` pins the invariant properties above
