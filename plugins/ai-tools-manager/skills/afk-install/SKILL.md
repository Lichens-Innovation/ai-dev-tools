---
name: afk-install
description: "Installs the AFK orchestrator into this project, then opens the visual editor to author the config. Detects the implementation agent(s) from the repo, scaffolds the afk orchestrator agent + runtime scripts + settings (agent: afk, bash-validation hook) + gitignore, then hands off to the /afk skill to fill the canvas, write afk.json, render the orchestrator, and place rules. Use when the user runs /afk-install, or asks to set up / scaffold / install the AFK subagents workflow for this project. To re-edit an already-installed project, use /afk instead."
---

# AFK Install

One-time setup of AFK for a project: lay down the orchestrator scaffolding, then open the visual editor to author the config. The heavy lifting of the config itself (form → `afk.json` → render → rules) is delegated to the **`/afk`** skill, so this skill only does the parts `/afk` can't: detecting the project's implementation agent(s) and scaffolding the orchestrator the editor needs.

```
afk-install:  analyze repo → offer local skills → scaffold orchestrator → run /afk (form + write + render + rules) → report
              (impl agents)   (best-fit + consent)                         └── /afk needs afk.md to exist; the scaffold step creates it
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

2. **Offer to attach the repo's local skills to the seeded agents.** This pre-populates the canvas so the user doesn't have to hunt for relevant skills. **Skip this step entirely** if `${CLAUDE_PROJECT_DIR:-.}/.claude/afk.json` already exists — that's a re-install, and the canvas already owns the user's skill assignments (the seed only applies on a fresh install).

   On a fresh install:
   - **Discover** the project-local skills: each subdirectory of `${CLAUDE_PROJECT_DIR:-.}/.claude/skills/` that contains a `SKILL.md` is one skill. A skill's **id is its directory name**, unless its `SKILL.md` has a frontmatter `name:` field, in which case that wins — this matches exactly how the canvas lists them (`name = frontmatter.name || directory`). **Many project skills are plain-Markdown docs with no YAML frontmatter at all — that is normal; do not skip them.** For relevance, read a short description from the frontmatter `description:` if present, otherwise from the SKILL.md's first heading / first sentence. Ignore user (`~/.claude`) and plugin skills — only the repo's own skills are in scope.

     List the directories with a command that tolerates missing frontmatter (do **not** pipe through `grep` for `name:`/`description:` — it exits non-zero and aborts the moment a skill has no frontmatter, which silently drops every doc-style skill). For example list the skill dirs, then `Read` each `SKILL.md` you need a description for:

     ```bash
     ls -1 "${CLAUDE_PROJECT_DIR:-.}/.claude/skills" 2>/dev/null
     ```

   - **Best-fit map** each skill to the single seeded agent it most helps, choosing among the seeded agents only: the detected `implAgents` plus `test`, `reviewer`, `refactor`, `scribe`. **Drop** any skill that isn't clearly relevant to one of them (don't force a match). Example: a `react`/`styling`/`gantt-render` skill → `frontend`; a `react-testing-library` skill → `test`; a `changelog` skill → `scribe`.
   - **Confirm with the user.** First print the proposed mapping as a plain written list grouped by agent, one line per skill with a short why, e.g.:

     ```
     @frontend ← react, styling, gantt-render, shift-logic, workorder-store
     @test     ← react-testing-library
     ```

     Then ask a **single `AskUserQuestion`** for consent (do **not** put individual skills as the options — `AskUserQuestion` requires 2–4 options per question, so a per-skill checklist breaks the moment an agent has 1 or 5+ skills). Use coarse options like: `Attach all (Recommended)`, `Let me drop some`, `Skip — I'll assign on the canvas`. If the user picks "drop some", let them reply in plain text with the skill ids (or skill→agent pairs) to remove, and drop those. If **no** project skills exist or none are relevant, skip the question silently. The canvas remains the fine-grained editor — the user can always add/move/remove skill assignments there before submitting, so this prompt only needs coarse consent.
   - **Assemble the skill map**: a JSON object of `{ "<agent>": ["<skillId>", …] }` from the confirmed mapping, omitting agents with no skills. Example: `{"frontend":["react","styling"],"test":["react-testing-library"]}`. If empty, there's nothing to pass. Each `skillId` is the skill's canonical id from the discover step (frontmatter `name` if present, else the directory name) so it lines up with what the canvas lists.

3. **Scaffold the orchestrator.** Run the installer:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-install.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   This is idempotent and:
   - copies the `afk` orchestrator agent to `<projectPath>/.claude/agents/afk.md` (only if absent — your edits are preserved on re-runs),
   - copies the runtime scripts (`afk-set-session-workflow.cjs`, `afk-render-orchestrator.cjs`, `bash-validation.sh`, `lib/afk-session.cjs`) into `<projectPath>/.claude/scripts/`,
   - merges `"agent": "afk"` and the `bash-validation.sh` PreToolUse Bash hook into `<projectPath>/.claude/settings.json` (preserving other keys), so new sessions adopt the orchestrator and `.env` reads are blocked,
   - ensures `<projectPath>/.claude/.gitignore` ignores the ephemeral session files (`afk_session.json`, `afk_session.log.jsonl`),
   - adds an `# AFK` section to the repo-root `.gitignore` (`git rev-parse --show-toplevel`) ignoring every nested session file across the repo / monorepo via `**/.claude/afk_session.json` and `**/.claude/afk_session.log.jsonl`.

   It prints a JSON summary (`installedAgent`, `setAgentSetting`, `setBashHook`, `wroteGitignore`, `wroteRepoGitignore`). It does **not** render `afk.md`'s managed regions — that needs `afk.json`, which the next step produces.

   Note the `installedAgent` flag: `true` means a fresh `afk.md` was written; `false` means one was already present and was left untouched.

4. **Author the config — run the `/afk` skill.** Now that `afk.md` exists, invoke the **`afk`** skill, passing the detected implementation agents (and, if you assembled one in step 2, the skill map) as its arguments so the canvas opens already seeded for this project:

   > Run the `afk` skill with arguments: `<implAgents>` (e.g. `backend,frontend`), and the skill map `<json>` (e.g. `{"frontend":["react"],"test":["component-test"]}`) when non-empty.

   `/afk` turns these into `AFK_IMPL_AGENTS` / `AFK_SKILL_MAP` on the launcher (see its SKILL.md). It opens the visual editor, writes `afk.json`, re-renders the orchestrator from the new config, and applies rule placements — and reports those details. If the user cancels the form, `/afk` stops and reports the reason; nothing further to do here.

5. **Confirm the install.** After `/afk` returns, add a short scaffold-level summary on top of what it already reported:
   - whether the orchestrator was newly installed (`installedAgent`) and whether `agent: afk` / the bash-validation hook were added to `settings.json`,
   - that the orchestrator only takes effect in **new sessions** (the `agent: afk` setting is read at session start),
   - that they can re-open the editor any time with `/afk`, re-render after a hand-edit with `/afk-sync`, and turn AFK off with `/afk-uninstall`.

## Hook contract (SubagentStart)

`afk-inject-agent-context.js` runs on `SubagentStart` for **every** subagent (the hook matcher is `.*`), so custom user/project/plugin agents mapped on the canvas get injected too, not just the bundled workers. It receives `agent_type` and `cwd` from stdin, then:

1. Reads `<cwd>/.claude/afk_session.json` to find the active workflow name (set by `afk-set-session-workflow.cjs`).
2. Reads `<cwd>/.claude/afk.json` (requires `version: 3`).
3. Finds workflow nodes whose resolved instance's `agent === agent_type`.
4. Emits `hookSpecificOutput { hookEventName: "SubagentStart", additionalContext }` listing the instance's skills in two blocks — `loaded_skills` (auto-load with the `Skill` tool before working) and `referenced_skills` (available; load only if the task involves the logic that skill describes) — plus the condition-edge labels. When a condition edge exists, the subagent is told to end its final message with a `HANDOFF: <label>` line (or `HANDOFF: success`) so the orchestrator can route deterministically.

If `afk.json` is absent, not v3, or the agent type is unmapped (no matching instance in any workflow), the hook exits silently.

If the active workflow can't be resolved — the recorded name matches no workflow, or none is set while the project has more than one workflow — the hook still injects (unioned across all workflows) but **prepends a `⚠️ AFK warning`** to the context telling the orchestrator to run `afk-set-session-workflow.cjs` first, since the unioned skills may be wrong.

Known limitation: if two instances of the same agent appear in one workflow, the hook can only key off `agent_type` and merges (unions) both instances' skills and conditions (a skill that is `loaded` in either instance wins over being merely `referenced`). Prefer one instance per agent type per workflow.

## Notes

- This skill is the **scaffold + delegate** entry point; the config materialisation (form → `afk.json` → render → rules) lives entirely in the `/afk` skill so there is one place that owns it.
- Re-running `/afk-install` is safe: scaffolding is idempotent, and a present `afk.md` is never overwritten. To just re-edit config on an installed project, prefer `/afk` (it skips the scaffold step).
- Instances are project-scoped and may appear in multiple workflows; the hook uses the active workflow from `afk_session.json`. An unplaced instance is harmless.
