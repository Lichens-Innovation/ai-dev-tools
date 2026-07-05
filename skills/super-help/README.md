# super-help

General-purpose Q&A skill for the Claude Code AI Dev Tools ecosystem. Routes the user's question to the relevant docs (plugins, skills, subagents, hooks, marketplaces, rules, MCP, memory, CLI commands).

## Triggers

Loaded when the user asks how something works, wants to understand a concept, or needs guidance on any Claude Code tooling topic — without a more specific create/manage skill being the obvious match.

## What it contains

The `SKILL.md` is a thin dispatcher that points Claude at the right document in `docs/` for the topic at hand. The full knowledge lives in those docs, not in the skill itself.

## Related

- `manage-marketplace` — specific to marketplace/plugin CLI workflows
- `create-skill`, `create-subagent`, `create-plugin`, `create-marketplace` — when the user wants to build something rather than ask about it
