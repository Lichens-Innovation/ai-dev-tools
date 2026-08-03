---
name: maestro-uninstall
description: "Uninstalls the Maestro orchestrator for this project — removes every Maestro hook registered against .claude/scripts/ from .claude/settings.json and deletes the ephemeral session files (maestro_session.json, maestro_session.log.jsonl, maestro_session_tasks.json). By default keeps maestro.json and the orchestrator skill. Pass --purge to also remove the installed orchestrator skill, runtime scripts, and the maestro.json config — everything the install pipeline produced; purge additionally prompts whether to delete the Maestro tasks from the task list. Use when the user wants to turn off Maestro, undo /maestro-install, or uninstall the subagents workflow."
---

# Maestro Uninstall

Remove the Maestro orchestrator that `/maestro-install` installed. This is the inverse of the installer. By default it is conservative: it removes the Maestro hooks and clears ephemeral session state — your config (`maestro.json`) and the orchestrator skill are kept.

The uninstaller script only touches **files** in `.claude/` — it never touches the actual tasks in the task list, because those live in Claude Code's task system, not on disk. The ephemeral `maestro_session_tasks.json` it deletes is only a per-session ledger of step labels, not your tasks. Deleting the real Maestro tasks is a separate, opt-in step handled in purge mode (step 3 below).

## Workflow

1. **Decide the scope.** Ask the user (or infer from their request):
   - default — remove the Maestro hooks from settings (session files cleared); `maestro.json` and the orchestrator skill are kept
   - `--purge` — also delete `.claude/skills/maestro/SKILL.md`, the copied runtime scripts (the `maestro-*.cjs` hook and helper scripts, `bash-validation.sh`, `lib/*.cjs`, and the installed `templates/handoffs/` protocols), **and** the user-authored config (`.claude/maestro.json`) — everything the install pipeline produced. Use this only when the user wants Maestro fully gone. If `maestro.json` is tracked in git, the deletion will show up as a working-tree change to commit.

2. **Run the uninstaller** from the project root:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/maestro-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   Add `--purge` as a trailing argument if the user asked to fully remove it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/maestro-uninstall.js" "${CLAUDE_PROJECT_DIR:-.}" --purge
   ```

   It prints a JSON summary (`removedAgentSetting`, `removedHooks`, `removedSession`, `purged`, `keptConfig`).

3. **In `--purge` mode only — prompt about the Maestro tasks.** The script removes files but not the tasks in the task list. After the uninstaller runs, ask the user whether they also want to delete the Maestro tasks from the task list. If they decline, skip this step (the tasks stay). If they agree:
   - Call `TaskList` to enumerate the tasks.
   - Identify the Maestro-created ones. Use `TaskGet` to inspect candidates: a Maestro task carries `metadata.maestro_step`. If metadata is missing (older tasks, heuristic creation), fall back to matching tasks whose subject/description names a workflow agent instance or step, and confirm the specific list with the user before deleting.
   - Delete each confirmed task with `TaskUpdate` using `status: "deleted"`.
   - Do **not** delete tasks you're unsure about — when in doubt, show the user the list and let them choose. Never delete non-Maestro tasks.

   In default (non-purge) mode, skip this entirely — task deletion is purge-only.

4. **Report** to the user: confirm whether the Maestro hooks were removed from `settings.json`, whether session files were cleared, and (if `--purge`) which files were deleted and how many tasks (if any) were removed from the task list. Without `--purge`, note that `maestro.json` and the orchestrator skill were kept, so they can re-enable Maestro any time by re-running `/maestro-install` (or `/maestro-update` if the skill is still present). With `--purge`, note that the config is gone too — re-enabling means re-authoring it via `/maestro-install`.

## Notes

- **The desktop app does this without a session.** `apps/maestro`'s `/install` route has both
  levels: **Uninstall** (hooks + session files, keeps `maestro.json`) and **Delete everything**,
  which names every file in a confirmation before deleting it. That path is `uninstallRuntime()`
  in `@repo/maestro-core`, and it is the one to prefer — it removes files the manifest knows about
  *plus* anything an older release left in `.claude/scripts/`, and it refuses to run at all on a
  `settings.json` that doesn't parse instead of silently skipping the hook removal (which this
  script does). Step 3 below — deleting the Maestro tasks from the task list — is the only part
  that still needs a session, because those tasks live in Claude Code, not on disk.
- Two sources register Maestro's hooks. A project installed from the **desktop app** has them in its own `.claude/settings.json`, pointing at `$CLAUDE_PROJECT_DIR/.claude/scripts/` — those are what this script removes. The **plugin's** own `hooks.json` (`SubagentStart`, `PreToolUse`, `SessionEnd`, …) lives in the plugin and fires in every project; uninstall does not (and cannot) edit it, and it already no-ops when `maestro.json` is absent.
