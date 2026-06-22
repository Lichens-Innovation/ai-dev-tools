---
name: create-plugin
description: "Scaffolds a new plugin in a local marketplace repository: creates the plugin directory, plugin.json manifest, skills/ folder, and registers it in marketplace.json. Use when the user asks to add a new plugin, create a plugin, or register a plugin in the marketplace."
---

# Create Plugin

Scaffold a new plugin in a local marketplace and register it.

## User's intention

$ARGUMENTS

## References & shared contract

See [`docs/ai-tools-create-shared.md`](${CLAUDE_SKILL_DIR}/../../../../docs/ai-tools-create-shared.md) for the reference docs (plugins, marketplace, skills, …), where the form payload comes from, and the **scaffold-finishing contract**.

## Workflow

Parse the form payload — the JSON object `{ name, description, keywords, marketplacePath }` (see the shared contract above for its source) — and proceed.

**Applying the scaffold contract here:** when `scaffolded: true`, the app has **already** written `plugin.json` (author inherited from the marketplace owner), created `skills/`, and registered the plugin in `marketplace.json` — verify those (steps 1–2, 4) and skip recreating them; you may still add the README (step 3) and any hooks. When `scaffolded: false` (`reason` says why), perform all steps below from scratch.

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
