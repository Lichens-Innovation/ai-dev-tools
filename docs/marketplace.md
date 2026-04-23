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

You can update all installed marketplace from the console: `claude plugin marketplace update`.

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

4. Register your marketplace with `/plugin marketplace add ./path/to/my-marketplace`
5. Install a plugin from it with `/plugin install plugin-a@my-marketplace`
6. Before publishing, validate the JSON and test installation locally: `claude plugin validate .` or inside Claude Code: `/plugin validate .`. The validator checks `marketplace.json`, every plugin's `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json` for syntax and schema errors.
7. To publish, push the marketplace directory to a Git host and add it with `/plugin marketplace add owner/repo`.
8. See [Private Repositories](https://code.claude.com/docs/en/plugin-marketplaces#private-repositories) for accessing a marketplace that you published in a private repository.
9. You can now reference your marketplace in any of your projects so other developpers are prompted to install it when they clone one of your project, see [Auto-register for a team](#auto-register-for-a-team) .

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
| `claude plugin marketplace list`          | List registered | Add `--json` for machine-readable output.                                                                                                              |
| `claude plugin marketplace update`        | Update all      | Re-pulls catalogs, picks up new plugins and version bumps. Auto-runs at startup for marketplaces reachable without interactive credentials.            |
| `claude plugin marketplace update <name>` | Update one      | Refresh a single marketplace by name.                                                                                                                  |
| `claude plugin marketplace remove <name>` | Remove          | **Warning:** also uninstalls every plugin installed from this marketplace. To refresh without losing plugins, use `update` instead of remove + re-add. |

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
