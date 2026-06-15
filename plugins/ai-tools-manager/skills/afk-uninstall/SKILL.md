---
name: afk-uninstall
description: "Disables the AFK orchestrator for this project — removes the `agent: afk` setting from .claude/settings.json (so new sessions stop adopting the orchestrator) and deletes the ephemeral session files. Pass --purge to also remove the installed orchestrator agent and runtime scripts. Keeps afk.json / afk.yaml. Use when the user wants to turn off AFK, stop the orchestrator, undo /agents-framework-kickstarter, or uninstall the subagents workflow."
---

# AFK Uninstall

Turn off the AFK orchestrator that `/agents-framework-kickstarter` installed. This is the inverse of the installer. By default it is conservative: it only stops new sessions from running as the orchestrator and clears ephemeral session state — your config (`afk.json` / `afk.yaml`) and any hand-edits to `afk.md` are kept.

## Workflow

1. **Decide the scope.** Ask the user (or infer from their request):
   - default — just disable the orchestrator (`agent: afk` removed, session files cleared)
   - `--purge` — also delete `.claude/agents/afk.md` and the copied runtime scripts (`afk-set-workflow.js`, `afk-render-orchestrator.js`, `lib/afk-session.js`). Use this only when the user wants AFK fully gone.

2. **Run the uninstaller** from the project root:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   Add `--purge` as a trailing argument if the user asked to fully remove it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}" --purge
   ```

   It prints a JSON summary (`removedAgentSetting`, `removedSession`, `purged`, `keptConfig`).

3. **Report** to the user: confirm whether `agent: afk` was removed from `settings.json`, whether session files were cleared, and (if `--purge`) which files were deleted. Note that `afk.json` / `afk.yaml` were kept, so they can re-enable AFK any time by re-running `/agents-framework-kickstarter` (or `/afk-sync` if the orchestrator is still present).

## Notes

- The orchestrator only takes effect on **new** sessions. The `agent: afk` change applies the next time a session starts in this project; the current session is unaffected.
- The plugin's hooks (`SubagentStart`, `PreToolUse`, `SessionEnd`) live in the plugin, not the project. They already no-op when `afk.json` is absent, and are otherwise harmless once `agent: afk` is removed — uninstall does not (and cannot) edit the plugin's `hooks.json`.
