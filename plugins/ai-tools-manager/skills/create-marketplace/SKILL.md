---
name: create-marketplace
description: "Scaffolds a new Claude Code plugin marketplace: creates the directory structure, marketplace.json manifest, README, and CLAUDE.md context file. Guides the user through local testing, private repository setup, and auto-update configuration. Use when the user asks to create a marketplace, scaffold a marketplace, or set up a plugin marketplace."
---

# Create Marketplace

Scaffold a new plugin marketplace with a valid manifest, then guide the user through local testing and (optionally) private-repo + auto-update setup before publishing.

## User's intention

$ARGUMENTS

## References

Consult the relevant doc(s) before making structural decisions:

- [`docs/marketplace.md`](docs/marketplace.md) — marketplace structure, registration, publishing, versioning, auto-updates
- [`docs/plugins.md`](docs/plugins.md) — plugin structure, manifest, hooks and relative paths
- [`docs/skills.md`](docs/skills.md) — skill format, popular repositories, skills CLI
- [`docs/subagents.md`](docs/subagents.md) — subagent usage, AGENTS.md format, coordination tips
- [`docs/hooks.md`](docs/hooks.md) — hook lifecycle, PreToolUse / PostToolUse, hook scripts
- [`docs/rules.md`](docs/rules.md) — rules format and scope
- [`docs/mcp.md`](docs/mcp.md) — MCP server configuration
- [`docs/memory.md`](docs/memory.md) — memory system, persistent memory for subagents
- [`docs/skills-cli.md`](docs/skills-cli.md) — skills CLI commands
- [`docs/claude-code.md`](docs/claude-code.md) — Claude Code settings, commands, IDE integrations

## Workflow

1. **Gather info**
   Run the gather script — it opens a browser form for the user to fill in:
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/gather-marketplace-info.cjs" "$PWD"
   ```
   The command blocks until the user submits the form, then prints one JSON line to stdout:
   `{ name, description, ownerName, ownerEmail, homepage, targetDir, privateRepo }`
   Parse and use these values, then immediately clean up:
   ```bash
   rm -f marketplace-gather-info.json
   ```

2. **Create marketplace directory structure**
   ```
   <targetDir>/
   ├── .claude-plugin/
   │   └── marketplace.json
   ├── plugins/
   ├── CLAUDE.md
   └── README.md
   ```

3. **Write `.claude-plugin/marketplace.json`**
   ```json
   {
     "name": "<name>",
     "owner": {
       "name": "<ownerName>",
       "email": "<ownerEmail>"
     },
     "metadata": {
       "description": "<description>",
       "version": "0.1.0",
       "homepage": "<homepage>"
     },
     "plugins": []
   }
   ```
   Omit `homepage` if the user left it blank.

4. **Write `README.md`**
   Minimal: title, one-line description, install instructions:
   ```markdown
   # <name>

   <description>

   ## Install

   \`\`\`bash
   claude plugin marketplace add <repo-or-path>
   claude plugin install <plugin-name>@<name>
   \`\`\`
   ```

5. **Write `CLAUDE.md`**
   Short context file for Claude Code sessions opened inside this marketplace repo. Explain that this is a marketplace catalog, point at `.claude-plugin/marketplace.json`, and describe the plugin source layout convention.

6. **Configure auto-updates**
   Third-party and local marketplaces have auto-update **disabled** by default. To enable once the marketplace is registered:
   - Run `/plugin` → **Marketplaces** tab → select marketplace → **Enable auto-update**.

   Global env-var overrides:
   ```bash
   export DISABLE_AUTOUPDATER=1          # disable everything
   export FORCE_AUTOUPDATE_PLUGINS=1     # keep plugin auto-update, disable Claude Code updates
   ```

7. **Configure private repository access** _(only if `privateRepo` is true)_
   For background auto-update at startup, credential helpers are skipped — set the matching env var:

   | Provider  | Env vars                     |
   | --------- | ---------------------------- |
   | GitHub    | `GITHUB_TOKEN` or `GH_TOKEN` |
   | GitLab    | `GITLAB_TOKEN` or `GL_TOKEN` |
   | Bitbucket | `BITBUCKET_TOKEN`            |

   Add to `.bashrc` / `.zshrc` so it persists. For CI, set as a secret. See `docs/marketplace.md#private-repositories`.

8. **Report to user**
   - `<targetDir>/.claude-plugin/marketplace.json` created
   - `<targetDir>/plugins/`, `README.md`, and `CLAUDE.md` created
   - Next steps:
     - Use `/create-plugin` to add plugins to the marketplace
     - Then use `/create-skill` or `/create-subagent` to populate each plugin with tools
     - Test locally: `claude plugin marketplace add <targetDir>`
     - When ready to publish: push to a Git host, then share with `claude plugin marketplace add owner/repo`
