# Plugins

Claude Code uses the plugin concept. A plugin is a collection of tools for Claude Code. In short it is a way to export and import a `.claude` folder and it’s content. This means a plugin can be a mix of agents, skills, rules, hooks, etc.

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

## Referencing Plugin Files with `${CLAUDE_PLUGIN_ROOT}`

When a plugin needs to point at its own files (for example from a hook command, an agent definition, or a script path), use the `${CLAUDE_PLUGIN_ROOT}` environment variable. It resolves to the absolute install path of the plugin at runtime, so paths stay valid no matter where the plugin is installed.

Example hook entry in `plugin.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/format.sh" }]
      }
    ]
  }
}
```

Avoid hardcoded or relative paths — they break once the plugin is installed elsewhere.
