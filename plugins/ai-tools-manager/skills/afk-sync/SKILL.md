---
name: afk-sync
description: "Re-renders the AFK orchestrator agent (.claude/agents/afk.md) from .claude/afk.json — refreshes the main-session skills (frontmatter) and the AFK:HANDOFFS workflow table. Use after hand-editing afk.json or afk.yaml, or when the orchestrator's handoff table looks out of date. Run /agents-framework-kickstarter instead if you want to edit the config visually."
---

# AFK Sync

Regenerate the managed regions of the project's AFK orchestrator from the current `.claude/afk.json`. This is the manual counterpart to the automatic render that runs when you save the `/agents-framework-kickstarter` form.

## Workflow

1. **Run the renderer** from the project root:

   ```bash
   node "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/afk-render-orchestrator.js"
   ```

   This rewrites two regions of `.claude/agents/afk.md`:
   - the frontmatter `skills:` array, from `main_session_loaded_skills`
   - the `<!-- AFK:HANDOFFS -->` table, from each workflow's derived success path

   Everything else in `afk.md` (your custom orchestration instructions) is preserved.

2. **If the script reports `afk.md not found`**, the orchestrator hasn't been installed yet. Run `/agents-framework-kickstarter` and save once to install it, then re-run this skill.

3. **Report** the result to the user: confirm the file was re-rendered, and summarise the current main-session skills and the workflow → success-path rows now in the table.

## Notes

- The renderer is copied into `.claude/scripts/` by `/agents-framework-kickstarter` at install time, alongside `afk-set-workflow.js` and `lib/afk-session.js`. If it is missing, re-run the kickstarter form to reinstall the runtime scripts.
- `afk.json` is the source of truth. The `SubagentStart` hook reads it directly at runtime, so subagent skill injection is always current even between `/afk-sync` runs — only the orchestrator's own frontmatter/table need this manual refresh.
