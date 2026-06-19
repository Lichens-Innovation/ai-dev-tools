---
name: afk-install
description: "Installs the AFK orchestrator into this project, then opens the visual editor to author the config. Detects the implementation agent(s) from the repo, scaffolds the afk orchestrator agent + runtime scripts + settings (agent: afk, bash-validation hook) + gitignore, then hands off to the /afk skill to fill the canvas, write afk.json/afk.yaml, render the orchestrator, and place rules. Use when the user runs /afk-install, or asks to set up / scaffold / install the AFK subagents workflow for this project. To re-edit an already-installed project, use /afk instead."
---

# AFK Install

One-time setup of AFK for a project: lay down the orchestrator scaffolding, then open the visual editor to author the config. The heavy lifting of the config itself (form → `afk.json`/`afk.yaml` → render → rules) is delegated to the **`/afk`** skill, so this skill only does the parts `/afk` can't: detecting the project's implementation agent(s) and scaffolding the orchestrator the editor needs.

```
afk-install:  analyze repo → scaffold orchestrator → run /afk (form + write + render + rules) → report
                                                       └── /afk needs afk.md to exist; the scaffold step creates it
```

## User's intention

$ARGUMENTS

## Workflow

1. **Analyze the repository to pick the implementation agent(s).** Before opening the form, inspect the project to decide which bundled agent(s) build the application code in the seeded workflows' happy path. Read `package.json` (plus framework configs and directory layout — `src/components`, `src/routes`, `server/`, `api/`, `requirements.txt`, `go.mod`, `Cargo.toml`, etc.) and classify:
   - **Backend** (APIs, services, DB access, no UI framework) → `backend`
   - **Frontend** (React/Vue/Svelte/Angular/Next/etc., UI-focused) → `frontend`
   - **Fullstack** (both a UI framework *and* server/API code) → `backend,frontend` — the happy path's implementation step becomes `@backend → @frontend`
   - **Non-web** (CLI, library, data pipeline, mobile, …) → there is no obvious bundled implementation agent. **Ask the user** which agent(s) they use to implement code. If none is suitable, suggest they run `/create-subagent` to make one, then re-run `/afk-install`.

   The result is a comma-separated `implAgents` list (e.g. `backend`, `frontend`, or `backend,frontend`). This only sets the *starting* default on the canvas — the user can still adjust it before submitting.

2. **Scaffold the orchestrator.** Run the installer:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-install.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   This is idempotent and:
   - copies the `afk` orchestrator agent to `<projectPath>/.claude/agents/afk.md` (only if absent — your edits are preserved on re-runs),
   - copies the runtime scripts (`afk-set-session-workflow.js`, `afk-render-orchestrator.js`, `bash-validation.sh`, `lib/afk-session.js`) into `<projectPath>/.claude/scripts/`,
   - merges `"agent": "afk"` and the `bash-validation.sh` PreToolUse Bash hook into `<projectPath>/.claude/settings.json` (preserving other keys), so new sessions adopt the orchestrator and `.env` reads are blocked,
   - ensures `<projectPath>/.claude/.gitignore` ignores the ephemeral session files (`afk_session.json`, `afk_session.log.jsonl`).

   It prints a JSON summary (`installedAgent`, `setAgentSetting`, `setBashHook`, `wroteGitignore`). It does **not** render `afk.md`'s managed regions — that needs `afk.json`, which the next step produces.

   Note the `installedAgent` flag: `true` means a fresh `afk.md` was written; `false` means one was already present and was left untouched.

3. **Author the config — run the `/afk` skill.** Now that `afk.md` exists, invoke the **`afk`** skill, passing the detected implementation agents as its arguments (so the canvas opens already seeded for this project):

   > Run the `afk` skill with arguments: `<implAgents>` (e.g. `backend,frontend`).

   The `afk` skill opens the visual editor, writes `afk.json` + `afk.yaml`, re-renders the orchestrator from the new config, and applies rule placements — and reports those details. If the user cancels the form, `/afk` stops and reports the reason; nothing further to do here.

4. **Confirm the install.** After `/afk` returns, add a short scaffold-level summary on top of what it already reported:
   - whether the orchestrator was newly installed (`installedAgent`) and whether `agent: afk` / the bash-validation hook were added to `settings.json`,
   - that the orchestrator only takes effect in **new sessions** (the `agent: afk` setting is read at session start),
   - that they can re-open the editor any time with `/afk`, re-render after a hand-edit with `/afk-sync`, and turn AFK off with `/afk-uninstall`.

## Hook contract (SubagentStart)

`afk-inject-agent-context.js` runs on `SubagentStart` for **every** subagent (the hook matcher is `.*`), so custom user/project/plugin agents mapped on the canvas get injected too, not just the bundled workers. It receives `agent_type` and `cwd` from stdin, then:

1. Reads `<cwd>/.claude/afk_session.json` to find the active workflow name (set by `afk-set-session-workflow.js`).
2. Reads `<cwd>/.claude/afk.json` (requires `version: 3`).
3. Finds workflow nodes whose resolved instance's `agent === agent_type`.
4. Emits `hookSpecificOutput { hookEventName: "SubagentStart", additionalContext }` listing the instance's skills and condition-edge labels. When a condition edge exists, the subagent is told to end its final message with a `HANDOFF: <label>` line (or `HANDOFF: success`) so the orchestrator can route deterministically.

If `afk.json` is absent, not v3, or the agent type is unmapped (no matching instance in any workflow), the hook exits silently.

If the active workflow can't be resolved — the recorded name matches no workflow, or none is set while the project has more than one workflow — the hook still injects (unioned across all workflows) but **prepends a `⚠️ AFK warning`** to the context telling the orchestrator to run `afk-set-session-workflow.js` first, since the unioned skills may be wrong.

Known limitation: if two instances of the same agent appear in one workflow, the hook can only key off `agent_type` and merges (unions) both instances' skills and conditions. Prefer one instance per agent type per workflow.

## Notes

- This skill is the **scaffold + delegate** entry point; the config materialisation (form → `afk.json`/`afk.yaml` → render → rules) lives entirely in the `/afk` skill so there is one place that owns it.
- Re-running `/afk-install` is safe: scaffolding is idempotent, and a present `afk.md` is never overwritten. To just re-edit config on an installed project, prefer `/afk` (it skips the scaffold step).
- Instances are project-scoped and may appear in multiple workflows; the hook uses the active workflow from `afk_session.json`. An unplaced instance is harmless.
