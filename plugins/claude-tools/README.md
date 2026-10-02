# claude-tools

General-purpose tools and skills for Claude Code — a place for utilities that don't
belong to a specific stack (CI, React, etc.) but are broadly useful across projects.

## What's inside

- **claude-light** — applies a lightweight local Claude Code configuration
  (`.claude/settings.local.json`) that disables connectors, workflows, bundled skills,
  artifacts, and a set of noisy/expensive tools, and optionally enables auto-compact at a
  chosen level (default 200k). Re-runnable: it lists every global plugin, skill, agent, MCP
  server and marketplace and offers to disable more of them for the project.
- **setup-claude-guardrails** — installs native permission rules, an optional Bash sandbox, and a
  `PreToolUse` hook in the project's `.claude/` and its git worktrees (personal, untracked by git) that keep Claude
  inside a scoped directory (the project, or a parent like `~/Documents/gits`) and block access
  to `.env` files (except `.env*.example`). It also installs `.claude/rules/guardrails.md`, a rule
  telling Claude which tools to avoid and how to phrase commands so the hook doesn't reject them.
- **super-help** — general-purpose Q&A skill for the Claude Code AI Dev Tools ecosystem
  (plugins, skills, subagents, hooks, marketplaces, rules, MCP, memory, CLI commands).
- **`/help-server` command** — starts (or opens) the AI Dev Tools help server dashboard
  via Docker Compose.
- **manage-marketplace** — reference for installing, updating, and removing Claude Code
  plugins and marketplaces.

## Install

From this marketplace:

```bash
claude plugin marketplace add lichens-ai/ai-dev-tools
claude plugin install claude-tools@lichens-ai-dev-tools
```

## Use it

- `/claude-light` — apply the light-mode local settings to the current project.
- `/setup-claude-guardrails` — install the scope and `.env` guardrails in the current project.
- `/super-help` — ask a question about the Claude Code AI Dev Tools ecosystem.
- `/help-server` — start the help server and open its dashboard in the browser.
- `/manage-marketplace` — ask about plugin/marketplace install, update, or removal commands.
