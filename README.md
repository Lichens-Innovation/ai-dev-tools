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

## Installation

### Plugin

For agents, skills, hooks and MCP, with Claude Code install the desired [plugin](./docs/plugins.md#using-skills-and-other-tool-from-plugins) :

1. Clone the repository
2. Register to the marketplace `claude plugin marketplace add ./ai-dev-tools`
3. Install the desired plugin with `claude plugin install my-plugin@lichens-ai-dev-tools`, e.g. `claude plugin install ci@lichens-ai-dev-tools`

### Rule

For [rules installation](./docs/rules.md#installation):

1. Clone the repository
2. `npm i -g vibe-rules`
3. `vibe-rules load ./path-to/rule.md <editor>` e.g. `vibe-rules load ./ai-dev-tools/rules/python-style.md claude-code`

### Handpicked Skills

For single [skill installation](./docs/skills-cli.md#installation) without using plugins. Note that for Claude Code, the only downside is that skill are installed in a separated `.agents` folder and not directly in the `.claude` to respect the AGENT.md convention that Anthropic seems to avoid at all cost to stay "special".

1. Clone the repository
2. `npx skills add ./ai-dev-tools/skills/my-skills` e.g. `npx skills add ./ai-dev-tools/skills/generate-pr-description`.
3. The skill CLI will enter an interractive mode, you will select your agent (e.g. claude code) and the scope (project / global).

## Skills, Rules, Subagents, Memory And Hooks

When you start using this repository your first question will probably be something like: what tool do I need to use ? This is totally normal because it is always confusing at first to understand the difference between skill, rules, subagents, etc. since at the end of the day, they are all simply markdown files !

To understand their different roles, you can compare Claude Code to a restaurant :

| Tool                                                                                                                                                                                                                                                           | Kitchen analogy                                                                   | When to use                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| **Subagent** ![chefs](https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjdBBcaVgI6hEIGEQnw9PhTyinKFr8x1RAwSSPpBmMvtnRrWOLqI0h1Mz3eSs-Mifu-YbFdsa0Dgc2Ywx9JkmTMdJQI9ypI-ZnKu8XhiDaZezBQHWAhdY5rM8Zx_-1xk0s9OkM447EQK8Uu/s1600/ratatouille-journal.jpg) | Kitchen chef — owns a domain (backend, frontend, ci) and handles it independently | Task requires deep focus in one area      |
| **Skill** ![recipe](https://static.wikia.nocookie.net/disney/images/e/e8/Anyone_Can_Cook.jpg/revision/latest?cb=20120719045937)                                                                                                                                | Defines _how_ to do something specific                                            | Recipe — reusable, step-by-step technique |
| **Rules** ![rules](https://images.squarespace-cdn.com/content/v1/60241cb68df65b530cd84d95/381e8fb7-fbf3-4f8d-a0a6-235131a48970/3.jpg)                                                                                                                          | Restaurant guidelines — e.g. don’t put too much salt                              | General coding standards and constraints  |
| **Hooks** ![dishwashing](https://headsupab.wordpress.com/wp-content/uploads/2012/01/dirty-dishes.png)                                                                                                                                                          | Dishwasher — runs automatically, no person needed                                 | Stuff that can be fully automated         |
