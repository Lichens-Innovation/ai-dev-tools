# Session pane — a Claude session inside the desktop app

**Status: queued as tasks `015`–`026`; `015`–`020` and `023` are done.** Written 2026-08-04 after M5.
Revised 2026-08-05 twice: first against the vendored SDK reference, then against a design interview
that changed roughly half of it. The earlier draft's conclusions about transport and permissions
survive; its scope, sequencing and tool story did not.

**This page is the PLAN, not the build.** Where the two disagree the build wins, and every
disagreement is recorded — `018` and `019` have their own sections below, and everything since is in
**[Drift log](#drift-log--where-the-build-left-the-plan)** at the end. Read that before trusting a
shape, a channel name or a file path on this page.

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

It **replaces the help chat**. `chat-panel.tsx`, `utils/chat-context.tsx` and the
`{ kind: "help-chat" }` request are all deleted. (`CLAUDE_ASK_FLAGS` went in `018`, along with
`BuiltRequest.flags`: with `acceptEdits` gone there is no flag-level difference between an authoring
invocation and an asking one — the difference is the write scope.) Two conversational surfaces would mean two
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

**Shipped in `023`, and this paragraph was half the mechanism.** `updatedPermissions` alone does not
widen anything the user can see: the `PreToolUse` hook runs BEFORE the CLI's permission system, so a
grant that only told the permission system would leave the hook routing the same path into a prompt
forever. A grant widens **both** — the hook's own list and the session-scoped update — and that
asymmetry is also what makes revocation possible at all. See the drift log.

## The tool set is the first permission layer

The single biggest control, and absent from the first draft. Reaching for `allowedTools` is the
trap: it auto-approves without restricting, and unlisted tools fall through to `canUseTool` anyway.

```ts
tools: ["Read", "Glob", "Grep", "Edit", "Write", "AskUserQuestion", "Skill", "TodoWrite", "WebSearch", "WebFetch"];
disallowedTools: ["Bash", "Agent", "NotebookEdit"];
```

`018` shipped this as `SESSION_TOOLS` / `SESSION_DISALLOWED_TOOLS` in `src/core/agent-sdk.ts`, minus
**`AskUserQuestion` and `Skill`** — the form path is headless, so a question has nobody to answer it.
The pane slices extend that constant rather than declaring a second list.

**No `Bash`.** Its only genuine consumer in this system was a _prompt string_ — the
create-marketplace prompt asked Claude to set up git — and a `git init` is exactly as deterministic
as a `mkdir`, so it moved into `scaffold.ts` with the rest of the all-or-nothing writes. **Done in
`016`**: the steps are `dir → repo → manifest → README → plugins/ → commit`, `git` reaches the
scaffold as an injected `GitPort` (`src/core/git.ts`, `execFile` and never a shell), and the prompt
now forbids git instead of asking for it. Nothing left in a create-\* prompt wants a shell. A bare
name in `disallowedTools` removes the tool from the model's context entirely, so it never tries and
finding 5's four wasted turns never happen. This deletes the entire `sandbox` layer from the build:
Bash is the only tool whose filesystem reach cannot be bounded by inspecting `tool_input`, because a
path check cannot see what `cd .. && cat` does at runtime.

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

- **Form path. Done in `018`.** `claude-run.ts` is an SDK query. It still takes a token and nothing
  else and is still the only module that can start anything. `canUseTool` silently auto-allows
  `Edit`/`Write` to exactly the paths `resolveCreateTarget` returned and the dialog displayed, and
  denies everything else with a reason. No prompt UI, no interruption — and **strictly narrower than
  the `acceptEdits` it replaced**, which permitted writing anything anywhere under the marketplace
  repo.
- **Pane path.** Per-action prompts, as above.

`acceptEdits` exists nowhere in the app. `test/isolation.test.ts` fails if it comes back.

**What `018` actually shipped, and where it differs from this page.** The permission _engine_ is
built; the pane slices build UI on top of it rather than a second engine.

- `src/core/write-scope.ts` is the decision, pure and exhaustively unit-tested: `decideWrite`,
  `targetPathOf`, `WRITE_TOOLS`, `READ_ONLY_TOOLS`, `WriteDecision`. The fall-through is a **deny**,
  never `undefined`/`null`. `startAgentSession()` in `agent-sdk.ts` hands it to the SDK as
  `canUseTool`; `SESSION_TOOLS` and `SESSION_DISALLOWED_TOOLS` are exported from the same module.
- **The write scope rides on the preview token** — `ClaudeInvocation.writable`, the paths the
  confirmation displayed. `runPreviewedClaude` has no argument by which a caller could widen it.
  This is the shape `022` grows: a submitted form adds one directory, and nothing else can.
- **The headless tool set is narrower than the pane's.**
  `SESSION_TOOLS` = `Read, Glob, Grep, TodoWrite, WebSearch, WebFetch, Edit, Write`.
  **`AskUserQuestion` and `Skill` are NOT in it** —
  the form path is still headless, so a question has nobody to answer it. `019`/`021`/`026` add
  them; `SESSION_TOOLS` is the list to extend, not a new one to invent.
- **`settingSources: []` now appears three times** in `agent-sdk.ts` — smoke query, session, and
  `resolveEffectiveSettings()`, which backs the disclosure. They must move together or the
  confirmation describes a session that no longer exists, and nothing fails.
  **Consequence not anticipated here: `CLAUDE.md` files are no longer auto-loaded into a run**; the
  SDK needs `settingSources` to include `'project'` for that. The model can still `Read` them. `[]`
  does not drop the managed (administrator) policy tier.
- **Reads were deliberately not widened.** No `additionalDirectories` is passed; the read scope is
  the run's cwd. `023` is where `additionalDirectories` first appears.
- **`ClaudePreview.argv` is now the _equivalent_ `claude -p` command line, not what is spawned.**
  The SDK adds its own stream-protocol flags; `ClaudeRunResult.argv` reports what actually went out
  and deliberately does not match. The dialog's row is labelled "Equivalent". `ClaudeRunResult.code`
  is `0` on success and `null` otherwise.
- **A fake `claude` on `PATH` is no longer a usable test double** — it cannot speak the SDK's private
  stdio protocol. Runs are tested through an injected session (`ClaudeRunDeps`); `spawnClaudeChild`
  is tested directly for the process-group property.

## What `019` actually shipped, and where it differs from this page

The pane exists, read-only, and the help chat is deleted. `src/main/claude-session.ts` owns one
session per `webContents.id`; `startPaneSession()` in `agent-sdk.ts` is a **sibling** of
`startAgentSession()` over the same options with a streaming-input pump, not a second SDK importer.
`session-pane.tsx` + `utils/session-context.tsx` are the renderer half, mounted above the `Outlet`.
Verified in the window: 12/12 on layout, 17/17 on a live session against a real `claude`, with 377
unit tests, typecheck and build clean.

Eight places where the shipped slice is not this page, each of which a later slice inherits:

- **`AskUserQuestion` was NOT added to the tool set; only `Skill` was.** `PANE_TOOLS` is
  `[...SESSION_TOOLS, "Skill"]`. Nothing in `019` can render a structured question, and by finding 5
  an offered-then-refused tool costs turns to argue with while an unoffered one costs nothing. **`021`
  owns adding it**, together with `toolConfig: { askUserQuestion: { previewFormat: 'markdown' } }` —
  which is not passed anywhere yet.
- **The read scope is the open project + EVERY local marketplace, not "the resolved marketplace"
  (singular).** With no create-form handoff in `019` there is no single marketplace to name. Main
  resolves them itself with `listMarketplaces()` — the `source: "directory"` entries of
  `~/.claude/plugins/known_marketplaces.json` — so no name and no path crosses the process boundary.
  The "two sets, not one" table above should be read with that substitution. **`022` and `023`
  inherit a populated `additionalDirectories`**, so `023` grows a list rather than introducing one.
- **Loading the plugin was required, and is absent from the spawn-options block above.** Measured:
  with `settingSources: []`, `skills: ['super-help', …]` alone makes the `Skill` tool answer
  _"Unknown skill"_ for every name, because no installed plugin reaches the session. The block needs
  `plugins: [{ type: "local", path: bundledPluginDir() }]`, after which the session reports exactly
  the five `ai-tools-manager:` skills and nothing else. Also measured: **the plugin's `hooks.json`
  does not fire in the session** — a turn reading a file in a fixture _with_ a `maestro.json` wrote no
  `maestro_session.log.jsonl` — so the `/session-log` pollution this page warns about for
  `settingSources` does **not** arrive with `plugins`. Note which copy is loaded: the plugin
  **bundled with the app**, not the user's installed marketplace cache, so `026`'s `SKILL.md` edits
  reach the pane straight from the repo.
- **An out-of-scope read is refused by the hook (`permissionDecision: "deny"`), not routed to a
  prompt.** `019`'s criterion was "denied with a visible reason"; the `"ask"` routing described under
  "Widening" belongs to `020`. `src/core/session-scope.ts` deliberately returns
  `{ decision: "out-of-scope", path, reason }` rather than `"deny"`, so `020` changes one word in
  `agent-sdk.ts` plus the UI.
- **The boundary hook runs only on the read-only tools** (`BOUNDED_TOOLS` / `UNBOUNDED_TOOLS`).
  `019` also required that a refused write carry `decideWrite`'s reason rather than a new one, and
  letting the boundary answer first would have replaced it. `session-scope.ts` still knows how to
  check write tools, so `023` cannot widen reads by accident when it widens writes.
- **Nothing budget-related was passed** — no `maxBudgetUsd`, `taskBudget`, `effort`,
  `enableFileCheckpointing` or `persistSession`. **`024` owns all of them**, and starts from a
  `startPaneSession` that simply ends the session when the SDK stream ends.
- **`interrupt()`'s receipt is not surfaced.** `stop()` awaits `query.interrupt()` and discards the
  result, so verification item 12's `still_queued` is dropped. Outstanding against `024`.
- **`settingSources: []` is now FOUR occurrences** — smoke, run session, pane session,
  `resolveEffectiveSettings` — and `test/isolation.test.ts` counts four, having counted three after
  `018`. The pane inherits the consequence: **a pane session auto-loads no `CLAUDE.md`**, and the
  model should be expected to be told to `Read` one.

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
- ~~**The scope can be widened by things other than `updatedPermissions`.**~~ **Two of the three
  doors do not exist here — measured in `023`.** `/add-dir` typed into the composer answers
  `/add-dir isn't available in this environment.` in an SDK session, for a directory inside the cwd
  and outside it alike: it is an interactive-CLI-only command, and its refusal is already visible to
  the user as an assistant turn. A Bash `cd` cannot happen because `Bash` is not in the tool set.
  What remains is the `register_repo_root` control request, which only this app could issue and does
  not. The `DirectoryAdded` (with its `source` discriminator) and `CwdChanged` hooks are subscribed
  anyway and are currently unreachable from the pane — a handler for something that cannot happen yet
  is how the first time it can is not silent — and `test/isolation.test.ts` pins both plus the fact
  that the boundary stays anchored to the session's original `cwd`.
- **Do not gate on `pause_turn`-style assumptions.** The read loop ends on the SDK's result message,
  not the first quiet moment.

## Probes to run before building

- Does `resume` honour the pane's `cwd`/`additionalDirectories`, or restore the recorded ones?
  **Still open, and `025` owns it — but `023` settled the half that matters most.** The `PreToolUse`
  hook runs before the permission system and checks a list this app owns, so it remains the authority
  over reads whatever a resume restores. What is left to probe is `settingSources` and the recorded
  `cwd`.
- Does the **`PermissionDenied` hook** fire for hook-issued denials? If so it collapses the
  hook-owns-its-own-transcript-entries awkwardness into one funnel, and its `retry` output is
  interesting. **Still open.** `020` shipped the awkwardness as designed — the hook writes its own
  `{ kind: "refusal", source: "read-boundary" }` entry — so this is now an optional simplification
  rather than a precondition.
- **`PermissionRequest` hook vs `canUseTool`** — a second interactive decision point returning a
  full `{ behavior, updatedInput, updatedPermissions, interrupt }`. Establish precedence and pick
  one deliberately. **Answered by choosing:** `020` and `023` are built entirely on `canUseTool`, and
  `PermissionRequest` is not registered. Precedence was never established because nothing needs it.
- Can a runtime `setMode` reach `bypassPermissions` without `allowDangerouslySkipPermissions`?
  **Moot, and deliberately kept that way.** `023` made the app's permission-update vocabulary a
  hand-narrowed type (`SessionPermissionUpdate`) that cannot express `setMode` at all, and
  `test/isolation.test.ts` fails if the literal appears anywhere under `src/`.

## Verification

Slice attributions are on the items that have been closed. Anything unmarked is still owed.

1. `canUseTool` round-trips through the UI: a `Write` outside the write scope pops a prompt, **Deny**
   leaves no file, **Allow** writes it. Verified in the window, not a unit test. — **`020`**
2. Killing the window mid-ask resolves the parked promise and reaps the child. `ps` shows nothing.
   — **`020`** built it (`denyAll` on both exits) and `test/isolation.test.ts` pins both call sites.
3. A project switch with a live session ends that session and starts nothing implicitly. — **`019`**
4. The same `request_id` delivered twice resolves once — no duplicate prompt, no leaked entry.
   — **`020`** (`permission-registry.ts`, idempotent per request id, settled answers replayed)
5. An auto-denied tool renders via `SDKPermissionDeniedMessage`; a **hook**-denied tool renders too.
   Two assertions, because hook denials do not emit that message. — **`020`**, with one honest limit:
   the auto-denial branch **cannot be provoked from a window** (with `settingSources: []` only the
   machine-wide managed-settings tier survives, and writing one needs root), so it is covered by unit
   tests over the pure `autoRefusal` plus an isolation pin, and that is the whole of it.
6. A create-\* handoff still shows the confirmation dialog before its first turn, and the artifact is
   on disk before the pane opens. — **`022`**, verified live: the dialog appeared with `SKILL.md`
   already written, and **Continue in the pane** is a second button on the same single-use token.
7. `test/isolation.test.ts` fails if the preload gains a raw `updatedInput` or `updatedPermissions`,
   a generic invoke, or a `session:say` call site whose payload is not a user input value.
   — **`019`** + **`020`**, and **widened by `023`**: the same block now also fails if the grant arm
   gains a path, if `SessionPermissionUpdate` names a rule or a disk destination, if any such literal
   appears anywhere under `src/`, or if a grant reaches the SDK without reaching the hook.
8. A session with no `ANTHROPIC_API_KEY` reports subscription usage; one with the var set is rejected
   or warned. Repeat with a key in `~/.claude/settings.json` — `settingSources: []` must close it.
   — **`015`/`018`** (`agentChildEnv`, pinned by `test/core/agent-sdk.test.ts`)
9. `/add-dir` typed into the composer does not widen the scope, and is visible. — **`023`, and the
   answer is narrower than the item assumed**: the CLI refuses the command outright in an SDK
   session, so the scope cannot widen and the refusal is what the user sees. See the drift log.
10. A `Read` outside the read scope raises a prompt via the hook's `"ask"`; granting it adds the
    directory for the session only, and nothing is written to disk. — **`020` + `023`**, verified in
    the window 16/16: every settings file byte-identical before and after, and `~/.claude.json`
    gained no permission-shaped key and never named the granted path.
11. An outstanding ask that is never answered stays outstanding — kill the window, confirm no
    `claude` survives. There is no prompt timeout to rescue a leaked resolver. — **`020`**
12. Stop mid-turn interrupts and leaves the session usable; the receipt's `still_queued` is reflected
    in the UI rather than dropped. — **`020`** (it left `024`)
13. Budget fires, the session ends, **Continue** resumes it with the transcript intact. — **`024`**
14. The packaged build resolves the CLI. Only fails in `build`, never in `dev`. — **`015`**

## Acceptance criteria

- [x] A live, multi-turn Claude session runs inside the app, per project, on the Agent SDK (`019`)
- [x] The help chat is gone and the pane is the only conversational surface (`019`)
- [x] Permission requests render per-tool (path + diff, full URL) and are answerable (`020`)
- [ ] `AskUserQuestion` renders as a structured choice, answered by validated selection — `021`;
      the tool is still not in `PANE_TOOLS`
- [x] Read scope is disclosed before a session starts; write scope starts empty and grows only per submit
      — disclosed and empty since `019`, `023` made the READ half mutable mid-session, and `022`
      closed the write half: one directory per claimed preview token, and nothing else in the app
- [x] A `PreToolUse` hook enforces the boundary and routes out-of-scope calls to the prompt UI
      (`019` built it as a deny, `020` routed it to `"ask"`) — with one surviving deny, for the call
      that names no path and therefore has nothing for a person to authorise
- [x] Session-scoped directory grants work and never touch disk (`023`)
- [x] Auto-denied and hook-denied tool calls are both visible in the transcript (`020`) — see
      verification item 5 for the limit on how the auto-denial half is covered
- [x] `Bash` is absent from the session and `git init` is deterministic (`016` + `018`)
- [x] `acceptEdits` exists nowhere in the app (`018`)
- [x] No orphaned child process survives window close, project switch, or app quit (`018` + `019`)
- [x] A per-session budget ceiling is enforced, surfaced, and continuable (`024`) — three limits,
      not one: `maxBudgetUsd` stops, `taskBudget` paces (where the model accepts one), `maxTurns`
      brakes; and the ending leaves the read loop rather than waiting for a stream end that a
      streaming-input query never delivers
- [ ] A terminal-started session can be resumed, with its prior reads disclosed first — `025`;
      `024` built the resume half (`persistSession`, `resume`, `sessionId()`, one `openSession`
      builder), so what is left is the picker, the disclosure and `forkSession`
- [ ] `test/isolation.test.ts` pins the invariant properties above — partially; `019` added the
      **"the session pane"** describe, `020` added three blocks to it, `023` widened one of those
      and added two more, `022` replaced the empty-write-scope block with one that pins how the
      scope grows and added a block for the no-turn seed, and `024` added two — the ceiling's two
      exits with the token-only continue wire, and the two header levers choosing from lists main
      published

## Drift log — where the build left the plan

This page stopped being a description of the app somewhere around `019`, and drifted silently for two
slices before anyone noticed. This section exists so that cannot happen again: **every slice from
`020` on appends here**, whether or not it changed anything on the page above.

Read it as the errata. The body of this plan is preserved as written — it is the record of what was
believed on 2026-08-05, and rewriting it in place would destroy the only evidence of which
assumptions were wrong. `018` and `019` already have their own sections above, for the same reason;
this is where the rest goes.

### The two shapes on this page that were never built

Both predate `020` and are recorded once, here, rather than corrected inline.

**The component split did not happen.** The Architecture block names
`components/permission-prompt.tsx` and `components/agent-question.tsx`. Neither exists. The prompt UI
is `PermissionCard` inside `session-pane.tsx`, beside the transcript it interrupts, because a parked
tool call has to render pinned above the composer and a separate file for one card bought nothing.
`021` should expect to add the question UI the same way unless it grows large enough to earn a file.

**The channel names are wrong, and one channel does not exist.** The plan lists `session:permit`,
`session:answer`, `session:message`, `session:ask` and `session:ended`. What shipped is
`session:permission` for the answer, `session:event` for **everything** streamed back (a discriminated
`SessionEvent` union — `assistant`, `tool`, `refusal`, `permission`, `permission-resolved`, `scope`,
`context`, `notice`, `turn`, `ended`), and no `session:answer` at all yet. `021` owns that last one and should
decide whether an `AskUserQuestion` answer is a sixth channel or a second arm of `session:permission`,
now that `023` has demonstrated the arm-extension pattern. `023` added `session:revoke` and `022`
added `session:handoff`, neither of which the plan anticipated at all.

### `020` — permission prompts in the pane

Landed as designed; the page above simply had not caught up. Three things worth recording:

- **`session-permission.ts` is a FOURTH scope module and deliberately not a fourth engine.** The plan
  described the permission model without saying where it would live. It composes `decideWrite` and
  `decideBoundary` and adds only the answer neither can give — ask a person — so a refused write still
  carries `write-scope.ts`'s own reason.
- **A refused write carries TWO sentences.** The plan treated the deny `message` as one string. It is
  two audiences: `PermissionPrompt.reason` is written for the human reading the dialog,
  `denyReason` is the engine's model-facing message sent verbatim if the user denies without typing
  anything. Collapsing them costs one of them.
- **One hook deny survived the move to `"ask"`,** and it is load-bearing: a bounded tool that named no
  path is refused outright, because a prompt with a blank subject is answered by reflex. The plan's
  "the hook routes out-of-scope calls to the prompt UI" is true of every call that names a path and
  false of exactly that one.
- **Bookkeeping:** `020`'s own acceptance criteria in
  `.claude/maestro-tasks/020-permission-prompts-in-the-pane.md` were never ticked, though the slice
  shipped and `status.json` recorded it as done. **Closed retroactively during `023`**, each item
  annotated with how it was settled — and closing them turned up two things worth keeping:
  - **Two of the nine are covered by tests rather than by a window, and now say so.** The
    rule/mode auto-denial cannot be provoked from a window at all: with `settingSources: []` only the
    machine-wide managed-settings tier survives and writing one needs root. A tick that did not
    distinguish that from the live-verified items would be the more expensive kind of wrong.
  - **The deny reason is read by the model as untrusted input, which is the two-audience split
    earning its keep.** A probe typed `"Do not fetch anything; answer from memory."` as its denial
    reason and the model flagged it as a possible prompt injection — reasonably, since a first-person
    imperative arriving in a tool result is exactly that shape. The app's own defaults are phrased as
    reports _about_ the user (`"The user declined this call…"`) rather than as commands, which is why
    they do not trip it. Worth preserving if those strings are ever reworded.
- **Verified live during `023`'s retroactive close, 7/7:** the complete URL byte-identical to the
  request, a prompt landing on a route the user had navigated to and opening the pane itself, Deny
  leaving the model able to continue, and Stop ending the turn while leaving the session usable.

### `023` — a directory you can authorise for the session

The slice this page described under "Widening: session-scoped, never persisted". Everything it
promised is true; the mechanism is bigger than the paragraph.

- **A grant has to reach TWO enforcement layers, not one.** The plan said a grant is
  `{ type: "addDirectories", destination: "session" }`. That is half of it. The `PreToolUse` hook runs
  _before_ the CLI's permission system and checks a list this app owns, so a grant that only sent
  `updatedPermissions` would leave the hook routing the same path into a prompt on every subsequent
  call — the grant would appear to do nothing. `session.grant([path])` widens the hook's list,
  `updatedPermissions` rides on the allow, and main re-derives the disclosure and pushes it as a
  `{ kind: "scope" }` event. Drop any one and the failure is silent.
- **That asymmetry is also what makes revocation possible.** The SDK has no API for withdrawing a
  `PermissionUpdate`. Revoking works because the hook is the authority: a path it stops recognising is
  routed back into a prompt before the permission system is ever consulted. This was not foreseen and
  is the reason `session:revoke` could be built at all.
- **The read scope became MUTABLE mid-session — the first thing in the app that is.** `readable` went
  from a captured array to a function, `readable()`, read fresh on every call. A captured copy is the
  obvious implementation and it goes on answering the old question with nothing failing. `022` needs
  the same property for the write accumulator.
- **The dangerous field is closed by the TYPE, not by a code path.** The plan named
  `updatedPermissions` as "the dangerous mutation channel" and stopped there.
  `SessionPermissionUpdate` in `contracts.ts` is a hand-narrowed member of the SDK's union: it cannot
  express `addRules`, `setMode`, or any of the three destinations that write to disk. The isolation
  suite additionally fails on those literals anywhere under `src/`.
- **`PermissionChoice` was EXTENDED, as the task required — with a scope word and no path.** The
  fourth arm is `{ choice: "grant", scope: "file" | "directory" }`. Main holds the prompt being
  answered and resolves the path from the `SessionGrantOption` it published with it. This is
  `scaffold.ts`'s "a renderer describes an artifact and never nominates a directory" applied to the
  permission wire, and it is the pattern `021` should copy.
- **A file gets two offers, a directory gets one, and the difference is on screen.** The plan said
  "grant the directory"; the requirement was finer. `grantOptionsFor` offers a file as itself _and_ as
  its containing directory — as two buttons, each naming its own path — because "Allow this folder" is
  a promise the folder is the obvious one, and the case this prompt exists for is where it is not. A
  directory ≤2 segments deep, or one that contains something already in scope, is flagged `broad`,
  rendered in amber, and its note names what it would swallow.
- **Only a READ is grantable.** `PaneVerdict.grantable` is true in the read-boundary branch and
  nowhere else. A refused write keeps Allow once / Deny / Stop — widening writes is `022`'s, and a
  grant button on a write prompt is exactly how widening writes would widen reads by accident.
- **`ReadScopeOrigin` gained a fourth value, `"session"`,** rather than a second list. That is what
  makes a grant listable, attributable and revocable through the component that already renders
  directories.
- **`/add-dir` does not exist in an SDK session.** Measured: the CLI answers
  `/add-dir isn't available in this environment.` for a directory inside the cwd and outside it alike.
  With `Bash` absent too, two of the three doors this page warned about are closed by the CLI rather
  than by us. `DirectoryAdded` and `CwdChanged` are subscribed anyway and are currently unreachable
  from the pane. See "Things that bite".
- **Verified live, 16/16 plus 5/5**, against real Claude sessions in the packaged build: the prompt,
  both grant options with their own paths, the header listing and its Revoke, the disclosure moving
  with the boundary, a second read in the granted directory going unasked, revocation putting it back
  out of scope, and — the criterion this whole design exists for — **every settings file on disk
  byte-identical before and after**, with `~/.claude.json` gaining no permission-shaped key and never
  naming the granted path.

### `022` — hand off from a create-form into the pane

The last of the pane's fixed scopes. The plan's "a submitted form adds one directory, and nothing
else can" is what shipped; four things about how are not on the page above.

- **The channel is `session:handoff` and it carries a preview TOKEN.** The plan said "pass a
  completed preview token, never a resolved path" and left the entry point unnamed. `HandoffContext`
  rides on `ClaudeInvocation` beside `writable`, built by `claude-preview.ts` from the same
  `resolveCreateTarget` the scaffold wrote with, and main claims the token through
  `claimInvocation(token, "claude")`. A `maestro-task` preview carries `handoff: null` and the
  channel refuses it outright — its write target is the whole project.
- **The scope entry is the artifact's own directory, except where the artifact owns none.**
  `CreateTarget` gained `dir`, which is `""` for a project-target subagent — one `.md` inside
  `.claude/agents/`, shared with every other agent in the project. That case grants the FILE, so
  "exactly one directory" holds wherever there is one to grant.
- **Anything writable is also readable.** `readable()` in `startPaneSession` includes the write
  scope, and `describeSession` lists a handed-off directory as `origin: "app"` only when nothing
  already in scope contains it. A session that may write a file it may not read is asked about the
  read half of every edit — the prompt this slice exists to remove.
- **Telling the CLI about the directory is LAZY, because the SDK has no control request for it.**
  `updatedPermissions` rides on a permission answer and a handoff has no answer to ride on, so the
  `addDirectories` (`destination: "session"`) is carried on the first allow that lands inside a
  newly-opened directory, once.
- **`023`'s function-not-array lesson transferred exactly as it predicted.** `writable()` replaced
  the `writable: []` literal in `canUseTool` and is read fresh per call; `allowWrites(paths)` is its
  only writer.
- **Two things were only learnable in a real window, and one of them silently deleted `020`.**
  A `shouldQuery: false` append is answered with its **own** zero-cost `result` message, which was
  being reported as a `turn` — claiming something ran and clearing the renderer's `busy`;
  `startPaneSession` now counts outstanding user turns and drops a zero-cost result that answers
  none. And the seed's **wording** decides whether the boundary is usable at all: told that writes
  outside the scope were "refused, or come back to the user as a question", the session declined to
  attempt one and explained it could not bypass the app's boundary — so the user never got the
  prompt `020` built. The seed now says plainly that a write elsewhere asks and can be allowed.
- **The write scope has no Revoke and is not owed one.** A grant answers a question the session
  asked and can be taken back because the session can be made to ask again; a write scope entry
  answers a form the user submitted, and ending the session — which a project switch does — is how
  it is withdrawn.
- **Verified live over three probe passes** — 13 mechanics assertions, 11 against a live model, 6
  against the headless path, plus 443 unit tests: the confirmation still first with the artifact
  already on disk, one entry per submit and two after two, the post-handoff event stream exactly
  `context`, `notice`, `scope`, an `Edit` inside the directory raising no prompt, a `Write` on the
  project's `README.md` raising `020`'s prompt with no grant button and leaving the scope at one
  entry when allowed, the headless **Run** path unchanged (`ok` in 26.7s, no session, no scope), and
  a project switch clearing it to `writable: []`.

### `024` — a budget ceiling you can continue past

"Budget is a ceiling with a door" is what shipped, and the door is `session:continue`. The policy and
every sentence the user reads about it live in one new pure module, `src/core/session-budget.ts`,
beside the four scope ones. Five things on the page above were wrong or missing.

- **THE CEILING DOES NOT END A STREAMING-INPUT QUERY, and the pane is one.** This page says "hitting
  it **ends the query**", which is true of a one-shot prompt and false of the pump. Measured: after
  the `error_max_budget_usd` result the pump is still open, so the CLI takes the next turn and answers
  it with another error result — 12 turns in 1.6 seconds, none reaching the model, with the pane
  looking alive and the composer enabled. The read loop therefore **leaves** on a ceiling (`break`,
  `finish`, `query.close()`); the latch is still read in the `catch` for the one-shot shape, which
  does throw. A latch alone makes the ceiling decoration.
- **`maxTurns` counts AGENT turns inside one request, not user messages.** Twelve one-word user turns
  under `maxTurns: 1` never trip it. Anyone writing a turn-ceiling probe needs this first.
- **`total_cost_usd` is CUMULATIVE for the query** (0.00196, 0.00351, 0.00529, 0.00726 over four
  one-word turns), so `accrueTurn` takes the latest with `Math.max` rather than summing, fed from the
  same outstanding-turn guard `022` added. And a pane turn is not cheap: the first costs ≈ $0.01–$0.10
  depending on cache state, so the $0.50 default is tens of turns, not hundreds — which is why
  `sessionBudget()` reads `MAESTRO_SESSION_CEILING_USD` / `MAESTRO_SESSION_MAX_TURNS` from the
  launching process's environment only, on the `MAESTRO_AGENT_SDK_SMOKE` precedent, so the ceiling can
  be demonstrated for cents rather than never demonstrated at all.
- **`taskBudget` is refused outright by some models and nothing advertises which.** Measured on Haiku
  4.5: every turn returns `API Error: 400 This model does not support user-configurable task budgets`
  and does no work; `ModelInfo` has `supportsEffort` and no equivalent. `isPacingUnsupported` spots
  it, `onPacingRejected` fires once, and `reopenWithoutPacing` resumes the conversation with the
  budget **omitted** rather than zeroed. The hard ceiling is unchanged, so nothing widens.
- **One builder, and the exhausted entry survives.** `openSession` in `claude-session.ts` serves
  start, continue and the pacing reopen through a `CarriedSession` (resume id, spend, grants, writes,
  effort, model, pacing) — every field main's own record — so a resumed session cannot get a different
  tool set or boundary. The `LiveSession` entry is kept **only** for a ceiling, because it holds the
  id `session:continue` resumes against; all three teardown paths are unchanged. `025` inherits this:
  `persistSession: true`, `resume`, `PaneSession.sessionId()` and the builder already exist, and what
  remains there is listing the user's own sessions and choosing one — plus `forkSession`, which
  Continue deliberately does not do.
