# ai-tools-manager

A containerized web form app that provides a UI layer for Claude Code skills. When a hook triggers (e.g. `/create-skill`), the hook script opens this app in the browser, the user fills the form, and the app writes a result file that unblocks the hook and returns data to Claude.

## Architecture

The app communicates with the host via two `/tmp/` files mounted as Docker volumes. The host-side names are **keyed per project** (`<key>` = a 12-char SHA-1 of the project cwd, derived by `scripts/lib/maestro-app-paths.sh`); the container always sees fixed mount names:

| File (host) | Mounted as (container) | Direction | Purpose |
|---|---|---|---|
| `/tmp/ai-tools-result.<key>.json` | `/tmp/result.json` | app → hook | Form submission payload, read by hook after user submits |
| `/tmp/ai-tools-marketplace.<key>.json` | `/tmp/marketplace-data.json` | hook → app | Pre-computed marketplace/plugin list for dropdowns |

The reason marketplace data is pre-computed on the host: local marketplace `installLocation` paths in `known_marketplaces.json` are host paths — they don't exist inside the container. The file also includes `cwd` (the Claude working directory at hook time) so forms can use it as a default (e.g. `targetDir` in `create-marketplace`) and so the app can write project-scoped files back.

### Lifecycle — persistent, per-project, session-scoped (not one-shot)

The container is a **persistent, per-project service**, started once and reused across many submits, torn down only when the **last** Claude session *for that project* ends. Each project (keyed by its cwd) gets its own compose project name (`ai-tools-<key>`), its own port (allocated once in the **3010–3099** range and persisted in the state file), and its own `/tmp` channel files — so two sessions in different repos run side by side without colliding. (`scripts/lib/maestro-app-paths.sh` is the single source of those derivations; plain `docker compose up` for local dev still uses the fixed port 3009.) The launch logic is split into two primitives plus a compat wrapper:

- `ensure-ai-tools-app.sh [route]` — idempotent: regenerates `/tmp/ai-tools-marketplace.<key>.json` (so `cwd`/`repoRoot` stay current), allocates/recovers the project's port, starts the container only if it isn't already serving on that port, opens the browser, and writes `/tmp/ai-tools-app.<key>.state` (compose file + project name + port — the flag that says "the app was started, here's how to stop it"). **No blocking, no teardown.**
- `wait-ai-tools-result.sh` — truncates `/tmp/ai-tools-result.<key>.json`, blocks until it's non-empty, prints it. Called once per submit.
- `launch-ai-tools-manager-app.sh <form-name>` — the legacy one-shot entry point used by the four `create-*` `UserPromptExpansion` hooks and by `/maestro-app`; now just `ensure` + `wait` with **no `EXIT`-trap teardown**.

**Reference-counted teardown (per project).** Teardown can't fire on the first `SessionEnd` — that would pull the container out from under other live sessions in the same repo (the bug that motivated this). Instead each session registers a marker file `/tmp/ai-tools-app.sessions/<key>/<session_id>` at `SessionStart` (`maestro-app-session-register.sh`); the `SessionEnd` hook (`maestro-session-cleanup.sh`) drops that session's marker and only runs `docker compose -p ai-tools-<key> down` (and removes that project's tmp files) once **no markers remain for that project** *and* its state file is present. Other projects' containers are never touched. A session that crashes without a `SessionEnd` leaves a stale marker; the escape hatches are the in-app **Stop** button or a manual stop from Docker Desktop (`restart: unless-stopped` honors a manual stop; the next `ensure` restarts it).

### Dispatcher (`/ai-tools`) and deterministic pre-scaffold

The `/ai-tools` skill brings the app up once and **listens in a loop** (`wait` → route → repeat) until a `shutdown` result (in-app **Stop** button), Esc, or `SessionEnd`. Each submit carries a top-level `aiToolsAction` discriminator the dispatcher routes on. On submit the app does the **deterministic part immediately** — `submitMaestroConfig` writes `maestro.json`, and the `create-*` submit fns pre-scaffold files via `src/utils/scaffold.ts` (dir + frontmatter/skeleton, plugin manifest + registration) — reporting a `scaffold { scaffolded, path, remaining, reason }` object; Claude then finishes only the intelligent part (authoring a body, enriching a README). In-app writes go through `mountedProjectPath`, so targets outside the mounted repo degrade to `scaffolded: false` and the dispatcher creates them host-side.

## Routes

- `/` — Splash page; shown if user opens the app directly (not via a skill)
- `/maestro` — redirect-only route; `loader` immediately `redirect`s to `/workflows` (a convenience alias)
- `/create-skill` — Skill creation form
- `/create-subagent` — Subagent creation form
- `/create-plugin` — Plugin creation form
- `/create-marketplace` — Marketplace creation form
- `/workflows` — Visual agent-workflow editor (React Flow canvas). Writes the workflow slice of `.claude/maestro.json` (v3). See the `workflow-view` skill in `.claude/skills/`.
- `/rules` — Assign rules (on-disk project rules + installable vibe-rules) to the project root and/or directory paths. Writes the `rules` slice of the same `maestro.json`; on save the skill runs `maestro-apply-rules.js` to move project rule files / `vibe-rules load` installable ones into their assigned `.claude/rules/`. See the `rule-view` skill.
- `/session-log` — Read-only view of `<cwd>/.claude/maestro_session.log.jsonl`. Three-pane layout: thin left step list (step names with status icons — green checkmark/red cross/yellow warning), center framed log (humanized tool calls per step in rounded bordered sections, click to select), right detail panel (Input/Process/Output for the selected step). Clicking a step in any pane selects it across all three. Live-streams via SSE (the file is ephemeral — cleared at SessionEnd).
- `/maestro-tasks` — Read-only list of the task prompt files `/to-maestro-tasks` writes under `<cwd>/.claude/maestro-tasks/*.md`. Left pane: one selectable card per task (filename, title, `Blocked by` badges). Right pane: the task markdown rendered via `react-markdown` + `remark-gfm` inside `prose prose-neutral` (the typography plugin + token-themed `.prose` from the shared `@repo/styles`, same as help-server's doc reader), with a `CopyableText` "Copy prompt" button (`@repo/ui/copyable-text`) that copies `Do the task described in file <relativePath>` to paste into a Maestro session.

## Form architecture

All four create routes follow the same pattern:

- **State**: `react-hook-form` + `zod` (via `@hookform/resolvers/zod`). Zod schema lives at the top of the route file; the inferred type drives `useForm<T>`.
- **UI primitives**: `@repo/ui` — `Button`, `Field`, `Input`, `Textarea`, `ChipInput`, `Select`, `ModePill`, `ThemeToggle`, `ShortcutsDialog`, `FilePreview`, `SyntaxLine`. Icons come from `lucide-react`.
- **Layout**: split-pane — form on the left, live `FilePreview` on the right showing the file that will be generated.
- **Submit feedback**: because the app is a persistent session reused across many submits, the form is **not** replaced by a terminal success view. On submit each route fires a **toast** (`@repo/ui/toast`, `toast(message, { variant })`) and stays mounted — the four create forms `reset()` to blank for the next artifact; `/workflows` and `/rules` keep their canvas. A single `<Toaster />` lives in `__root.tsx`; `toast()` is an imperative module-level store (no provider/context plumbing through routes).
- **Keyboard shortcuts**: ⌘N (jump to field), ⌘↵ (submit), `?` (help), Esc (close).
- **`target` toggle (skill & subagent only)**: a second `ModePill` lets the user pick `marketplace` or `project`. In project mode the marketplace/plugin selectors are hidden and the file is written under `<cwd>/.claude/`.

Per-route preview components live in `src/components/` and compose `FilePreview` with their own `lines: string[]`. Shared text helpers (`buildDesc`, `firstSentence`, `joinOxford`, `clip`, `titleFromName`) live in `src/utils/text.ts`.

## Adding a new route / form

1. Create `src/routes/<name>.tsx` mirroring the structure of `create-plugin.tsx` (no mode) or `create-skill.tsx` (auto/manual + target). Define the zod schema, wire `useForm` + `Controller`, render with `Field`/`Input`/`Select`/`ChipInput` from `@repo/ui`.
2. Create `src/utils/<name>.ts` with two server fns: a `submit<X>Form` that writes a `UserPromptExpansion` result, and a `cancel<X>Form` that writes a `decision: "block"` result. Target dispatch (marketplace vs project) lives here.
3. Create `src/components/<name>-preview.tsx` — render `FilePreview` with `lines={...}` describing the file the skill will generate.
4. Register the hook in `plugins/ai-tools-manager/hooks/hooks.json` with matcher `<name>` and args `["${CLAUDE_PLUGIN_ROOT}/scripts/launch-ai-tools-manager-app.sh", "<name>"]`.
5. Write the consuming skill at `plugins/ai-tools-manager/skills/<name>/SKILL.md` documenting the JSON payload contract (mode, target, fields) and the file(s) Claude should write.

The unified `plugins/ai-tools-manager/scripts/launch-ai-tools-manager-app.sh` handles container orchestration — no new shell script needed.

## Result file format

On submit, write one of:

```json
// Success — passes data back to the skill as extra context
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptExpansion",
    "additionalContext": "..."
  }
}

// Cancellation — blocks skill execution
{ "decision": "block", "reason": "..." }
```

Every result also carries a **top-level `aiToolsAction`** discriminator (`create-skill` | `create-subagent` | `create-plugin` | `create-marketplace` | `maestro-config` | `shutdown`) that the `/ai-tools` dispatcher routes on; it sits alongside `hookSpecificOutput`, so the legacy hook contract is untouched. `maestro-config` results also include `sliceType` (`workflows` | `rules`); `create-*` results include a `scaffold` object describing what the app already wrote; the in-app **Stop** button writes `{ "aiToolsAction": "shutdown" }`.

## Dev

```bash
cd apps/ai-tools-manager
docker compose up --build
# App available at http://localhost:3009
```

The container mounts `../..` at `/app` and `~/.claude` at `/root/.claude` (read-only). `node_modules` and `.output` are excluded from the host mount via anonymous volumes — if dependencies change, run `docker compose down -v && docker compose up --build` to rebuild them.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `RESULT_FILE` | `/tmp/result.json` | Where the app writes form results |
| `NODE_ENV` | `development` | Passed by docker-compose |

## Key files

- `src/routes/create-{skill,subagent,plugin,marketplace}.tsx` — creation forms
- `src/utils/create-{skill,subagent,plugin,marketplace}.ts` — submit/cancel server fns: pre-scaffold via `scaffold.ts`, then write the result via the shared `create-result.ts` helpers
- `src/utils/create-result.ts` — shared `writeCreateResult` / `writeCancelResult` for the four create flows (single source of the `aiToolsAction` + `scaffold` + `additionalContext` result shape, so they can't drift)
- `src/utils/scaffold.ts` — deterministic pre-scaffold helpers (`scaffoldSkill/Subagent/Plugin/Marketplace`); reuses `text.ts` + `mountedProjectPath`, degrades gracefully for unreachable targets
- `docs/ai-tools-create-shared.md` (repo root) — shared reference doc the four `create-*` `SKILL.md` link to: the reference-doc list, where the form payload comes from, and the scaffold-finishing contract (replaces the boilerplate each skill used to repeat)
- `src/utils/ai-tools-session.ts` — `shutdownAppSession` server fn (writes `aiToolsAction: "shutdown"`), wired to the top-nav **Stop** button
- `src/utils/marketplace.ts` — loader server fns (`getMarketplaceData`, `getMarketplaceList`, `getMarketplaceDefaults`). Returns `cwd` so target=project can write under the user's working directory.
- `src/utils/text.ts` — shared text helpers (`buildDesc`, `firstSentence`, `joinOxford`, `clip`, `titleFromName`)
- `src/components/{skill,subagent}-template-preview.tsx` and `{plugin,marketplace}-manifest-preview.tsx` — per-route `FilePreview` renderers
- `packages/ui/src/` — shared primitives consumed by every form
- `plugins/ai-tools-manager/scripts/ensure-ai-tools-app.sh` — idempotent container start + browser open + precompute + state file (no blocking, no teardown)
- `plugins/ai-tools-manager/scripts/wait-ai-tools-result.sh` — truncate + block for one result + print (one per submit / loop iteration)
- `plugins/ai-tools-manager/scripts/launch-ai-tools-manager-app.sh` — legacy one-shot wrapper (`ensure` + `wait`, no teardown); used by the `create-*` hooks and `/maestro-app`
- `plugins/ai-tools-manager/scripts/maestro-app-session-register.sh` — `SessionStart` hook: registers `/tmp/ai-tools-app.sessions/<key>/<session_id>` so the per-project container teardown is reference-counted (survives until the last session for that project ends)
- `plugins/ai-tools-manager/scripts/lib/maestro-app-paths.sh` — sourced by every bash lifecycle script: derives the per-project `<key>`, compose project name (`ai-tools-<key>`), port, state file, and `/tmp` channel-file paths from the project cwd
- `plugins/ai-tools-manager/scripts/maestro-session-cleanup.sh` — `SessionEnd` hook: removes ephemeral Maestro session files, drops this session's marker, and tears the container down only when no markers remain
- `plugins/ai-tools-manager/scripts/maestro-validate-tasks.js` — `PostToolUse` hook (matcher `TaskCreate`): validates each created task against a step in the active workflow's success path, tracking covered steps across the session in the ephemeral `maestro_session_tasks.json`; warns via `additionalContext`/`systemMessage` on an unmatched task or a skipped success-path step. No-op when `maestro.json` is absent or no workflow is active.
- `plugins/ai-tools-manager/hooks/hooks.json` — hook registration (`SessionStart`, `SubagentStart`/`Stop`, `PreToolUse`, `PostToolUse`, `SessionEnd`, and the four `create-*` `UserPromptExpansion`)
- `plugins/ai-tools-manager/skills/ai-tools/SKILL.md` — `/ai-tools` dispatcher: ensure-up + listen-loop routing every submit by `aiToolsAction` until shutdown/SessionEnd
- `plugins/ai-tools-manager/skills/{create-skill,create-subagent,create-plugin,create-marketplace}/SKILL.md` — the prompts that consume the form result (now scaffold-aware: finish only the remaining content when `scaffolded: true`)
- `packages/claude-fs/src/index.ts` — shared `~/.claude/` reading utilities used by server functions

### Maestro config editor (workflows & rules)

- `src/routes/workflows.tsx` — `/workflows` route: left agents/skills pane, save, workflow CRUD
- `src/routes/rules.tsx` — `/rules` route: assign rules to project root / directory paths
- `src/components/workflow-canvas.tsx` — the React Flow (`@xyflow/react`) canvas: nodes, edges, all graph interactions
- `src/components/instance-picker.tsx` / `src/components/instance-skill-picker.tsx` — reuse/create instance picker; the per-instance skill picker with a Loaded/Referenced toggle (default referenced), shared by the canvas modals
- `src/components/top-nav.tsx` — top bar: Workflows/Rules nav, workflow selector
- `src/components/rule-tree.tsx` / `src/components/chip-multi-select.tsx` — `/rules` directory tree (per-path rule chips + add picker) and the left-pane rule selector
- `src/utils/maestro.ts` — `MaestroConfigV3` types, `getMaestroConfig` loader, `submitMaestroConfig` (slice merge into `.claude/maestro.json`)
- `src/utils/maestro-fs.ts` — shared `readCwd` + `parseFrontmatter` used by the Maestro server fns
- `src/utils/maestro-tree.ts` / `src/utils/maestro-rules.ts` / `src/utils/maestro-vibe.ts` — `/rules` loaders: `getProjectTree` (directory walk), `getProjectRules` (scans every `<cwd>/**/.claude/rules/*.md`, returns each rule's current `dir`), and `getVibeRules` (`vibe-rules list`; reads the pre-computed list under Docker)
- `plugins/ai-tools-manager/skills/maestro-install/SKILL.md` — `/maestro-install`: analyzes the repo for impl agent(s), runs the (scaffold-only) orchestrator installer, then invokes the `/maestro-app` skill to author the config
- `plugins/ai-tools-manager/skills/maestro-app/SKILL.md` — `/maestro-app`: the visual-editor entry point (guards on the orchestrator being installed). Opens the form, writes `maestro.json`, re-renders the orchestrator (`maestro-render-orchestrator.cjs`), then runs `maestro-apply-rules.js`
- `plugins/ai-tools-manager/scripts/maestro-apply-rules.js` — host-side rule placement from the `maestro.json` rules slice: **moves** `source: "project"` rule files into their assigned `.claude/rules/`, and installs `source: "vibe-rules"` rules with `vibe-rules load <id> claude-code -t …` (idempotent; never deletes files)
- `plugins/ai-tools-manager/scripts/maestro-install.js` — **scaffold-only**: copies the `maestro` skill, copies the runtime scripts, merges the `bash-validation.sh` PreToolUse Bash hook into `.claude/settings.json`, copies `bash-validation.sh` into the project, and gitignores the ephemeral session files at the repo root via an `# Maestro` section with `**/.claude/maestro_session*.{json,jsonl}` globs (the `**/` prefix covers root-level `.claude/` too, so no per-package `.claude/.gitignore` is needed). Does **not** render — that needs `maestro.json` and is done afterward by `maestro-render-orchestrator.cjs`
- `plugins/ai-tools-manager/scripts/maestro-render-orchestrator.cjs` — renders the orchestrator's `Maestro:HANDOFFS` table from `maestro.json`. Run by `/maestro-app` (after the form) and by `/maestro-update` (standalone, after a hand-edit)
- `plugins/ai-tools-manager/scripts/bash-validation.sh` — PreToolUse Bash guard installed into `<cwd>/.claude/scripts/`: denies any Bash command that reads a `.env` secret file (only `.env.example` is allowed). Wired into the project's `.claude/settings.json` as a `PreToolUse` hook with matcher `Bash` by the install orchestrator; removed by `maestro-uninstall.js`
- `plugins/ai-tools-manager/scripts/{maestro-inject-agent-context.js,maestro-session-log.js,maestro-subagent-log.js,maestro-set-session-workflow.cjs,lib/maestro-session.cjs}` — SubagentStart skill injection, PreToolUse session logging (tool calls), SubagentStart/Stop inter-agent communication logging (dispatch + handoff entries with full input/output messages), active-workflow setter, shared helpers. `maestro-session-log.js` appends one line per tool call; `maestro-subagent-log.js` appends `kind:"dispatch"` on SubagentStart and `kind:"handoff"` on SubagentStop (with the HANDOFF outcome and full messages for `/session-log` debugging). All append to the same `maestro_session.log.jsonl`; `maestro_session.json` holds only `{workflow, generated_instances}`; `maestro_session_tasks.json` (written by `maestro-validate-tasks.js`) holds the success-path steps already covered by a `TaskCreate`. All three ephemeral files are deleted at `SessionEnd`.
- `plugins/ai-tools-manager/scripts/maestro-uninstall.js` + `plugins/ai-tools-manager/skills/maestro-uninstall/SKILL.md` — `/maestro-uninstall`: remove the `bash-validation.sh` PreToolUse hook from `settings.json` and clear session files; keeps `maestro.json`. `--purge` also removes the installed orchestrator skill + copied scripts (including `bash-validation.sh`) **and** the `maestro.json` config — everything the install pipeline produced.
- `plugins/ai-tools-manager/skills/maestro-update/SKILL.md` — `/maestro-update`: refresh the project-copied runtime scripts from the plugin (picks up plugin updates), then re-render the orchestrator from `maestro.json`
- `plugins/ai-tools-manager/skills/to-maestro-tasks/SKILL.md` — `/to-maestro-tasks`: turn a plan into a queue of ready-to-run prompt files under `<cwd>/.claude/maestro-tasks/`. Composes a `/grilling` session (skippable) with the tracer-bullet vertical-slice decomposition of `to-issues`, then writes one numbered, **workflow-agnostic** prompt per slice (`NNN-kebab-slug.md`, append-only, topologically sorted). No agent, no GitHub publish — each file is a self-contained request the Maestro orchestrator (`maestro.md` Step 1) classifies and executes; `Blocked by` references sibling files as human-facing sequencing metadata.
- `plugins/ai-tools-manager/scripts/maestro-post-mortem.js` + `plugins/ai-tools-manager/skills/maestro-post-mortem/SKILL.md` — `/maestro-post-mortem`: read-only retrospective. The script condenses `maestro_session.log.jsonl` into a digest (per-origin counts, dispatch↔handoff correlation by `agent_id`, heuristic flags for repeated reads / edit churn / typecheck-test-lint runs / `no-return` handoffs; `--json` for structured output). The skill couples that digest with the main session's own context to flag avoidable work, false checks, bad assumptions, and handoff issues, then proposes + applies fixes on confirmation. Read-side consumer of the same log `/session-log` displays; must run mid-session before `SessionEnd` wipes the log.
- `.claude/skills/workflow-view/SKILL.md` — architecture doc for the `/workflows` view, i.e. the authoring/UI side (this app's developer reference)
- `.claude/skills/rule-view/SKILL.md` — architecture doc for the `/rules` view: the two rule selectors (project + vibe-rules), the directory tree, how assignments map to the `rules` slice of `maestro.json`, and how `maestro-apply-rules.js` moves/installs rule files on save (the rules counterpart to `workflow-view`)
- `.claude/skills/maestro-architecture/SKILL.md` — architecture doc for the Maestro **runtime**: install pipeline, orchestrator + hook lifecycle, the four config/state files, and the HANDOFF routing contract (the runtime counterpart to `workflow-view`)
- `.claude/skills/log-view/SKILL.md` — architecture doc for the `/session-log` view: the instance card diagram, humanized log pane, hover input/output debugging popup, and how `maestro-session-log.js` / `maestro-subagent-log.js` write the log it reads (the read-side counterpart to `maestro-architecture`)

### Session Log (`/session-log`)

- `src/routes/session-log.tsx` — route: consumes `useSessionLog()`, 3-pane grid (180px / 1fr / 320px), state for activeId + sectionRefs, empty state with live indicator
- `src/components/session-log-cards.tsx` — thin left step list: status icons (CircleCheck/CircleX/AlertTriangle) + step names, selected step underlined with status color
- `src/components/session-log-view.tsx` — center framed log pane: rounded bordered sections per instance, click-to-select with colored border, `● live` indicator
- `src/components/session-log-detail.tsx` — right detail panel: Input/Process/Output sections for the selected step
- `src/routes/api/session-log-stream.ts` — SSE server route (`server.handlers.GET`): tails `maestro_session.log.jsonl` every 1 s and emits `init`/`entry`/`reset` events to connected browsers
- `src/utils/session-log-context.tsx` — `SessionLogProvider` (mounted in `__root.tsx`): one app-wide `EventSource`, exposes `{ entries, connected }` via `useSessionLog()`
- `src/utils/maestro-session-log.ts` — `getMaestroSessionLog` server fn + `resolveLogFile` + `parseLogLines` helpers (shared by server fn and SSE route)
- `src/utils/session-log.ts` — pure client-safe helpers: `buildInstances` (segments entries by origin change, correlates input/output via agent_id), `humanizeLog` (tool name → readable verb)

### Maestro Tasks (`/maestro-tasks`)

- `src/routes/maestro-tasks.tsx` — route: loader calls `getMaestroTasks`, two-pane list/reader layout, renders the selected task with `react-markdown`, copy-prompt button via `@repo/ui/copyable-text`
- `src/utils/maestro-tasks.ts` — `getMaestroTasks` server fn: lists/sorts `<cwd>/.claude/maestro-tasks/*.md`, parses each file's title (first `# ` heading) and `Blocked by` sibling references, returns `{ filename, relativePath, title, blockedBy, content }[]`
