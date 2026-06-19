---
name: agents-framework-kickstarter
description: "Scaffolds an afk.yaml at the project root from a web form, then installs the AFK orchestrator. The user picks bundled subagents, maps project-local skills via workflow instances on a visual canvas, and assigns rules to directory paths. The plugin's SubagentStart hook reads .claude/afk.json (v3) to inject each instance's configured skills and condition-edge handoff rules at the start of every matching subagent. Use when the user runs /agents-framework-kickstarter, or asks to scaffold afk.yaml, set up the subagents workflow for this project, or configure agent↔skill mappings."
---

# Agents Framework Kickstarter

Scaffold the project's AFK config and install the orchestrator. The web form writes the source-of-truth `.claude/afk.json`; your job is to materialise the human-readable `afk.yaml`, persist the config on the host, and run the installer that wires up the `afk` orchestrator agent.

The form lives at two routes:
- `/workflows` — configure agents, skills, workflow instances, and workflow graphs
- `/rules` — assign rules to the project root and/or specific directory paths

## User's intention

$ARGUMENTS

## Workflow

1. **Analyze the repository to pick the implementation agent(s).** Before launching the form, inspect the project to decide which bundled agent(s) build the application code in the seeded workflows' happy path. Read `package.json` (plus framework configs and directory layout — `src/components`, `src/routes`, `server/`, `api/`, `requirements.txt`, `go.mod`, `Cargo.toml`, etc.) and classify:
   - **Backend** (APIs, services, DB access, no UI framework) → `backend`
   - **Frontend** (React/Vue/Svelte/Angular/Next/etc., UI-focused) → `frontend`
   - **Fullstack** (both a UI framework *and* server/API code) → `backend,frontend` — the happy path's implementation step becomes `@backend → @frontend`
   - **Non-web** (CLI, library, data pipeline, mobile, …) → there is no obvious bundled implementation agent. **Ask the user** which agent(s) they use to implement code. If none is suitable, suggest they run `/create-subagent` to make one, then re-run `/agents-framework-kickstarter`.

   The result is a comma-separated `implAgents` list (e.g. `backend`, `frontend`, or `backend,frontend`). This only sets the *starting* default on the canvas — the user can still adjust it before submitting.

2. **Launch the form and read the payload.** Run the form launcher, passing the detected agents so the canvas opens already seeded for this project. Run it in the **background** — the user fills the form interactively, which can take a while:

   ```bash
   AFK_IMPL_AGENTS="<implAgents>" bash "${CLAUDE_SKILL_DIR}/../../scripts/gather-info.sh" agents-framework-kickstarter
   ```

   `gather-info.sh` folds `implAgents` into the pre-computed marketplace data the container reads, builds the image, opens the browser, and blocks until the user submits. When it completes, **its stdout is the form result** — a string containing two things:
   - a line beginning `AFK v3 config data:` followed by a JSON object `{ "projectPath": "<absolute cwd>", "config": { …AfkConfigV3… } }`
   - a fenced ```` ```yaml ```` block labelled "Canonical afk.yaml to write verbatim" — the exact text to write to `afk.yaml`.

   If the user cancels, the result is a `{ "decision": "block", "reason": … }` payload — stop and report the reason instead of writing anything.

   The v3 `config` shape:

   ```json
   {
     "version": 3,
     "agents_available": ["backend", "test"],
     "skills_available": ["confidence-check", "expressjs"],
     "main_session_loaded_skills": ["confidence-check"],
     "workflow_instances": [
       { "name": "backend_default", "agent": "backend", "skills": ["confidence-check"] },
       { "name": "test_default",    "agent": "test",    "skills": [] }
     ],
     "workflows": [
       {
         "name": "Backend update",
         "nodes": [
           { "id": "backend_default", "type": "agent", "instance": "backend_default" },
           { "id": "human_review-1",  "type": "human_review" }
         ],
         "edges": [
           { "from": "main-session",    "to": "backend_default", "kind": "success" },
           { "from": "backend_default", "to": "human_review-1",  "kind": "success" },
           { "from": "backend_default", "to": "backend_default", "kind": "condition", "label": "needs revision" }
         ]
       }
     ],
     "rules": [
       { "id": "python", "scope": "project",            "source": "project" },
       { "id": "sql",    "paths": ["src/backend/**"],    "source": "project" },
       { "id": "rule-security", "paths": ["src/api/**"], "source": "vibe-rules" }
     ]
   }
   ```

   Notes on the model:
   - `skills_available` and `main_session_loaded_skills` are plain string arrays of skill ids.
   - `workflow_instances` is the project-scoped array of named `{ name, agent, skills[] }` records. Nodes reference an instance by name; an agent node's `id` equals its instance name.
   - `main-session` is the implicit entry point — it appears only in `edges` (`from: "main-session"`), never in `nodes`.
   - Node types are `agent` and `human_review` only.
   - `success_path` is **derived** by the UI (and rendered into `afk.yaml` for humans); it is never stored in `afk.json`.
   - each `rules` entry is **one assignment of a rule to one location** (`scope: "project"` for the root, or `paths: ["<dir>/**"]` for a directory) with a `source` of `"project"` (on-disk rule file, moved into place) or `"vibe-rules"` (installed via `vibe-rules load`). A rule id appears at most once. Step 4 applies these to the filesystem.

3. **Write the two config files** under `projectPath`:
   - `<projectPath>/.claude/afk.json` — the `config` object serialized with `JSON.stringify(config, null, 2)`: 2-space indent and **no trailing newline**. This must be byte-identical to what the app writes, so a double-write in local dev produces no git diff. This is the source of truth the hooks read. Create `.claude/` if needed.
   - `<projectPath>/afk.yaml` — **the verbatim YAML block** from the payload. Do not reformat or regenerate it; write it exactly as given.

   (In local dev the app already wrote both; writing them here makes the skill correct under Docker too, where the container can't reach the host project path.)

4. **Install / refresh the orchestrator.** Run:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-install-orchestrator.js" "<projectPath>"
   ```

   This is idempotent and:
   - copies the `afk` orchestrator agent to `<projectPath>/.claude/agents/afk.md` (only if absent — your edits are preserved on re-runs),
   - copies the runtime scripts (`afk-set-workflow.js`, `afk-render-orchestrator.js`, `lib/afk-session.js`) into `<projectPath>/.claude/scripts/`,
   - merges `"agent": "afk"` into `<projectPath>/.claude/settings.json` (preserving other keys), so new sessions adopt the orchestrator,
   - ensures `<projectPath>/.claude/.gitignore` ignores the ephemeral session files (`afk_session.json`, `afk_session.log.jsonl`),
   - renders the orchestrator's frontmatter `skills:` (from `main_session_loaded_skills`) and its `AFK:HANDOFFS` workflow table (from the workflows' success paths).

   The script prints a JSON summary (`installedAgent`, `setAgentSetting`, `wroteGitignore`, `rendered`).

5. **Apply rule placements.** Run:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-apply-rules.js" "<projectPath>"
   ```

   This reads the `rules` slice of `afk.json` and, for each assignment, puts the rule file where it was assigned:
   - `source: "project"` → **moves** the rule's `.claude/rules/<file>.md` into the assigned directory's `.claude/rules/` (no-op if it's already there, e.g. assigned to the project root where it already lives).
   - `source: "vibe-rules"` → installs it with `vibe-rules load <id> claude-code -t <dir>/.claude/rules/<id>.md` (appends a tagged block; skipped if already present so re-runs don't duplicate).
   - Removed / unassigned rules are **left untouched** — the script never deletes files.

   It is idempotent and prints a JSON summary (`moved`, `installed`, `unchanged`, `skipped`, `missing`, `errors`). `missing` lists project rules whose file wasn't found; `errors` includes any failed `vibe-rules load` (e.g. vibe-rules not installed) — surface these to the user but don't treat them as fatal.

6. **Report to the user.** Confirm the files written and summarise:
   - counts of agents, instances, workflows, and rules saved,
   - which rule files were moved or installed (from the apply-rules summary), and any `missing`/`errors`,
   - whether the orchestrator was newly installed and whether `agent: afk` was set in `settings.json`,
   - that the `SubagentStart` hook now injects each instance's skills + condition-edge handoff rules automatically,
   - that they can re-render the orchestrator any time with `/afk-sync` after hand-editing `afk.json`, and
   - that `/afk-uninstall` disables the orchestrator (removes `agent: afk`) if they want to turn AFK off later.

## Hook contract (SubagentStart)

`inject-agent-skills.js` runs on `SubagentStart` for **every** subagent (the hook matcher is `.*`), so custom user/project/plugin agents mapped on the canvas get injected too, not just the bundled workers. It receives `agent_type` and `cwd` from stdin, then:

1. Reads `<cwd>/.claude/afk_session.json` to find the active workflow name (set by `afk-set-workflow.js`).
2. Reads `<cwd>/.claude/afk.json` (requires `version: 3`).
3. Finds workflow nodes whose resolved instance's `agent === agent_type`.
4. Emits `hookSpecificOutput { hookEventName: "SubagentStart", additionalContext }` listing the instance's skills and condition-edge labels. When a condition edge exists, the subagent is told to end its final message with a `HANDOFF: <label>` line (or `HANDOFF: success`) so the orchestrator can route deterministically.

If `afk.json` is absent, not v3, or the agent type is unmapped (no matching instance in any workflow), the hook exits silently.

If the active workflow can't be resolved — the recorded name matches no workflow, or none is set while the project has more than one workflow — the hook still injects (unioned across all workflows) but **prepends a `⚠️ AFK warning`** to the context telling the orchestrator to run `afk-set-workflow.js` first, since the unioned skills may be wrong.

Known limitation: if two instances of the same agent appear in one workflow, the hook can only key off `agent_type` and merges (unions) both instances' skills and conditions. Prefer one instance per agent type per workflow.

## Notes

- The bundled subagents live at `plugins/ai-tools-manager/agents/`. Their frontmatter has no `skills:` array — that list comes from `afk.json` at runtime via the hook. (The `afk` **orchestrator** is the exception: its frontmatter `skills:` is materialised from `main_session_loaded_skills` because it runs as the main session, not as a SubagentStart-hooked worker.)
- Skills referenced in instance `skills` arrays must exist as project skills (`<projectPath>/.claude/skills/<id>/SKILL.md`).
- Instances are project-scoped and may appear in multiple workflows; the hook uses the active workflow from `afk_session.json`. An unplaced instance is harmless.
