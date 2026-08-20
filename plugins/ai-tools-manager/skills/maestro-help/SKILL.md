---
name: maestro-help
description: "Answer questions about the Maestro desktop app itself (opening a project, the workflows canvas, rules, the session pane and log, the tools dashboard, the Create flows, runtime install) AND about the Claude Code AI Dev Tools ecosystem — plugins, skills, subagents, hooks, marketplaces, rules, MCP, memory, and CLI commands. Use when the user asks how something works, wants to understand a concept, or needs guidance on any Maestro or Claude Code tooling topic."
---

# Maestro Help

Answer any question about the Maestro desktop app, or about the Claude Code AI Dev Tools
ecosystem, by consulting the relevant reference docs.

## Topic → Doc Mapping

Pick only the doc(s) relevant to the user's question — do not read all of them.

### Maestro, the app

| Topic | Doc |
|---|---|
| What Maestro is, opening a project, the config/state files, top-bar layout | `${CLAUDE_SKILL_DIR}/../../../../apps/maestro/docs/app/overview.md` |
| Workflows canvas, the rules view | `${CLAUDE_SKILL_DIR}/../../../../apps/maestro/docs/app/workflows-and-rules.md` |
| Chat/session pane, the session log | `${CLAUDE_SKILL_DIR}/../../../../apps/maestro/docs/app/session-and-log.md` |
| Tools dashboard, Maestro Tasks, install/runtime, the Create flows | `${CLAUDE_SKILL_DIR}/../../../../apps/maestro/docs/app/tools-tasks-runtime.md` |

### Claude Code concepts

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

1. **Identify the topic** from the user's question — is it about the Maestro app itself, a Claude
   Code concept, or both?
2. **Read the relevant doc(s)** using the table(s) above — read only the sections needed.
3. **Answer directly** with concrete steps, examples, or clarifications. Reference doc sections
   and file paths where useful.
4. **If the question spans both tables** — e.g. "how does Maestro decide which skills a subagent
   gets" — read one doc from each side and synthesize a single answer that connects them, rather
   than answering only the Maestro half or only the Claude Code half.

## Answer Style

- Lead with the direct answer, then add supporting context.
- Include concrete examples (file snippets, CLI commands, or what a Maestro route/tab shows) when
  they help.
- If the user's question implies they want to *do* something (not just understand it), suggest
  the matching route or skill: for the app, the `/maestro` page (runtime), the `/tools` dashboard,
  or the relevant Create route; for the ecosystem, `/create-skill`, `/create-plugin`,
  `/create-subagent`, `/manage-marketplace`.
