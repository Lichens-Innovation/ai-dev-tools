---
name: create-plugin
description: "Scaffolds a new plugin in a local marketplace repository: creates the plugin directory, plugin.json manifest, skills/ folder, and registers it in marketplace.json. Use when the user asks to add a new plugin, create a plugin, or register a plugin in the marketplace."
---

# Create Plugin

Scaffold a new plugin in a local marketplace and register it.

## Workflow

1. **Gather info via script**
   Run: `node <skill-dir>/scripts/gather-plugin-info.cjs`
   The script prompts the user in the terminal and returns one JSON line:
   `{ name, description, keywords, marketplacePath }`

2. **Create plugin directory structure**
   ```
   <marketplacePath>/plugins/<name>/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── skills/
   └── README.md
   ```

3. **Write plugin.json**
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

4. **Write README.md**
   Create `<marketplacePath>/plugins/<name>/README.md` with a minimal header and the plugin description.

5. **Register in marketplace**
   Edit `<marketplacePath>/.claude-plugin/marketplace.json` and append to the `plugins` array:
   ```json
   {
     "name": "<name>",
     "source": "./plugins/<name>",
     "description": "<description>"
   }
   ```

6. **Validate**
   Run: `claude plugin validate <marketplacePath>/plugins/<name>`
   Fix any errors before proceeding.

7. **Report to user**
   - `<marketplacePath>/plugins/<name>/.claude-plugin/plugin.json` created
   - `<marketplacePath>/plugins/<name>/skills/` created
   - `<marketplacePath>/plugins/<name>/README.md` created
   - Entry added to `<marketplacePath>/.claude-plugin/marketplace.json`
   - Next steps:
     - Add skills: use `create-skill` and point to plugin `<name>`
     - Test locally: `claude --plugin-dir <marketplacePath>/plugins/<name>`
     - Publish: push to Git and `claude plugin marketplace add owner/repo`
