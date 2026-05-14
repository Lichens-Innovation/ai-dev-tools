# Plugins

Claude Code uses the plugin concept. A plugin is a collection of tools for Claude Code. In short it is a way to export and import a `.claude` folder and it’s content. This means a plugin can be a mix of agents, skills, hooks and MCP servers. It cannot be used for rules.

To enable claude code to access your plugin content globally and identify it’s content, a specific `.claude-plugin/plugin.json` **manifest** file is added. For example a simple plugin for a skill could look like this:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json       # Required: Plugin metadata (name, version, etc.)
├── skills/               # Required: Directory for your skill(s)
│   └── my-skill-name/    # Subdirectory for a specific skill (kebab-case)
│       ├── SKILL.md      # Required: The main skill definition file
│       ├── scripts/      # Optional: Executable scripts (Python, JS, Shell)
│       │   └── helper.py
│       └── references/   # Optional: Supporting documentation or templates
│           └── api-guide.md
└── README.md             # Recommended: Documentation for human users
```

## Using Skills and Other Tools from Plugins

Start by making sure the plugin is available to Claude Code:

- For remote plugins: Install a plugin with `/plugin install my-plugin@my-marketplace`. See [marketplace](./marketplace.md) for more information.
- For local plugins, load the directory with `claude --plugin-dir ./my-plugin`. You can load multiple plugins at once with `claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two`.

Then you can call the plugin’s skills and subagents as you would normally (`/my-skill`, `@my-agent`).

## Enabling and Disabling Plugins

Installed plugins can be toggled on or off without uninstalling them:

- Run `/plugin` to open the plugin menu.
- Select the plugin and toggle its enabled state.

Disabled plugins keep their files but their content is not loaded into Claude Code.

## Updating Plugins

From Claude Code:

- Update a skill in Claude Code: `/manage` -> select the Installed tab -> select the desired skill to update -> select Update now.

## Creating a Plugin

1. Create the plugin directory structure:

   ```
   my-plugin/
   ├── .claude-plugin/
   │   └── plugin.json
   └── skills/
       └── my-skill-name/
           └── SKILL.md
   ```

2. Add the manifest at `.claude-plugin/plugin.json`:

   ```json
   {
     "name": "my-plugin",
     "version": "0.1.0",
     "description": "Short description of what the plugin does",
     "author": {
       "name": "Your Name",
       "email": "you@example.com"
     },
     "homepage": "https://github.com/your-org/my-plugin",
     "keywords": ["review", "testing"]
   }
   ```

   Only `name` is strictly required. The extra fields help users discover and identify the plugin.

3. Add your content (skills, agents, hooks, commands, etc.) in the matching folders. Each skill goes in its own `kebab-case` subdirectory under `skills/` with a `SKILL.md` file.

4. Load the directory with `claude --plugin-dir ./my-plugin`
5. Call your skill and other tools like you would normally (ex: `/my-skill`, `@my-agent`).

## Hooks

You can add hooks directly to `plugin.json` or in `hooks/hooks.json` and define them as you would in your project’s `.claude/setting.json`. When a user enables the plugin, those hooks activate automatically and run alongside any user-defined hooks.

Example hook entry in `plugin.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/format.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

### Hooks with Relative Paths

When a plugin needs to point at its own files, use the `${CLAUDE_PLUGIN_ROOT}` environment variable. It resolves to the absolute install path of the plugin at runtime, so paths stay valid no matter where the plugin is installed.

If your plugin hooks uses a path placeholder (e.g. `${CLAUDE_PLUGIN_ROOT}`), always set the `args` field so the hook runs in exec form, since each element is passed as one argument with no quoting.

**Important:** In exec form, `command` is the raw binary to spawn — it is never tokenized or split by spaces. If your hook runs a script through an interpreter (e.g. `node`, `python`), put the interpreter in `command` and the script path in `args`:

```json
{
  "hooks": {
    "UserPromptExpansion": [
      {
        "matcher": "my-skill",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/my-script.cjs"]
          }
        ]
      }
    ]
  }
}
```

Setting `"command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/my-script.cjs"` would fail with `ENOENT` because the entire string is treated as a single binary name.

### Hooks with Shell features

To use the shell features, like pipes or `&&`, make sure that you run the hook as shell form by omitting the `args` field from the hook.
