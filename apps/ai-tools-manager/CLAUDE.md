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

## Adding a new route / form

1. Create `src/routes/<name>.tsx` with a loader server function and a submit server function that writes to `process.env.RESULT_FILE ?? "/tmp/result.json"`. Import shared UI from `src/components/form-ui.tsx`.
2. Add a corresponding entry in `plugins/ai-tools-manager/hooks/hooks.json` with matcher `<name>` and args `["${CLAUDE_PLUGIN_ROOT}/scripts/gather-info.sh", "<name>"]`.
3. The unified `plugins/ai-tools-manager/scripts/gather-info.sh` handles everything — no new shell script needed.

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

- `src/routes/create-skill.tsx` — skill creation form
- `src/routes/create-subagent.tsx` — subagent creation form
- `src/routes/create-plugin.tsx` — plugin creation form
- `src/routes/create-marketplace.tsx` — marketplace creation form
- `src/components/form-ui.tsx` — shared UI primitives (Page, Field, Input, Select, ModeCard, …)
- `plugins/ai-tools-manager/scripts/gather-info.sh` — unified hook orchestration script (takes form name as argument)
- `plugins/ai-tools-manager/hooks/hooks.json` — hook registration for all four skills
- `packages/claude-fs/src/index.ts` — shared `~/.claude/` reading utilities used by server functions
