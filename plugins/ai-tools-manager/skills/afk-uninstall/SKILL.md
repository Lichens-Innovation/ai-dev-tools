---
name: afk-uninstall
description: "Disables the AFK orchestrator for this project — removes the `agent: afk` setting from .claude/settings.json (so new sessions stop adopting the orchestrator) and deletes the ephemeral session files. By default keeps afk.json / afk.yaml. Pass --purge to also remove the installed orchestrator agent, runtime scripts, and the afk.json / afk.yaml config — everything the install pipeline produced. Use when the user wants to turn off AFK, stop the orchestrator, undo /afk-install, or uninstall the subagents workflow."
---

# AFK Uninstall

Turn off the AFK orchestrator that `/afk-install` installed. This is the inverse of the installer. By default it is conservative: it only stops new sessions from running as the orchestrator and clears ephemeral session state — your config (`afk.json` / `afk.yaml`) and any hand-edits to `afk.md` are kept.

## Workflow

1. **Decide the scope.** Ask the user (or infer from their request):
   - default — just disable the orchestrator (`agent: afk` and the bash-validation PreToolUse hook removed, session files cleared); `afk.json` / `afk.yaml` are kept
   - `--purge` — also delete `.claude/agents/afk.md`, the copied runtime scripts (`afk-set-session-workflow.js`, `afk-render-orchestrator.js`, `bash-validation.sh`, `lib/afk-session.js`), **and** the user-authored config (`.claude/afk.json`, `afk.yaml`) — everything the install pipeline produced. Use this only when the user wants AFK fully gone. If `afk.json` is tracked in git, the deletion will show up as a working-tree change to commit.

2. **Run the uninstaller** from the project root:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   Add `--purge` as a trailing argument if the user asked to fully remove it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}" --purge
   ```

   It prints a JSON summary (`removedAgentSetting`, `removedBashHook`, `removedSession`, `purged`, `keptConfig`).

3. **Report** to the user: confirm whether `agent: afk` and the bash-validation hook were removed from `settings.json`, whether session files were cleared, and (if `--purge`) which files were deleted. Without `--purge`, note that `afk.json` / `afk.yaml` were kept, so they can re-enable AFK any time by re-running `/afk-install` (or `/afk-sync` if the orchestrator is still present). With `--purge`, note that the config is gone too — re-enabling means re-authoring it via `/afk-install`.

## Notes

- The orchestrator only takes effect on **new** sessions. The `agent: afk` change applies the next time a session starts in this project; the current session is unaffected.
- The plugin's hooks (`SubagentStart`, `PreToolUse`, `SessionEnd`) live in the plugin, not the project. They already no-op when `afk.json` is absent, and are otherwise harmless once `agent: afk` is removed — uninstall does not (and cannot) edit the plugin's `hooks.json`.
