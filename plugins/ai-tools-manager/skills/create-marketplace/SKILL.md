---
name: create-marketplace
description: "Scaffolds a new Claude Code plugin marketplace: creates the directory structure, marketplace.json manifest, README, and CLAUDE.md context file. Guides the user through local testing, remote/private repository setup, and auto-update configuration. Use when the user asks to create a marketplace, scaffold a marketplace, or set up a plugin marketplace."
---

# Create Marketplace

Scaffold a new plugin marketplace with a valid manifest, then guide the user through local testing and (optionally) remote + private-repo + auto-update setup before publishing.

## Do not run git

Initialising the repository and committing the scaffold is the app's job, not yours — it is a step in the deterministic scaffold (`scaffoldCreate` in `apps/maestro/src/core/scaffold.ts`), so it happens whether or not a run like this one ever starts, and it is undone with the rest of the scaffold if anything fails. Running `git init` or `git commit` here either nests a second repository or re-commits the scaffold under a different author.

Three states are possible and the scaffold reports which one it left, so **read the payload rather than probing**: a repository was created here, the directory was already inside one, or the machine has no `git` (in which case the user runs `git init` themselves — you do not).

What is still conversational, and is genuinely yours to guide: the **remote**, **private-repo credentials** and **auto-update** (steps 5–7 below). Those need a host, an account and secrets the app does not have.

## User's intention

$ARGUMENTS

## References & shared contract

See [`docs/ai-tools-create-shared.md`](${CLAUDE_SKILL_DIR}/../../../../docs/ai-tools-create-shared.md) for the reference docs (marketplace, plugins, skills, …), where the payload comes from, and the **scaffold-finishing contract**.

## Workflow

Parse the payload — the JSON object `{ name, description, ownerName, ownerEmail, homepage?, targetDir, privateRepo }` (see the shared contract above for its source) — and proceed.

**Applying the scaffold contract here:** when `scaffolded: true`, the `marketplace.json` manifest and a starter `README.md` already exist under `targetDir`, and the directory is already a git repository with both committed (see "Do not run git" above) — verify them and skip recreating; focus on the remaining work (CLAUDE.md, enriching the README, local test + remote/private-repo/auto-update setup). When `scaffolded: false` (or there is no scaffold object at all, i.e. you were invoked conversationally), do every step below from scratch — **except the repository**, which stays the user's to create in that case. Note that a new marketplace commonly lives **outside** the open project — the run's working directory is `targetDir`, not the project root, so write with absolute paths and don't assume relative ones resolve where you expect.

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

5. **Offer the remote** _(never do it silently)_
   The repository exists locally; publishing it does not. Ask which host, then give the user the exact commands to run — the URL, the account and any credentials are theirs, not the app's:

   ```bash
   git remote add origin <url>
   git push -u origin main
   ```

   If the scaffold reported that no repository was created, `git init` comes first and the user runs that too.

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

   Add to `.bashrc` / `.zshrc` so it persists. For CI, set as a secret. See `${CLAUDE_SKILL_DIR}/../../../../docs/marketplace.md#private-repositories`.

8. **Report to user**
   - `<targetDir>/.claude-plugin/marketplace.json` created
   - `<targetDir>/plugins/`, `README.md`, and `CLAUDE.md` created
   - The repository: created here, already inside one, or none — say which, from what the scaffold reported
   - Next steps:
     - Use `/create-plugin` to add plugins to the marketplace
     - Then use `/create-skill` or `/create-subagent` to populate each plugin with tools
     - Test locally: `claude plugin marketplace add <targetDir>`
     - When ready to publish: add a remote and push (step 5), then share with `claude plugin marketplace add owner/repo`
