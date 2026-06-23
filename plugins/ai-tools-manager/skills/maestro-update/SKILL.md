---
name: maestro-update
description: "Refreshes the Maestro runtime scripts from the plugin and re-renders the Maestro orchestrator skill (.claude/skills/maestro/SKILL.md) from .claude/maestro.json. Use after hand-editing maestro.json, when the orchestrator's handoff table looks out of date, or to pull script updates from a newer plugin version. Run /maestro-app instead if you want to edit the config visually."
---

# Maestro Update

Refresh the project's Maestro runtime scripts from the plugin and regenerate the managed region of the orchestrator from the current `.claude/maestro.json`.

## Workflow

1. **Refresh the runtime scripts** by re-running the installer (idempotent — skips settings and gitignore if already present, never overwrites the orchestrator skill):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/maestro-install.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   This overwrites `.claude/scripts/{maestro-set-session-workflow.cjs,maestro-render-orchestrator.cjs,bash-validation.sh,lib/maestro-session.cjs}` with the current plugin versions, so any fixes or new validation steps in a newer plugin release are picked up immediately.

2. **Run the renderer** from the project root:

   ```bash
   node "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/maestro-render-orchestrator.cjs"
   ```

   This rewrites the `<!-- Maestro:HANDOFFS -->` table in `.claude/skills/maestro/SKILL.md` from each workflow's derived success path. Everything else in the skill file (your custom orchestration instructions) is preserved.

3. **If step 1 reports `maestro/SKILL.md not found`**, the orchestrator hasn't been installed yet. Run `/maestro-install` instead.

4. **Report** the result to the user: confirm the scripts were refreshed and the file was re-rendered, and summarise the workflow → success-path rows now in the table.

## Notes

- Hook scripts (`maestro-inject-agent-context.js`, `maestro-subagent-log.js`, `maestro-session-log.js`) run from `${CLAUDE_PLUGIN_ROOT}/scripts/` and are always current — no sync needed for them.
- Project-copied scripts (`maestro-set-session-workflow.cjs`, `maestro-render-orchestrator.cjs`, `bash-validation.sh`, `lib/maestro-session.cjs`) are what step 1 refreshes.
- `maestro.json` is the source of truth. The `SubagentStart` hook reads it directly at runtime, so subagent skill injection is always current even between `/maestro-update` runs — only the orchestrator's handoff table needs the renderer re-run.
