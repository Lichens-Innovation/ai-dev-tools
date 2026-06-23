---
name: afk-uninstall
description: "Uninstalls the AFK orchestrator for this project — removes the bash-validation PreToolUse hook from .claude/settings.json and deletes the ephemeral session files. By default keeps afk.json and the orchestrator skill. Pass --purge to also remove the installed orchestrator skill, runtime scripts, and the afk.json config — everything the install pipeline produced. Use when the user wants to turn off AFK, undo /afk-install, or uninstall the subagents workflow."
---

# AFK Uninstall

Remove the AFK orchestrator that `/afk-install` installed. This is the inverse of the installer. By default it is conservative: it removes the bash-validation hook and clears ephemeral session state — your config (`afk.json`) and the orchestrator skill are kept.

## Workflow

1. **Decide the scope.** Ask the user (or infer from their request):
   - default — remove the bash-validation PreToolUse hook from settings (session files cleared); `afk.json` and the orchestrator skill are kept
   - `--purge` — also delete `.claude/skills/agent-orchestrator/SKILL.md`, the copied runtime scripts (`afk-set-session-workflow.cjs`, `afk-render-orchestrator.cjs`, `bash-validation.sh`, `lib/afk-session.cjs`), **and** the user-authored config (`.claude/afk.json`) — everything the install pipeline produced. Use this only when the user wants AFK fully gone. If `afk.json` is tracked in git, the deletion will show up as a working-tree change to commit.

2. **Run the uninstaller** from the project root:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   Add `--purge` as a trailing argument if the user asked to fully remove it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}" --purge
   ```

   It prints a JSON summary (`removedAgentSetting`, `removedBashHook`, `removedSession`, `purged`, `keptConfig`).

3. **Report** to the user: confirm whether the bash-validation hook was removed from `settings.json`, whether session files were cleared, and (if `--purge`) which files were deleted. Without `--purge`, note that `afk.json` and the orchestrator skill were kept, so they can re-enable AFK any time by re-running `/afk-install` (or `/afk-sync` if the skill is still present). With `--purge`, note that the config is gone too — re-enabling means re-authoring it via `/afk-install`.

## Notes

- The plugin's hooks (`SubagentStart`, `PreToolUse`, `SessionEnd`) live in the plugin, not the project. They already no-op when `afk.json` is absent — uninstall does not (and cannot) edit the plugin's `hooks.json`.
