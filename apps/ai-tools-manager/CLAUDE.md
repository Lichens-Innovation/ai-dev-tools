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
