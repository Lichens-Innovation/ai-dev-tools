# Artificial Intelligence Lichens Tools

Lichens Innovation repository for **AI-assisted development tools** — a single place for rules, agents, skills, MCP (Model Context Protocol) servers, and any other artifacts that enhance coding with AI (Cursor, GitHub Copilot, Claude Code, etc.). This repo started with Agent Skills and has grown to cover the full spectrum of configurable AI dev tooling.

- [Artificial Intelligence Lichens Tools](#artificial-intelligence-lichens-tools)
  - [Claude Code](./docs/claude-code.md)
  - [Hooks](./docs/hooks.md)
  - [Marketplace](./docs/marketplace.md)
  - [MCP](./docs/mcp.md)
  - [Plugins](./docs/plugins.md)
  - [Rules](./docs/rules.md)
  - [Skills](./docs/skills.md)
  - [Skills CLI](./docs/skills-cli.md)
  - [Subagents](./docs/subagents.md)

## Getting Started

1. If you are new to Claude Code, start by reading the [Claude Code](./docs/claude-code.md)
2. Install the `ai-tools-manager` plugin following the [plugin installation](#plugin)
3. Start a claude code session and launch the help server using the `/help-server`

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
