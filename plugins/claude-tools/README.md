# claude-tools

General-purpose tools and skills for Claude Code — a place for utilities that don't
belong to a specific stack (CI, React, etc.) but are broadly useful across projects.

## What's inside

- **claude-light** — applies a lightweight local Claude Code configuration
  (`.claude/settings.local.json`) that shrinks the auto-compact window and disables
  connectors, workflows, bundled skills, artifacts, and a set of noisy/expensive tools.
- **super-help** — general-purpose Q&A skill for the Claude Code AI Dev Tools ecosystem
  (plugins, skills, subagents, hooks, marketplaces, rules, MCP, memory, CLI commands).
- **`/help-server` command** — starts (or opens) the AI Dev Tools help server dashboard
  via Docker Compose.
- **manage-marketplace** — reference for installing, updating, and removing Claude Code
  plugins and marketplaces.

More skills and agents get added over time using `create-skill` and `create-subagent`
from the `ai-tools-manager` plugin.

## Install

From this marketplace:

```bash
claude plugin marketplace add lichens-ai/ai-dev-tools
claude plugin install claude-tools@lichens-ai-dev-tools
```

## Use it

- `/claude-light` — apply the light-mode local settings to the current project.
- `/super-help` — ask a question about the Claude Code AI Dev Tools ecosystem.
- `/help-server` — start the help server and open its dashboard in the browser.
- `/manage-marketplace` — ask about plugin/marketplace install, update, or removal commands.
