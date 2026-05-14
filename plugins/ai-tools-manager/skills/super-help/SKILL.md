---
name: super-help
description: "Answer questions about the Claude Code AI Dev Tools ecosystem — plugins, skills, subagents, hooks, marketplaces, rules, MCP, memory, and CLI commands. Use when the user asks how something works, wants to understand a concept, or needs guidance on any Claude Code tooling topic."
---

# Help

Answer any question about the Claude Code AI Dev Tools ecosystem by consulting the relevant reference docs.

## Topic → Doc Mapping

Pick only the doc(s) relevant to the user's question — do not read all of them.

| Topic | Doc |
|---|---|
| Plugins (structure, manifest, enabling, updating) | `${CLAUDE_SKILL_DIR}/../../../../docs/plugins.md` |
| Skills (format, creating, installing, popular repos) | `${CLAUDE_SKILL_DIR}/../../../../docs/skills.md` |
| Subagents (AGENTS.md, coordination, delegation) | `${CLAUDE_SKILL_DIR}/../../../../docs/subagents.md` |
| Hooks (PreToolUse, PostToolUse, lifecycle, scripts) | `${CLAUDE_SKILL_DIR}/../../../../docs/hooks.md` |
| Marketplace (registering, publishing, versioning, auto-updates) | `${CLAUDE_SKILL_DIR}/../../../../docs/marketplace.md` |
| Rules (format, scope, .clinerules) | `${CLAUDE_SKILL_DIR}/../../../../docs/rules.md` |
| MCP servers (configuration, tools) | `${CLAUDE_SKILL_DIR}/../../../../docs/mcp.md` |
| Memory (persistent memory for subagents) | `${CLAUDE_SKILL_DIR}/../../../../docs/memory.md` |
| Skills CLI (`skills add`, `skills list`, `npx skills`) | `${CLAUDE_SKILL_DIR}/../../../../docs/skills-cli.md` |
| Claude Code settings, commands, IDE integrations | `${CLAUDE_SKILL_DIR}/../../../../docs/claude-code.md` |

## Workflow

1. **Identify the topic** from the user's question.
2. **Read the relevant doc(s)** using the table above — read only the sections needed.
3. **Answer directly** with concrete steps, examples, or clarifications. Reference doc sections and file paths where useful.
4. **If the question spans multiple docs**, read each one and synthesize a unified answer.

## Answer Style

- Lead with the direct answer, then add supporting context.
- Include concrete examples (file snippets, CLI commands) when they help.
- If the user's question implies they want to *do* something (not just understand it), suggest the matching skill: `/create-skill`, `/create-plugin`, `/create-subagent`, `/manage-marketplace`.
