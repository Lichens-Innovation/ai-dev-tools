# Marketplace

A directory that contains a **catalog** of plugins is called a **marketplace**. By registering a local folder or repository as a Claude Plugin marketplace, Claude Code can list the content of its different plugins and help you to:

1. Interactively select and install the different plugin tools
2. Use version tracking
3. Auto-update
4. Publish your plugins

In short, you can have one marketplace to rule all your plugins ! Similar to a plugin, a marketplace has a `.claude-plugin/marketplace.json` to identify its content:

```
my-claude-marketplace/
├── .claude-plugin/
│   └── marketplace.json    # The main manifest listing all plugins
├── plugins/
│   ├── plugin-a/
│   └── plugin-b/
│   └── ...
├── CLAUDE.md               # Context/instructions for Claude
└── README.md               # Marketplace documentation
```

## Remote Marketplace

A marketplace is just a folder of scripts and markdown files, so it can be stored in a Git repository. You register a remote marketplace with one of these forms:

- GitHub shorthand: `/plugin marketplace add owner/repo`
- Any git URL: `/plugin marketplace add https://gitlab.com/team/plugins.git`
- Direct URL to a `marketplace.json`: `/plugin marketplace add https://example.com/marketplace.json`

For example, the [anthropic skills](https://github.com/anthropics/skills/tree/main) GitHub repository is a marketplace and can be registered with `/plugin marketplace add anthropics/skills`.

## Installing Skills and Other Tools from Marketplaces

Interactively from Claude Code:

1. Register\* to the marketplace with: `/plugin marketplace add owner/repo` (or a git URL, or a local path)
2. Select `Browse and install plugins`
3. Select the plugin to install
4. Select the skill/tool to install
5. Select `Install now`

\* Registering to a marketplace just enables you to go through it, it does not install it on your pc

From the console:

1. `claude plugin marketplace add owner/repo`
2. `claude plugin install my-plugin@my-marketplace`

## Updating Marketplaces and Plugins

You can update all installed marketplaces from the console: `claude plugin marketplace update`.

To update a single plugin, always include the marketplace name — omitting it will fail with "plugin not found": `claude plugin update <plugin>@<marketplace>`

### Auto-updates

Claude Code can automatically refresh marketplaces and update installed plugins at startup. When auto-update runs, the marketplace data is re-pulled and any installed plugin is bumped to its latest version. If anything changed, you are prompted to run `/reload-plugins` to apply the new files in the current session.

**Defaults:**

- Official Anthropic marketplaces: auto-update **enabled** by default.
- Third-party and local development marketplaces: auto-update **disabled** by default.

**Toggle per marketplace (UI):**

1. Run `/plugin` to open the plugin manager.
2. Go to the **Marketplaces** tab.
3. Select the marketplace.
4. Choose **Enable auto-update** or **Disable auto-update**.

**Disable globally via env vars:**

To disable all automatic updates (Claude Code itself + plugins):

```bash
export DISABLE_AUTOUPDATER=1
```

To keep plugin auto-updates while disabling Claude Code auto-updates:

```bash
export DISABLE_AUTOUPDATER=1
export FORCE_AUTOUPDATE_PLUGINS=1
```

This is useful when you want to manage Claude Code updates manually but still receive automatic plugin updates.

## Private Repositories

Claude Code can install marketplaces and plugins from private git repositories.

**Manual install/update** uses your existing git credential helpers:

- HTTPS: works with macOS Keychain, `git-credential-store`, or the `gh` CLI. For `gh`, you must run `gh auth setup-git` to install it as a git credential helper — `gh auth login` on its own authenticates the CLI but does not configure git.
- SSH: works as long as the host is in `known_hosts` and the key is loaded in `ssh-agent`. Claude Code suppresses interactive SSH prompts for the host fingerprint and key passphrase, so unconfigured keys will fail silently.

**Background auto-updates** at startup do **not** use credential helpers (interactive prompts would block startup). To allow auto-update for a private marketplace, set the right token in your environment:

| Provider  | Environment variables        | Notes                                     |
| --------- | ---------------------------- | ----------------------------------------- |
| GitHub    | `GITHUB_TOKEN` or `GH_TOKEN` | Personal access token or GitHub App token |
| GitLab    | `GITLAB_TOKEN` or `GL_TOKEN` | Personal access token or project token    |
| Bitbucket | `BITBUCKET_TOKEN`            | App password or repository access token   |

Set the token in your shell config (`.bashrc`, `.zshrc`) or pass it when running Claude Code:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

The variable names above are fixed — Claude Code looks them up by name, so you cannot point it at a differently-named variable.

> ⚠️ **`GITHUB_TOKEN` is also read by the `gh` CLI**, and an environment variable takes precedence over `gh`'s stored credentials. Exporting it globally in `.zshrc` makes `gh auth status` report the environment token as active and drops your keyring account to `Active account: false` — so a token scoped narrowly for the marketplace will break unrelated `gh` commands.
>
> Either grant the token enough scope to cover your everyday `gh` usage, or scope the variable to Claude Code alone (for example an `alias claude='GITHUB_TOKEN=... claude'`). It must be set when `claude` starts, since the auto-update runs at startup.

### Generating a GitHub token

GitHub offers two kinds of personal access token, and the choice determines how much you expose.

**Fine-grained token — preferred.** Scoped to a single repository, read-only:

1. Go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens** ([direct link](https://github.com/settings/personal-access-tokens/new)).
2. Name it, and set an expiration.
3. **Resource owner**: select the organization that owns the marketplace — not your personal account.
4. **Repository access**: _Only select repositories_ → the marketplace repository.
5. **Permissions → Repository permissions → Contents**: _Read-only_.
6. Generate and copy the token.

For a marketplace owned by an **organization**, the organization must opt in first: an owner enables _Allow access via fine-grained personal access tokens_ under **Organization Settings → Third-party Access → Personal access tokens**. Until that is done the organization does not appear in the _Resource owner_ dropdown at step 3, which is the usual reason only personal repositories are listed. The organization can also require owner approval before a token becomes usable.

**Classic token — fallback only.** For a private repository the minimum scope is `repo`, which grants read **and write** on every repository you can reach, not just the marketplace. There is no read-only classic scope for private repos, so prefer fine-grained whenever the organization allows it.

> For CI/CD, store the token as a repository secret and map it to the environment variable explicitly (`GITHUB_TOKEN: ${{ secrets.YOUR_SECRET }}`) — secrets are not exposed as environment variables automatically.
>
> The `GITHUB_TOKEN` that GitHub Actions provides out of the box is scoped to the **current repository only**. It cannot read a marketplace hosted in a different private repository, even inside the same organization — that requires a PAT or a GitHub App token.

## Creating a Marketplace

1. Create one or more local plugins. Each plugin follows the `.claude-plugin/plugin.json` convention (see [plugins](./plugins.md)). Optionally split plugins by use case (e.g. one plugin for skills only, another for back-end tools).

2. Place all plugins inside a `plugins/` folder within a single marketplace directory, and add a `.claude-plugin/marketplace.json` manifest at the root. The structure should look like:

   ```
   my-marketplace/
   ├── .claude-plugin/
   │   └── marketplace.json          # Marketplace manifest (catalog of plugins)
   ├── plugins/
   │   ├── plugin-a/
   │   │   ├── .claude-plugin/
   │   │   │   └── plugin.json       # Plugin manifest
   │   │   └── skills/...
   │   └── plugin-b/
   │       ├── .claude-plugin/
   │       │   └── plugin.json
   │       └── agents/...
   └── README.md
   ```

3. Write `.claude-plugin/marketplace.json`. It lists the plugins and where to fetch them:

   ```json
   {
     "name": "my-marketplace",
     "owner": {
       "name": "Your Name",
       "email": "you@example.com"
     },
     "metadata": {
       "description": "Internal tools for the team",
       "version": "1.0.0"
     },
     "plugins": [
       {
         "name": "plugin-a",
         "source": "./plugins/plugin-a",
         "description": "Skills for code review"
       },
       {
         "name": "plugin-b",
         "source": {
           "source": "github",
           "repo": "your-org/plugin-b",
           "ref": "v1.2.0"
         },
         "description": "Deployment agents"
       }
     ]
   }
   ```

   Required fields: `name` (kebab-case), `owner.name`, and `plugins[]` (each with `name` + `source`). Optional metadata (`description`, `version`, `author`, `homepage`, `keywords`, `category`, `tags`) can be added per plugin to help discovery.

   > Note: some marketplace names are reserved for Anthropic (e.g. `anthropic-marketplace`, `claude-code-plugins`, `agent-skills`). Pick a unique kebab-case name.

4. Validate the manifests before going further: `claude plugin validate .`, or `/plugin validate .` inside Claude Code. The validator checks `marketplace.json`, every plugin's `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json` for syntax and schema errors.

5. Register the marketplace **locally** to test it, by path — nothing is published yet, so the `owner/repo` shorthand is not available:

   ```bash
   claude plugin marketplace add .
   ```

6. Install a plugin from it with `claude plugin install my-plugin@my-marketplace`, where `my-marketplace` is the `name` field of your `marketplace.json` — **not** the name of your git repository. The two are frequently different: the repository `Lichens-Innovation/ai-dev-tools` registers as the marketplace `lichens-ai-dev-tools`. Run `claude plugin marketplace list` to see the registered name.

7. To publish, push the marketplace directory to a Git host, then register it by repository:

   ```bash
   claude plugin marketplace add owner/repo
   ```

   Note the separator: `add` takes `owner/repo` with a slash. The `@` form (`plugin@marketplace`) belongs to `install`, not to `add`.

8. See [Private Repositories](#private-repositories) for accessing a marketplace published in a private repository.

9. You can now reference your marketplace in any of your projects so other developers are prompted to install it when they clone one of your projects — see [Auto-register for a team](#auto-register-for-a-team).

### Plugin Sources

Each plugin entry has a `source` field telling Claude Code where to fetch that plugin from. A marketplace can mix source types freely — one marketplace can list a plugin stored locally, another pulled from GitHub, and another installed from npm.

| Source        | Example                                                                      | When to use                                                            |
| ------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Relative path | `"source": "./plugins/my-plugin"`                                            | Plugin lives inside the marketplace repo. Must start with `./`.        |
| `github`      | `{ "source": "github", "repo": "owner/repo", "ref": "v1.0", "sha": "..." }`  | Plugin lives in a separate GitHub repo. `ref` and `sha` pin a version. |
| `url`         | `{ "source": "url", "url": "https://gitlab.com/team/plugin.git" }`           | Plugin lives in a non-GitHub git host.                                 |
| `git-subdir`  | `{ "source": "git-subdir", "url": "...", "path": "tools/claude-plugin" }`    | Plugin lives in a subdirectory of a monorepo. Uses sparse clone.       |
| `npm`         | `{ "source": "npm", "package": "@acme/claude-plugin", "version": "^2.0.0" }` | Plugin is published as an npm package, public or private registry.     |

Regardless of source, once installed a plugin is copied into the local versioned cache at `~/.claude/plugins/cache`, so hooks and scripts must reference plugin-internal files using `${CLAUDE_PLUGIN_ROOT}`.

## Managing Marketplaces

Each command below is available both as `/plugin marketplace <cmd>` inside a session and `claude plugin marketplace <cmd>` from the shell.

| Command                                   | Action          | Notes                                                                                                                                                  |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `claude plugin marketplace add <source>`  | Register        | Takes `owner/repo`, a git URL, or a local path. `--scope user\|project\|local` sets where it is declared; `--sparse <paths...>` limits the checkout for monorepos. |
| `claude plugin marketplace list`          | List registered | Add `--json` for machine-readable output. Shows the registered name, which comes from `marketplace.json` and may differ from the repository name.       |
| `claude plugin marketplace update`        | Update all      | Re-pulls catalogs, picks up new plugins and version bumps. Auto-runs at startup for marketplaces reachable without interactive credentials.            |
| `claude plugin marketplace update <name>` | Update one      | Refresh a single marketplace by name.                                                                                                                  |
| `claude plugin marketplace remove <name>` | Remove          | **Warning:** also uninstalls every plugin installed from this marketplace. To refresh without losing plugins, use `update` instead of remove + re-add. |

### Renaming a plugin

A plugin's name appears in several places that must stay in sync. Renaming means updating all of them:

1. The directory under `plugins/`.
2. `marketplace.json`: the entry's `name` **and** its `source` path, if the plugin is stored by relative path.
3. The plugin's own `plugin.json`: `name`, plus `homepage` if it points at the plugin directory.
4. Any references in READMEs or docs, including `install` commands, which use the `plugin@marketplace` form.

A plugin exists for Claude Code only when it is both on disk under `plugins/` and listed in `marketplace.json`. Renaming the directory without updating the manifest publishes nothing, and the mismatch is silent — no error is raised. Run `claude plugin validate .` afterwards to confirm the manifests still agree.

### Versioning and release channels

- A plugin's version can be declared in its `plugin.json` (`version`) or in the marketplace entry. If both are set, the `plugin.json` value silently wins — prefer declaring the version in `plugin.json`, except for relative-path plugins where the marketplace entry is authoritative.
- Pin GitHub / git sources to an exact release using `ref` (branch or tag) and `sha` (full commit). This is the safest way to guarantee reproducible installs.
- To ship "stable" and "latest" channels, create two marketplaces pointing at different `ref`s of the same plugin repo and assign each to a user group via [`extraKnownMarketplaces`](https://code.claude.com/docs/en/settings#extraknownmarketplaces) in managed settings. The plugin's `plugin.json` must declare a different `version` at each ref — same version string = Claude Code treats them as identical and skips the update.

### Auto-register for a team

Declare marketplaces in `.claude/settings.json` so team members are prompted to install them when they open the project:

```json
{
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": { "source": "github", "repo": "your-org/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "code-formatter@company-tools": true
  }
}
```
