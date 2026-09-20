---
name: create-marketplace
description: "Scaffolds a new Claude Code plugin marketplace: creates the directory structure, marketplace.json manifest, README, and CLAUDE.md context file. Guides the user through local testing, private repository setup, and auto-update configuration. Use when the user asks to create a marketplace, scaffold a marketplace, or set up a plugin marketplace."
---

# Create Marketplace

Scaffold a new plugin marketplace with a valid manifest, then guide the user through local testing and (optionally) private-repo + auto-update setup before publishing.

## User's intention

$ARGUMENTS

## References & shared contract

See [`docs/ai-tools-create-shared.md`](${CLAUDE_SKILL_DIR}/../../../../docs/ai-tools-create-shared.md) for the reference docs (marketplace, plugins, skills, …), where the form payload comes from, and the **scaffold-finishing contract**.

## Workflow

Parse the form payload — the JSON object `{ name, description, ownerName, ownerEmail, homepage?, targetDir, privateRepo }` (see the shared contract above for its source) — and proceed.

**Applying the scaffold contract here:** when `scaffolded: true`, the `marketplace.json` manifest and a starter `README.md` already exist under `targetDir` — verify them and skip recreating; focus on the remaining work (CLAUDE.md, enriching the README, local test + private-repo/auto-update setup). A brand-new marketplace dir is usually **outside** the mounted repo, so under Docker the scaffold typically reports `scaffolded: false` — in that case do every step below from scratch.

1. **Create marketplace directory structure**
   ```
   <targetDir>/
   ├── .claude-plugin/
   │   └── marketplace.json
   ├── plugins/
   ├── CLAUDE.md
   └── README.md
   ```

2. **Write `.claude-plugin/marketplace.json`**
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

3. **Write `README.md`**
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

4. **Write `CLAUDE.md`**
   Short context file for Claude Code sessions opened inside this marketplace repo. Explain that this is a marketplace catalog, point at `.claude-plugin/marketplace.json`, and describe the plugin source layout convention.

5. **Configure auto-updates**
   Third-party and local marketplaces have auto-update **disabled** by default. To enable once the marketplace is registered:
   - Run `/plugin` → **Marketplaces** tab → select marketplace → **Enable auto-update**.

   Global env-var overrides:
   ```bash
   export DISABLE_AUTOUPDATER=1          # disable everything
   export FORCE_AUTOUPDATE_PLUGINS=1     # keep plugin auto-update, disable Claude Code updates
   ```

6. **Configure private repository access** _(only if `privateRepo` is true)_
   For background auto-update at startup, credential helpers are skipped — set the matching env var:

   | Provider  | Env vars                     |
   | --------- | ---------------------------- |
   | GitHub    | `GITHUB_TOKEN` or `GH_TOKEN` |
   | GitLab    | `GITLAB_TOKEN` or `GL_TOKEN` |
   | Bitbucket | `BITBUCKET_TOKEN`            |

   Add to `.bashrc` / `.zshrc` so it persists. For CI, set as a secret. See `${CLAUDE_SKILL_DIR}/../../../../docs/marketplace.md#private-repositories`.

7. **Report to user**
   - `<targetDir>/.claude-plugin/marketplace.json` created
   - `<targetDir>/plugins/`, `README.md`, and `CLAUDE.md` created
   - Next steps:
     - Use `/create-plugin` to add plugins to the marketplace
     - Then use `/create-skill` or `/create-subagent` to populate each plugin with tools
     - Test locally: `claude plugin marketplace add <targetDir>`
     - When ready to publish: push to a Git host, then share with `claude plugin marketplace add owner/repo`
