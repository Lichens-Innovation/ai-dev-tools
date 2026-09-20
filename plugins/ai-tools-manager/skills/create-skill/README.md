# create-skill

Scaffolds a new Claude Code skill — either inside a marketplace plugin or directly in the user's current project.

## How it works

1. User invokes `/create-skill`.
2. `hooks.json` matches and runs `scripts/launch-ai-tools-manager-app.sh create-skill`, which opens the web form at `http://localhost:3009/create-skill`.
3. User fills the form (auto/manual mode, marketplace/project target, name, idea, triggers, etc.) and submits.
4. The form writes a JSON payload to `/tmp/result.json`.
5. The hook unblocks and returns the payload to Claude as `additionalContext`. This file (`SKILL.md`) reads it and writes the new skill file.

See the project-local skill `apps/ai-tools-manager/.claude/skills/create-skills-architecture/` for the full architecture and gotchas.

## Payload contract

The form sends a JSON object with `mode` and `target` fields, dispatched four ways:

| target | mode | Payload shape |
|---|---|---|
| `marketplace` | `auto` | `{ mode, target, name?, idea, useWhen, marketplacePath, plugin }` |
| `marketplace` | `manual` | `{ mode, target, name?, description, triggers, marketplacePath, plugin }` |
| `project` | `auto` | `{ mode, target, name?, idea, useWhen, projectPath }` |
| `project` | `manual` | `{ mode, target, name?, description, triggers, projectPath }` |

`useWhen` and `triggers` are `string[]`. The `description` frontmatter is built from `firstSentence(idea) + " Use when " + joinOxford(chips)`, clipped to 140 chars.

## Output locations

- **Marketplace target:** `<marketplacePath>/plugins/<plugin>/skills/<name>/SKILL.md`
- **Project target:** `<projectPath>/.claude/skills/<name>/SKILL.md`

## Related

- `create-subagent` — same pattern for subagents (`AGENTS.md` / `<name>.md`)
- `create-plugin` — scaffolds the plugin a skill is filed under
- `manage-marketplace` — installs/updates marketplaces once skills land in one
