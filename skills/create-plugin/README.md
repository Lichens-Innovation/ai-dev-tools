# create-plugin

Scaffolds a new plugin inside a local marketplace: creates the directory, writes `plugin.json`, and registers the plugin in `marketplace.json`. No mode toggle (single creation path).

## How it works

1. User invokes `/create-plugin`.
2. `hooks.json` matches and runs `scripts/gather-info.sh create-plugin`, which opens the web form at `http://localhost:3009/create-plugin`.
3. User fills the form (name, description, keywords, marketplace) and submits.
4. The form writes a JSON payload to `/tmp/result.json`.
5. The hook unblocks and returns the payload to Claude as `additionalContext`. This file (`SKILL.md`) reads it and creates the plugin directory + manifest + registry entry.

See the project-local skill `apps/ai-tools-manager/.claude/skills/create-skills-architecture/` for the full architecture.

## Payload contract

```
{ name, description, keywords, marketplacePath }
```

`keywords` is a `string[]` (was a comma string in the old form; now collected via `ChipInput`).

## Output

- `<marketplacePath>/plugins/<name>/.claude-plugin/plugin.json`
- `<marketplacePath>/plugins/<name>/skills/` (empty, populated later by `create-skill` / `create-subagent`)
- `<marketplacePath>/plugins/<name>/README.md`
- New entry appended to `<marketplacePath>/.claude-plugin/marketplace.json` `plugins` array

## Related

- `create-marketplace` — creates the marketplace this plugin gets filed into
- `create-skill` / `create-subagent` — populate the plugin with content
- `manage-marketplace` — publish/update once the plugin is ready
