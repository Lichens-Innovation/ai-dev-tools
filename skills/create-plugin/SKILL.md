---
name: create-plugin
description: "Scaffolds a new plugin in a local marketplace repository: creates the plugin directory, plugin.json manifest, skills/ folder, and registers it in marketplace.json. Use when the user asks to add a new plugin, create a plugin, or register a plugin in the marketplace."
---

# Create Plugin

Scaffold a new plugin in a local marketplace and register it.

## User's intention

$ARGUMENTS

## References

Consult the relevant doc(s) before making structural decisions:

- [`docs/plugins.md`](${CLAUDE_SKILL_DIR}/../../../../docs/plugins.md) — plugin structure, manifest, hooks and relative paths
- [`docs/marketplace.md`](${CLAUDE_SKILL_DIR}/../../../../docs/marketplace.md) — marketplace structure, registration, publishing, versioning, auto-updates
- [`docs/skills.md`](${CLAUDE_SKILL_DIR}/../../../../docs/skills.md) — skill format, popular repositories, skills CLI
- [`docs/subagents.md`](${CLAUDE_SKILL_DIR}/../../../../docs/subagents.md) — subagent usage, AGENTS.md format, coordination tips
- [`docs/hooks.md`](${CLAUDE_SKILL_DIR}/../../../../docs/hooks.md) — hook lifecycle, PreToolUse / PostToolUse, hook scripts
- [`docs/rules.md`](${CLAUDE_SKILL_DIR}/../../../../docs/rules.md) — rules format and scope
- [`docs/mcp.md`](${CLAUDE_SKILL_DIR}/../../../../docs/mcp.md) — MCP server configuration
- [`docs/memory.md`](${CLAUDE_SKILL_DIR}/../../../../docs/memory.md) — memory system, persistent memory for subagents
- [`docs/skills-cli.md`](${CLAUDE_SKILL_DIR}/../../../../docs/skills-cli.md) — skills CLI commands
- [`docs/claude-code.md`](${CLAUDE_SKILL_DIR}/../../../../docs/claude-code.md) — Claude Code settings, commands, IDE integrations

## Workflow

The form data submitted by the user was injected into your context as `additionalContext` by the `UserPromptExpansion` hook. Parse the JSON object `{ name, description, keywords, marketplacePath }` and proceed:

1. **Create plugin directory structure**
   ```
   <marketplacePath>/plugins/<name>/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── skills/
   └── README.md
   ```

2. **Write plugin.json**
   Read `<marketplacePath>/.claude-plugin/marketplace.json` to get the owner name and email, then write `<marketplacePath>/plugins/<name>/.claude-plugin/plugin.json`:
   ```json
   {
     "name": "<name>",
     "version": "0.1.0",
     "description": "<description>",
     "author": {
       "name": "<owner.name from marketplace.json>",
       "email": "<owner.email from marketplace.json>"
     },
     "homepage": "<metadata.homepage from marketplace.json>",
     "keywords": ["<keyword1>", "<keyword2>"]
   }
   ```

3. **Write README.md**
   Create `<marketplacePath>/plugins/<name>/README.md` with a minimal header and the plugin description.

4. **Register in marketplace**
   Edit `<marketplacePath>/.claude-plugin/marketplace.json` and append to the `plugins` array:
   ```json
   {
     "name": "<name>",
     "source": "./plugins/<name>",
     "description": "<description>"
   }
   ```

5. **Hooks**
   If the plugin needs event hooks, add them to `hooks/hooks.json` in the plugin root (or inline in `plugin.json`) rather than user settings. See [Hooks and Relative Paths](${CLAUDE_SKILL_DIR}/../../../../docs/plugins.md#hooks-and-relative-paths).

6. **Report to user**
   - `<marketplacePath>/plugins/<name>/.claude-plugin/plugin.json` created
   - `<marketplacePath>/plugins/<name>/skills/` created
   - `<marketplacePath>/plugins/<name>/README.md` created
   - Entry added to `<marketplacePath>/.claude-plugin/marketplace.json`
   - Next steps:
     - Use `/create-skill` or `/create-subagent` to populate the plugin with tools
     - Test locally: `claude --plugin-dir <marketplacePath>/plugins/<name>`
     - Once satisfied with the result, update the marketplace so the plugin becomes visible: `claude plugin marketplace update`
