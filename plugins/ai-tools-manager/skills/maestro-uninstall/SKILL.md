---
name: maestro-uninstall
description: "Uninstalls the Maestro orchestrator for this project — removes the bash-validation PreToolUse hook from .claude/settings.json and deletes the ephemeral session files (maestro_session.json, maestro_session.log.jsonl, maestro_session_tasks.json). By default keeps maestro.json and the orchestrator skill. Pass --purge to also remove the installed orchestrator skill, runtime scripts, and the maestro.json config — everything the install pipeline produced; purge additionally prompts whether to delete the Maestro tasks from the task list. Use when the user wants to turn off Maestro, undo /maestro-install, or uninstall the subagents workflow."
---

# Maestro Uninstall

Remove the Maestro orchestrator that `/maestro-install` installed. This is the inverse of the installer. By default it is conservative: it removes the bash-validation hook and clears ephemeral session state — your config (`maestro.json`) and the orchestrator skill are kept.

The uninstaller script only touches **files** in `.claude/` — it never touches the actual tasks in the task list, because those live in Claude Code's task system, not on disk. The ephemeral `maestro_session_tasks.json` it deletes is only a per-session ledger of step labels, not your tasks. Deleting the real Maestro tasks is a separate, opt-in step handled in purge mode (step 3 below).

## Workflow

1. **Decide the scope.** Ask the user (or infer from their request):
   - default — remove the bash-validation PreToolUse hook from settings (session files cleared); `maestro.json` and the orchestrator skill are kept
   - `--purge` — also delete `.claude/skills/maestro/SKILL.md`, the copied runtime scripts (`maestro-set-session-workflow.cjs`, `maestro-render-orchestrator.cjs`, `bash-validation.sh`, `lib/maestro-session.cjs`), **and** the user-authored config (`.claude/maestro.json`) — everything the install pipeline produced. Use this only when the user wants Maestro fully gone. If `maestro.json` is tracked in git, the deletion will show up as a working-tree change to commit.

2. **Run the uninstaller** from the project root:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/maestro-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   Add `--purge` as a trailing argument if the user asked to fully remove it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/maestro-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}" --purge
   ```

   It prints a JSON summary (`removedAgentSetting`, `removedBashHook`, `removedSession`, `purged`, `keptConfig`).

3. **In `--purge` mode only — prompt about the Maestro tasks.** The script removes files but not the tasks in the task list. After the uninstaller runs, ask the user whether they also want to delete the Maestro tasks from the task list. If they decline, skip this step (the tasks stay). If they agree:
   - Call `TaskList` to enumerate the tasks.
   - Identify the Maestro-created ones. Use `TaskGet` to inspect candidates: a Maestro task carries `metadata.maestro_step`. If metadata is missing (older tasks, heuristic creation), fall back to matching tasks whose subject/description names a workflow agent instance or step, and confirm the specific list with the user before deleting.
   - Delete each confirmed task with `TaskUpdate` using `status: "deleted"`.
   - Do **not** delete tasks you're unsure about — when in doubt, show the user the list and let them choose. Never delete non-Maestro tasks.

   In default (non-purge) mode, skip this entirely — task deletion is purge-only.

4. **Report** to the user: confirm whether the bash-validation hook was removed from `settings.json`, whether session files were cleared, and (if `--purge`) which files were deleted and how many tasks (if any) were removed from the task list. Without `--purge`, note that `maestro.json` and the orchestrator skill were kept, so they can re-enable Maestro any time by re-running `/maestro-install` (or `/maestro-update` if the skill is still present). With `--purge`, note that the config is gone too — re-enabling means re-authoring it via `/maestro-install`.

## Notes

- The plugin's hooks (`SubagentStart`, `PreToolUse`, `SessionEnd`) live in the plugin, not the project. They already no-op when `maestro.json` is absent — uninstall does not (and cannot) edit the plugin's `hooks.json`.
