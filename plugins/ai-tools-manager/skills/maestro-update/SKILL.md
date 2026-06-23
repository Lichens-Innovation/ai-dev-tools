---
name: afk-sync
description: "Refreshes the AFK runtime scripts from the plugin and re-renders the AFK orchestrator skill (.claude/skills/agent-orchestrator/SKILL.md) from .claude/afk.json. Use after hand-editing afk.json, when the orchestrator's handoff table looks out of date, or to pull script updates from a newer plugin version. Run /afk instead if you want to edit the config visually."
---

# AFK Sync

Refresh the project's AFK runtime scripts from the plugin and regenerate the managed region of the orchestrator from the current `.claude/afk.json`.

## Workflow

1. **Refresh the runtime scripts** by re-running the installer (idempotent — skips settings and gitignore if already present, never overwrites the orchestrator skill):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/afk-install.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   This overwrites `.claude/scripts/{afk-set-session-workflow.cjs,afk-render-orchestrator.cjs,bash-validation.sh,lib/afk-session.cjs}` with the current plugin versions, so any fixes or new validation steps in a newer plugin release are picked up immediately.

2. **Run the renderer** from the project root:

   ```bash
   node "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/afk-render-orchestrator.cjs"
   ```

   This rewrites the `<!-- AFK:HANDOFFS -->` table in `.claude/skills/agent-orchestrator/SKILL.md` from each workflow's derived success path. Everything else in the skill file (your custom orchestration instructions) is preserved.

3. **If step 1 reports `agent-orchestrator/SKILL.md not found`**, the orchestrator hasn't been installed yet. Run `/afk-install` instead.

4. **Report** the result to the user: confirm the scripts were refreshed and the file was re-rendered, and summarise the workflow → success-path rows now in the table.

## Notes

- Hook scripts (`afk-inject-agent-context.js`, `afk-subagent-log.js`, `afk-session-log.js`) run from `${CLAUDE_PLUGIN_ROOT}/scripts/` and are always current — no sync needed for them.
- Project-copied scripts (`afk-set-session-workflow.cjs`, `afk-render-orchestrator.cjs`, `bash-validation.sh`, `lib/afk-session.cjs`) are what step 1 refreshes.
- `afk.json` is the source of truth. The `SubagentStart` hook reads it directly at runtime, so subagent skill injection is always current even between `/afk-sync` runs — only the orchestrator's handoff table needs the renderer re-run.
