---
name: create-marketplace
description: "Scaffolds a new Claude Code plugin marketplace: creates the directory structure, marketplace.json manifest, README, and CLAUDE.md context file. Guides the user through local testing, private repository setup, and auto-update configuration. Use when the user asks to create a marketplace, scaffold a marketplace, or set up a plugin marketplace."
---

# Create Marketplace

Scaffold a new plugin marketplace with valid manifest, then guide the user through local testing and (optionally) private-repo + auto-update setup before publishing.

## Workflow

1. **Gather info via script**
   Run: `node <skill-dir>/scripts/gather-marketplace-info.cjs`
   Returns one JSON line: `{ name, description, owner, homepage, targetDir, privateRepo }`.

   The script enforces unique kebab-case names and rejects names reserved by Anthropic (`anthropic-marketplace`, `claude-code-plugins`, `agent-skills`).

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
       "name": "<owner.name>",
       "email": "<owner.email>"
     },
     "metadata": {
       "description": "<description>",
       "version": "0.1.0",
       "homepage": "<homepage>"
     },
     "plugins": []
   }
   ```
   Required fields: `name` (kebab-case), `owner.name`, `plugins[]`. Omit `homepage` if user left it blank.

4. **Write `README.md`**
   Minimal: title, one-line description, install instructions:
   ```markdown
   # <name>

   <description>

   ## Install

   ```bash
   claude plugin marketplace add <repo-or-path>
   claude plugin install <plugin-name>@<name>
   ```
   ```

5. **Write `CLAUDE.md`**
   Short context file for Claude Code sessions opened inside this marketplace repo. Explain that this is a marketplace catalog, point at `.claude-plugin/marketplace.json`, and describe the convention used for plugin source layout.

6. **Validate locally**
   Run: `claude plugin validate <targetDir>`
   The validator checks `marketplace.json`, every plugin's `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json` for syntax and schema errors.

7. **Test locally before sharing**
   Tell the user to add at least one plugin (use `create-plugin` skill) then run:
   ```bash
   claude plugin marketplace add <targetDir>
   claude plugin install <plugin-name>@<name>
   ```
   Inside Claude Code: `/plugin marketplace add <targetDir>` then `/plugin install <plugin-name>@<name>`.

   This proves the marketplace resolves, the plugin manifest is valid, and the catalog can be navigated before anyone else sees it.

8. **Configure auto-updates (optional)**
   By default, third-party and local marketplaces have auto-update **disabled**. To enable for this marketplace once it is registered on the user's machine:
   - Run `/plugin` → **Marketplaces** tab → select marketplace → **Enable auto-update**.

   Global env-var overrides (mention only if relevant to user's setup):
   ```bash
   export DISABLE_AUTOUPDATER=1          # disable everything
   export FORCE_AUTOUPDATE_PLUGINS=1     # keep plugin auto-update only
   ```
   See `docs/marketplace.md#auto-updates` for the full table.

9. **Configure private repository access (only if `privateRepo` is true)**
   For manual install/update, Claude Code uses existing git credentials (`gh auth login`, SSH key in `ssh-agent`, etc.). For background auto-update at startup, credential helpers are skipped — set the matching env var:

   | Provider  | Env vars                     |
   | --------- | ---------------------------- |
   | GitHub    | `GITHUB_TOKEN` or `GH_TOKEN` |
   | GitLab    | `GITLAB_TOKEN` or `GL_TOKEN` |
   | Bitbucket | `BITBUCKET_TOKEN`            |

   Example:
   ```bash
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```
   Add to `.bashrc` / `.zshrc` so it persists. For CI, set as a secret. See `docs/marketplace.md#private-repositories`.

10. **Report to user**
    - `<targetDir>/.claude-plugin/marketplace.json` created
    - `<targetDir>/README.md`, `CLAUDE.md`, and `plugins/` created
    - Validation passed
    - Next steps:
      - Add plugins with `create-plugin` skill
      - Test locally with `claude plugin marketplace add <targetDir>`
      - When ready: push to a Git host, then share `claude plugin marketplace add owner/repo`
      - Auto-update + private repo setup as above (if applicable)
