# ai-tools-manager

A containerized web form app that provides a UI layer for Claude Code skills. When a hook triggers (e.g. `/create-skill`), the hook script opens this app in the browser, the user fills the form, and the app writes a result file that unblocks the hook and returns data to Claude.

## Architecture

The app communicates with the host via two `/tmp/` files mounted as Docker volumes:

| File (host) | Mounted as (container) | Direction | Purpose |
|---|---|---|---|
| `/tmp/ai-tools-result.json` | `/tmp/result.json` | app → hook | Form submission payload, read by hook after user submits |
| `/tmp/ai-tools-marketplace.json` | `/tmp/marketplace-data.json` | hook → app | Pre-computed marketplace/plugin list for dropdowns |

The hook script (`plugins/ai-tools-manager/scripts/gather-info.sh`) is responsible for:
1. Pre-generating `/tmp/ai-tools-marketplace.json` by reading `~/.claude/plugins/known_marketplaces.json` on the host (where all filesystem paths are accessible)
2. Starting the container via `docker compose up -d --build`
3. Blocking until `/tmp/ai-tools-result.json` is non-empty, then returning its contents to Claude

The reason marketplace data is pre-computed on the host: local marketplace `installLocation` paths in `known_marketplaces.json` are host paths — they don't exist inside the container. The file also includes `cwd` (the Claude working directory at hook time) so forms can use it as a default (e.g. `targetDir` in `create-marketplace`).

## Routes

- `/` — Splash page; shown if user opens the app directly (not via a skill)
- `/create-skill` — Skill creation form
- `/create-subagent` — Subagent creation form
- `/create-plugin` — Plugin creation form
- `/create-marketplace` — Marketplace creation form
- `/workflows` — Visual agent-workflow editor (React Flow canvas). Writes the workflow slice of `.claude/afk.json` (v3). See the `workflow-view` skill in `.claude/skills/`.
- `/rules` — Assign rules (on-disk project rules + installable vibe-rules) to the project root and/or directory paths. Writes the `rules` slice of the same `afk.json`; on save the skill runs `afk-apply-rules.js` to move project rule files / `vibe-rules load` installable ones into their assigned `.claude/rules/`. See the `rule-view` skill.
- `/session-log` — Read-only view of `<cwd>/.claude/afk_session.log.jsonl`. Left pane: vertical card diagram (one card per instance occurrence, with SUCCESS/FAILURE badge). Right pane: humanized log text. Clicking a card scrolls the log to that instance's section. Hover a subagent card to see the full input/output messages for debugging. Refreshes on demand (the file is ephemeral — cleared at SessionEnd).

## Form architecture

All four create routes follow the same pattern:

- **State**: `react-hook-form` + `zod` (via `@hookform/resolvers/zod`). Zod schema lives at the top of the route file; the inferred type drives `useForm<T>`.
- **UI primitives**: `@repo/ui` — `Button`, `Field`, `Input`, `Textarea`, `ChipInput`, `Select`, `ModePill`, `ThemeToggle`, `SuccessState`, `ShortcutsDialog`, `FilePreview`, `SyntaxLine`. Icons come from `lucide-react`.
- **Layout**: split-pane — form on the left, live `FilePreview` on the right showing the file that will be generated.
- **Keyboard shortcuts**: ⌘N (jump to field), ⌘↵ (submit), `?` (help), Esc (close).
- **`target` toggle (skill & subagent only)**: a second `ModePill` lets the user pick `marketplace` or `project`. In project mode the marketplace/plugin selectors are hidden and the file is written under `<cwd>/.claude/`.

Per-route preview components live in `src/components/` and compose `FilePreview` with their own `lines: string[]`. Shared text helpers (`buildDesc`, `firstSentence`, `joinOxford`, `clip`, `titleFromName`) live in `src/utils/text.ts`.

## Adding a new route / form

1. Create `src/routes/<name>.tsx` mirroring the structure of `create-plugin.tsx` (no mode) or `create-skill.tsx` (auto/manual + target). Define the zod schema, wire `useForm` + `Controller`, render with `Field`/`Input`/`Select`/`ChipInput` from `@repo/ui`.
2. Create `src/utils/<name>.ts` with two server fns: a `submit<X>Form` that writes a `UserPromptExpansion` result, and a `cancel<X>Form` that writes a `decision: "block"` result. Target dispatch (marketplace vs project) lives here.
3. Create `src/components/<name>-preview.tsx` — render `FilePreview` with `lines={...}` describing the file the skill will generate.
4. Register the hook in `plugins/ai-tools-manager/hooks/hooks.json` with matcher `<name>` and args `["${CLAUDE_PLUGIN_ROOT}/scripts/gather-info.sh", "<name>"]`.
5. Write the consuming skill at `plugins/ai-tools-manager/skills/<name>/SKILL.md` documenting the JSON payload contract (mode, target, fields) and the file(s) Claude should write.

The unified `plugins/ai-tools-manager/scripts/gather-info.sh` handles container orchestration — no new shell script needed.

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
- `src/utils/create-{skill,subagent,plugin,marketplace}.ts` — submit/cancel server fns and the form→hook payload shape
- `src/utils/marketplace.ts` — loader server fns (`getMarketplaceData`, `getMarketplaceList`, `getMarketplaceDefaults`). Returns `cwd` so target=project can write under the user's working directory.
- `src/utils/text.ts` — shared text helpers (`buildDesc`, `firstSentence`, `joinOxford`, `clip`, `titleFromName`)
- `src/components/{skill,subagent}-template-preview.tsx` and `{plugin,marketplace}-manifest-preview.tsx` — per-route `FilePreview` renderers
- `packages/ui/src/` — shared primitives consumed by every form
- `plugins/ai-tools-manager/scripts/gather-info.sh` — unified hook orchestration script (takes form name as argument)
- `plugins/ai-tools-manager/hooks/hooks.json` — hook registration for all four skills
- `plugins/ai-tools-manager/skills/{create-skill,create-subagent,create-plugin,create-marketplace}/SKILL.md` — the prompts that consume the form result
- `packages/claude-fs/src/index.ts` — shared `~/.claude/` reading utilities used by server functions

### Agents-framework-kickstarter (workflows & rules)

- `src/routes/workflows.tsx` — `/workflows` route: left agents/skills pane, save, workflow CRUD
- `src/routes/rules.tsx` — `/rules` route: assign rules to project root / directory paths
- `src/components/workflow-canvas.tsx` — the React Flow (`@xyflow/react`) canvas: nodes, edges, all graph interactions
- `src/components/instance-picker.tsx` / `src/components/skill-checklist.tsx` — reuse/create instance picker and skill checkbox list shared by the canvas modals
- `src/components/top-nav.tsx` — top bar: Workflows/Rules nav, workflow selector, YAML preview toggle
- `src/components/afk-yaml-preview.tsx` — read-only `afk.yaml`, rendered via `afkConfigToYaml` from `AfkConfigV3`
- `src/components/rule-tree.tsx` / `src/components/chip-multi-select.tsx` — `/rules` directory tree (per-path rule chips + add picker) and the left-pane rule selector
- `src/utils/agents-framework-kickstarter.ts` — `AfkConfigV3` types, `getAfkConfig` loader, `submitAfkConfig` (slice merge into `.claude/afk.json`, also writes `afk.yaml`)
- `src/utils/afk-yaml.ts` — `afkConfigToYaml` (the single afk.yaml serializer, using the `yaml` package; shared by preview + server)
- `src/utils/afk-fs.ts` — shared `readCwd` + `parseFrontmatter` used by the AFK server fns
- `src/utils/afk-tree.ts` / `src/utils/afk-rules.ts` / `src/utils/afk-vibe.ts` — `/rules` loaders: `getProjectTree` (directory walk), `getProjectRules` (scans every `<cwd>/**/.claude/rules/*.md`, returns each rule's current `dir`), and `getVibeRules` (`vibe-rules list`; reads the pre-computed list under Docker)
- `plugins/ai-tools-manager/skills/agents-framework-kickstarter/SKILL.md` — consuming prompt: writes `afk.json` + `afk.yaml`, runs the orchestrator installer, then runs `afk-apply-rules.js`
- `plugins/ai-tools-manager/scripts/afk-apply-rules.js` — host-side rule placement from the `afk.json` rules slice: **moves** `source: "project"` rule files into their assigned `.claude/rules/`, and installs `source: "vibe-rules"` rules with `vibe-rules load <id> claude-code -t …` (idempotent; never deletes files)
- `plugins/ai-tools-manager/scripts/afk-install-orchestrator.js` / `afk-render-orchestrator.js` — install the `afk` agent + `agent: afk` setting, gitignore the ephemeral session files (`.claude/.gitignore`), and render its frontmatter skills + `AFK:HANDOFFS` table from `afk.json`
- `plugins/ai-tools-manager/scripts/{inject-agent-skills.js,afk-session-log.js,afk-subagent-log.js,afk-set-workflow.js,lib/afk-session.js}` — SubagentStart skill injection, PreToolUse session logging (tool calls), SubagentStart/Stop inter-agent communication logging (dispatch + handoff entries with full input/output messages), active-workflow setter, shared helpers. `afk-session-log.js` appends one line per tool call; `afk-subagent-log.js` appends `kind:"dispatch"` on SubagentStart and `kind:"handoff"` on SubagentStop (with the HANDOFF outcome and full messages for `/session-log` debugging). All append to the same `afk_session.log.jsonl`; `afk_session.json` holds only `{workflow, generated_instances}`. Both files are deleted at `SessionEnd`.
- `plugins/ai-tools-manager/scripts/afk-uninstall.js` + `plugins/ai-tools-manager/skills/afk-uninstall/SKILL.md` — `/afk-uninstall`: remove `agent: afk` from `settings.json` (so new sessions stop adopting the orchestrator) and clear session files; `--purge` also removes the installed agent + copied scripts. Keeps `afk.json`/`afk.yaml`.
- `plugins/ai-tools-manager/skills/afk-sync/SKILL.md` — `/afk-sync`: re-render the orchestrator from `afk.json`
- `plugins/ai-tools-manager/skills/to-afk-tasks/SKILL.md` — `/to-afk-tasks`: turn a plan into a queue of ready-to-run prompt files under `<cwd>/.claude/afk-tasks/`. Composes a `/grilling` session (skippable) with the tracer-bullet vertical-slice decomposition of `to-issues`, then writes one numbered, **workflow-agnostic** prompt per slice (`NNN-kebab-slug.md`, append-only, topologically sorted). No agent, no GitHub publish — each file is a self-contained request the AFK orchestrator (`afk.md` Step 1) classifies and executes; `Blocked by` references sibling files as human-facing sequencing metadata.
- `plugins/ai-tools-manager/scripts/afk-post-mortem.js` + `plugins/ai-tools-manager/skills/afk-post-mortem/SKILL.md` — `/afk-post-mortem`: read-only retrospective. The script condenses `afk_session.log.jsonl` into a digest (per-origin counts, dispatch↔handoff correlation by `agent_id`, heuristic flags for repeated reads / edit churn / typecheck-test-lint runs / `no-return` handoffs; `--json` for structured output). The skill couples that digest with the main session's own context to flag avoidable work, false checks, bad assumptions, and handoff issues, then proposes + applies fixes on confirmation. Read-side consumer of the same log `/session-log` displays; must run mid-session before `SessionEnd` wipes the log.
- `.claude/skills/workflow-view/SKILL.md` — architecture doc for the `/workflows` view, i.e. the authoring/UI side (this app's developer reference)
- `.claude/skills/rule-view/SKILL.md` — architecture doc for the `/rules` view: the two rule selectors (project + vibe-rules), the directory tree, how assignments map to the `rules` slice of `afk.json`, and how `afk-apply-rules.js` moves/installs rule files on save (the rules counterpart to `workflow-view`)
- `.claude/skills/afk-architecture/SKILL.md` — architecture doc for the AFK **runtime**: install pipeline, orchestrator + hook lifecycle, the four config/state files, and the HANDOFF routing contract (the runtime counterpart to `workflow-view`)
- `.claude/skills/log-view/SKILL.md` — architecture doc for the `/session-log` view: the instance card diagram, humanized log pane, hover input/output debugging popup, and how `afk-session-log.js` / `afk-subagent-log.js` write the log it reads (the read-side counterpart to `afk-architecture`)

### Session Log (`/session-log`)

- `src/routes/session-log.tsx` — route: consumes `useSessionLog()`, state for activeId + sectionRefs, empty state with live indicator
- `src/components/session-log-cards.tsx` — left card diagram: one card per instance segment with SUCCESS/FAILURE badge + hover popup showing full input/output
- `src/components/session-log-view.tsx` — right log pane: humanized log lines grouped by instance, scroll anchor per section, `● live` indicator replacing Refresh button
- `src/routes/api/session-log-stream.ts` — SSE server route (`server.handlers.GET`): tails `afk_session.log.jsonl` every 1 s and emits `init`/`entry`/`reset` events to connected browsers
- `src/utils/session-log-context.tsx` — `SessionLogProvider` (mounted in `__root.tsx`): one app-wide `EventSource`, exposes `{ entries, connected }` via `useSessionLog()`
- `src/utils/afk-session-log.ts` — `getAfkSessionLog` server fn + `resolveLogFile` + `parseLogLines` helpers (shared by server fn and SSE route)
- `src/utils/session-log.ts` — pure client-safe helpers: `buildInstances` (segments entries by origin change, correlates input/output via agent_id), `humanizeLog` (tool name → readable verb)
