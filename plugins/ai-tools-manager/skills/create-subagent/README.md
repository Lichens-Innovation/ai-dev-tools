# create-subagent

Scaffolds a new Claude Code subagent (AGENTS.md format) — either inside a marketplace plugin or directly in the user's current project. Mirrors `create-skill` with two extra fields: `triggers` (when to hand off) and `tools` (allowed tools).

## How it works

1. User invokes `/create-subagent`.
2. `hooks.json` matches and runs `scripts/launch-ai-tools-manager-app.sh create-subagent`, which opens the web form at `http://localhost:3009/create-subagent`.
3. User fills the form (auto/manual mode, marketplace/project target, name, idea/description, triggers, tools, etc.) and submits.
4. The form writes a JSON payload to `/tmp/result.json`.
5. The hook unblocks and returns the payload to Claude as `additionalContext`. This file (`SKILL.md`) reads it and writes the new subagent file.

See the project-local skill `apps/ai-tools-manager/.claude/skills/create-skills-architecture/` for the full architecture.

## Payload contract

| target | mode | Payload shape |
|---|---|---|
| `marketplace` | `auto` | `{ mode, target, name?, idea, triggers, tools, marketplacePath, plugin }` |
| `marketplace` | `manual` | `{ mode, target, name, description, triggers, tools, marketplacePath, plugin }` |
| `project` | `auto` | `{ mode, target, name?, idea, triggers, tools, projectPath }` |
| `project` | `manual` | `{ mode, target, name, description, triggers, tools, projectPath }` |

`triggers` and `tools` are `string[]`. The frontmatter `description` is built the same way as `create-skill`; `tools` becomes a comma-joined `tools:` line in YAML frontmatter.

## Output locations

- **Marketplace target:** `<marketplacePath>/plugins/<plugin>/agents/<name>/AGENTS.md` (file inside a per-agent directory)
- **Project target:** `<projectPath>/.claude/agents/<name>.md` (single file, no enclosing directory — Claude Code project convention)

## Related

- `create-skill` — same pattern for skills
- `create-plugin` — scaffolds the plugin a subagent is filed under
