---
name: create-plugin
description: "Scaffolds a new plugin in the ai-dev-tools marketplace repository: creates the plugin directory, plugin.json manifest, skills/ folder, and registers it in marketplace.json. Use when the user asks to add a new plugin, create a plugin, or register a plugin in the marketplace."
---

# Create Plugin

Scaffold a new plugin in `plugins/` and register it in the marketplace.

## Workflow

1. **Find repo root**
   Run: `git rev-parse --show-toplevel`
   Store result as `<repo-root>`.

2. **Gather info via script**
   Run: `node <skill-dir>/scripts/gather-plugin-info.cjs`
   The script prompts the user in the terminal and returns one JSON line:
   `{ name, description, keywords }`

3. **Create plugin directory structure**
   ```
   plugins/<name>/
   ├── .claude-plugin/
   │   └── plugin.json
   ├── skills/
   └── README.md
   ```

4. **Write plugin.json**
   Read `<repo-root>/.claude-plugin/marketplace.json` to get the owner name and email, then write `<repo-root>/plugins/<name>/.claude-plugin/plugin.json`:
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

4b. **Write README.md**
   Create `<repo-root>/plugins/<name>/README.md` with a minimal header and the plugin description.

5. **Register in marketplace**
   Edit `<repo-root>/.claude-plugin/marketplace.json` and append to the `plugins` array:
   ```json
   {
     "name": "<name>",
     "source": "./plugins/<name>",
     "description": "<description>"
   }
   ```

6. **Validate**
   Run: `claude plugin validate <repo-root>/plugins/<name>`
   Fix any errors before proceeding.

7. **Report to user**
   - `plugins/<name>/.claude-plugin/plugin.json` created
   - `plugins/<name>/skills/` created
   - `plugins/<name>/README.md` created
   - Entry added to `.claude-plugin/marketplace.json`
   - Next steps:
     - Add skills: use `create-skill` and point to plugin `<name>`
     - Test locally: `claude --plugin-dir ./plugins/<name>`
     - Publish: push to Git and `claude plugin marketplace add owner/repo`
