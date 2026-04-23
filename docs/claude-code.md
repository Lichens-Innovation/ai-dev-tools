# Claude Code

## Initialize A Project

From [Claude Code doc](https://code.claude.com/docs/en/memory#set-up-a-project-claude-md):

Run /init to generate a starting CLAUDE.md automatically. Claude analyzes your codebase and creates a file with build commands, test instructions, and project conventions it discovers. If a CLAUDE.md already exists, /init suggests improvements rather than overwriting it. Refine from there with instructions Claude wouldn’t discover on its own.

Set CLAUDE_CODE_NEW_INIT=1 to enable an interactive multi-phase flow:

macOS/Linux: `export CLAUDE_CODE_NEW_INIT=1`
windows: `$env:CLAUDE_CODE_NEW_INIT=1`

/init asks which artifacts to set up: CLAUDE.md files, skills, and hooks. It then explores your codebase with a subagent, fills in gaps via follow-up questions, and presents a reviewable proposal before writing any files.

## Models

- opus: complex tasks
- sonnet: default (normal tasks)
- haiku: easy tasks (e.g. give a PR summary)

## Useful Commands

| Command                        | Description                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| `/clear`                       | Start fresh conversation; previous stays available via `/resume`         |
| `/compact [instructions]`      | Summarize conversation to free up context window                         |
| `/config`                      | Open settings UI (theme, model, output style)                            |
| `/context`                     | Visualize current context usage with optimization suggestions            |
| `/cost`                        | Show token usage stats for current session                               |
| `/diff`                        | Interactive diff viewer for uncommitted changes                          |
| `/doctor`                      | Diagnose installation and settings issues                                |
| `/help`                        | Show available commands                                                  |
| `/hooks`                       | View hook configurations for tool events                                 |
| `/init`                        | Generate CLAUDE.md for current project                                   |
| `/memory`                      | Edit CLAUDE.md memory files and auto-memory entries                      |
| `/mcp`                         | Manage MCP server connections                                            |
| `/model [sonnet\|opus\|haiku]` | Switch model mid-session                                                 |
| `/permissions`                 | Manage allow/ask/deny rules for tools                                    |
| `/resume [session]`            | Resume a previous conversation                                           |
| `/review [PR]`                 | Review a pull request locally                                            |
| `/rewind`                      | Rewind conversation and/or code to a previous point                      |
| `/security-review`             | Scan pending branch changes for security vulnerabilities                 |
| `/simplify`                    | Review recently changed files for quality/efficiency issues and fix them |
| `/stats`                       | Visualize daily usage, session history, and model preferences            |
| `/terminal-setup`              | Configure terminal keybindings (Shift+Enter, etc.)                       |
| `/theme`                       | Change color theme                                                       |
| `/usage`                       | Show plan limits and rate limit status                                   |

## Custom Statusline

In `.claude/settings.json`

```
{
  "model": "opus",
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 2
  },
}
```

In `.claude/statusline.sh`

```
#!/bin/bash
# Read JSON data that Claude Code sends to stdin
input=$(cat)

# Extract fields using jq
MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
# The "// 0" provides a fallback if the field is null
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)

# Output the status line - ${DIR##*/} extracts just the folder name
echo "[$MODEL] 📁 ${DIR##*/} | ${PCT}% context"
```

See [the official doc for different templates](https://code.claude.com/docs/en/statusline).
