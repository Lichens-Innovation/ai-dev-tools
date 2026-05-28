---
name: agents-framework-kickstarter
description: "Scaffolds an afk.yaml at the project root from a web form. The user picks bundled subagents from this plugin, maps project-local skills to each, and defines workflows and handoffs. The plugin's PreToolUse hook later reads afk.yaml to inject the configured skills as additionalContext on every subagent invocation. Use when the user runs /agents-framework-kickstarter, or asks to scaffold afk.yaml, set up the subagents workflow for this project, or configure agent↔skill mappings."
---

# Agents Framework Kickstarter

Scaffold the project's `afk.yaml` — the per-project config that maps subagents to their skills, lists rules, and defines workflows and handoffs. The plugin's `PreToolUse` hook on the `Task` tool reads this file at every subagent invocation and injects the matching skill list as `additionalContext`, making the bundled subagents project-agnostic.

## User's intention

$ARGUMENTS

## Workflow

1. **Read the form payload** — the `UserPromptExpansion` hook injected an `additionalContext` string that begins with `AFK form data:` followed by a JSON object:

   ```json
   {
     "projectPath": "<absolute cwd>",
     "config": {
       "version": 1,
       "agents":    [{ "id": "backend", "skills": ["confidence-check", "..."] }],
       "rules":     ["db-standards", "..."],
       "skills":    [{ "id": "...", "source": "project", "user_invocable": false }],
       "workflows": [{ "name": "Feature", "steps": [{ "type": "agent", "id": "backend" }, { "type": "human_approval" }] }],
       "handoffs":  [{ "scenario": "Routes", "steps": [{ "type": "agent", "id": "backend" }] }]
     }
   }
   ```

2. **Write `afk.yaml`** — emit `<projectPath>/afk.yaml` using the canonical schema below. Match the formatting exactly — top-level list items have no leading indent before `-`; nested keys indent two spaces.

   ```yaml
   version: 1
   agents:
   - id: <agent-id>
     skills:
     - <skill-id>
   rules:
   - <rule-id>
   skills:
   - id: <skill-id>
     source: kickstarter | project
     user_invocable: true | false
   workflows:
   - name: <name>
     steps:
     - type: agent | skill | human_approval | human_review
       id: <id when type is agent or skill, omitted otherwise>
   handoffs:
   - scenario: <name>
     steps:
     - type: agent | skill
       id: <id>
   ```

   - Omit sections only by emitting an empty list (`agents: []`, etc.) — never drop the key.
   - Omit `id` on `human_approval` and `human_review` steps.
   - Do not reorder keys within a record; keep the order shown above.

3. **Report to the user** — confirm the path written, then summarise:
   - How many agents, rules, skills, workflows, and handoffs were saved.
   - That the bundled `PreToolUse` hook will now inject each agent's configured skills automatically when the user invokes `@backend`, `@test`, `@reviewer`, `@scribe`, or `@refactor` via the Task tool.
   - That editing `afk.yaml` by hand is supported — the hook re-reads it on every invocation.

## Notes

- The bundled subagents live at the plugin level (`plugins/ai-tools-manager/agents/`). Their frontmatter has no `skills:` array — that list comes entirely from `afk.yaml` at runtime via the hook.
- Skills referenced in `agents[].skills` must exist as project skills (`<projectPath>/.claude/skills/<id>/SKILL.md`) for Claude to load them when the hook fires.
- If `afk.yaml` is missing or the invoked subagent is not listed in it, the hook is a silent no-op — Task calls behave as if the hook weren't installed.
