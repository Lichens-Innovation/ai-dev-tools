# Artificial Intelligence Lichens Tools

Lichens Innovation repository for **AI-assisted development tools** — a single place for rules, agents, skills, MCP (Model Context Protocol) servers, and any other artifacts that enhance coding with AI (Cursor, GitHub Copilot, Claude Code, etc.). This repo started with Agent Skills and has grown to cover the full spectrum of configurable AI dev tooling.

## Table Of Content

  - [Claude Code](./docs/claude-code.md)
  - [Hooks](./docs/hooks.md)
  - [Marketplace](./docs/marketplace.md)
  - [MCP](./docs/mcp.md)
  - [Plugins](./docs/plugins.md)
  - [Rules](./docs/rules.md)
  - [Skills](./docs/skills.md)
  - [Skills CLI](./docs/skills-cli.md)
  - [Subagents](./docs/subagents.md)
  - [Helpers & Tooling](./docs/helpers-and-tools.md)

## Getting Started

1. If you are new to Claude Code, start by reading the [Claude Code](./docs/claude-code.md)
2. Install the `ai-tools-manager` plugin following the [plugin installation](#plugin)
3. Browse what you now have installed — plugins, commands, rules, usage and these docs — from the
   **Library** menu of the [Maestro desktop app](./apps/maestro) (see below), or ask the
   `/super-help` skill from any Claude Code session

## Maestro

**Maestro** turns a project into a multi-agent workflow: an orchestrator skill that classifies each
request, picks a configured workflow, and dispatches subagents whose skills and handoff rules are
injected at runtime from `.claude/maestro.json`. It has two halves that meet at that file:

- **Authoring** — the [Maestro desktop app](./apps/maestro), an Electron app. Open a project folder
  and edit the workflow graph, the rule assignments, and the runtime install; watch the session log
  live; run the four create-\* forms. No Claude session is involved in a save, and there is no
  server, container or browser to start.

  ```bash
  pnpm install
  pnpm --filter maestro build && pnpm --filter maestro start
  ```

- **Runtime** — hook scripts in the `ai-tools-manager` plugin that fire inside a Claude session
  (`SubagentStart`, `PreToolUse`, `SubagentStop`, `PostToolUse`, `SessionEnd`). These need a
  session to run, but not to be installed.

Without the desktop app you can still set a project up entirely from a session: `/maestro-install`
scaffolds the orchestrator, seeds `maestro.json` and renders the handoff table; `/maestro-update`
refreshes it; `/maestro-uninstall` removes it.

## Installation

### Plugin

To use agents, skills, hooks and MCP with Claude Code, install the desired [plugin](./docs/plugins.md#using-skills-and-other-tool-from-plugins) :

1. Clone the repository `git clone https://github.com/Lichens-Innovation/ai-dev-tools.git`
2. Register to the marketplace `claude plugin marketplace add ./ai-dev-tools`
3. Install the desired plugin with `claude plugin install my-plugin@lichens-ai-dev-tools`, e.g. `claude plugin install ai-tools-manager@lichens-ai-dev-tools`

### Rule

For [rules installation](./docs/rules.md#installation):

1. Clone the repository `git clone https://github.com/Lichens-Innovation/ai-dev-tools.git`
2. `npm i -g vibe-rules`
3. `vibe-rules load ./path-to/rule.md <editor>` e.g. `vibe-rules load ./ai-dev-tools/rules/python-style.md claude-code`

### Handpicked Skills

Use this method when installing a single [skill installation](./docs/skills-cli.md#installation) without using plugins. Note that for Claude Code, the only downside is that skill are installed in a separated `.agents` folder and not directly in the `.claude` in order to respect the AGENT.md convention that Anthropic seems to avoid at all cost to stay "special".

1. Clone the repository `git clone https://github.com/Lichens-Innovation/ai-dev-tools.git`
2. `npx skills add ./ai-dev-tools/skills/my-skills` e.g. `npx skills add ./ai-dev-tools/skills/generate-pr-description`.
3. The skill CLI will enter an interractive mode, you will select your agent (e.g. claude code) and the scope (project / global).
