---
name: afk
description: "Opens the AFK visual editor (web form) for an already-installed project, then materialises the edited config: writes .claude/afk.json + afk.yaml, re-renders the orchestrator agent, and applies rule placements. Use when the user runs /afk, or asks to edit the AFK workflow/agents/skills/rules visually, open the AFK canvas, or change agent↔skill mappings. Requires AFK to already be installed — if it is not, this skill stops and points the user at /afk-install."
---

# AFK (edit + sync)

Open the AFK visual editor for this project and push the result to the filesystem. This is the everyday "edit my AFK config" path: the form writes the source-of-truth `.claude/afk.json`; your job is to persist it, re-render the orchestrator from it, and apply any rule changes.

The form lives at two routes:
- `/workflows` — configure agents, skills, workflow instances, and workflow graphs
- `/rules` — assign rules to the project root and/or specific directory paths

## User's intention

$ARGUMENTS

## Workflow

0. **Precondition — AFK must already be installed.** Check that the orchestrator agent exists:

   ```bash
   test -f "${CLAUDE_PROJECT_DIR:-.}/.claude/agents/afk.md" && echo present || echo missing
   ```

   If it prints `missing`, **stop without launching the form**. The orchestrator hasn't been installed, so editing config now would leave an unwired `afk.json`. Tell the user to run **`/afk-install`** first (it scaffolds the orchestrator and then opens this same editor), then stop.

1. **Launch the form and read the payload.** Run the form launcher in the **background** — the user fills the form interactively, which can take a while:

   ```bash
   bash "${CLAUDE_SKILL_DIR}/../../scripts/launch-ai-tools-manager-app.sh" agents-framework-kickstarter
   ```

   If `$ARGUMENTS` contains a comma-separated list of implementation agents to seed the canvas (passed by `/afk-install` on a fresh install — e.g. `backend`, `frontend`, `backend,frontend`), prefix the command with `AFK_IMPL_AGENTS="<list>"`. On a standalone `/afk` run leave it unset; the canvas pre-populates from the existing `afk.json`.

   `/afk-install` may also pass a **skill map** — best-fit project-skill→agent assignments the user confirmed at install time. When present in `$ARGUMENTS`, also prefix the command with `AFK_SKILL_MAP='<json>'` (a JSON object like `{"frontend":["react"],"test":["component-test"]}`). It seeds the matching seeded instances' `skills[]` so the canvas opens pre-populated. Only meaningful on a fresh install (no `afk.json`); leave it unset on a standalone `/afk` run. Example combined prefix:

   ```bash
   AFK_IMPL_AGENTS="frontend" AFK_SKILL_MAP='{"frontend":["react"],"test":["component-test"]}' \
     bash "${CLAUDE_SKILL_DIR}/../../scripts/launch-ai-tools-manager-app.sh" agents-framework-kickstarter
   ```

   `launch-ai-tools-manager-app.sh` builds the image, opens the browser, and blocks until the user submits. When it completes, **its stdout is the form result** — a string containing two things:
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
   - Node types are `agent`, `human_review`, and `skill`. A `skill` node carries a `skill` id (the skill-node analog of an agent node's `instance`) and renders in the success path as `/<skill>`; the orchestrator runs it inline via the `Skill` tool rather than dispatching a subagent.
   - `success_path` is **derived** by the UI (and rendered into `afk.yaml` for humans); it is never stored in `afk.json`.
   - each `rules` entry is **one assignment of a rule to one location** (`scope: "project"` for the root, or `paths: ["<dir>/**"]` for a directory) with a `source` of `"project"` (on-disk rule file, moved into place) or `"vibe-rules"` (installed via `vibe-rules load`). A rule id appears at most once. Step 4 applies these to the filesystem.

2. **Write the two config files** under `projectPath`:
   - `<projectPath>/.claude/afk.json` — the `config` object serialized with `JSON.stringify(config, null, 2)`: 2-space indent and **no trailing newline**. This must be byte-identical to what the app writes, so a double-write in local dev produces no git diff. This is the source of truth the hooks read. Create `.claude/` if needed.
   - `<projectPath>/afk.yaml` — **the verbatim YAML block** from the payload. Do not reformat or regenerate it; write it exactly as given.

   (In local dev the app already wrote both; writing them here makes the skill correct under Docker too, where the container can't reach the host project path.)

3. **Re-render the orchestrator** from the new `afk.json`:

   ```bash
   node "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/afk-render-orchestrator.js" "<projectPath>"
   ```

   This rewrites the managed regions of `<projectPath>/.claude/agents/afk.md` — the frontmatter `skills:` array (from `main_session_loaded_skills`) and the `<!-- AFK:HANDOFFS -->` table (from each workflow's derived success path). Everything else in `afk.md` (custom orchestration prose) is preserved. This is the same renderer `/afk-sync` runs. If it reports `afk.md not found`, the precondition in Step 0 was bypassed — stop and tell the user to run `/afk-install`.

4. **Apply rule placements** from the new config:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-apply-rules.js" "<projectPath>"
   ```

   This reads the `rules` slice of `afk.json` and, for each assignment, puts the rule file where it was assigned:
   - `source: "project"` → **moves** the rule's `.claude/rules/<file>.md` into the assigned directory's `.claude/rules/` (no-op if it's already there, e.g. assigned to the project root where it already lives).
   - `source: "vibe-rules"` → installs it with `vibe-rules load <id> claude-code -t <dir>/.claude/rules/<id>.md` (appends a tagged block; skipped if already present so re-runs don't duplicate).
   - Removed / unassigned rules are **left untouched** — the script never deletes files.

   It is idempotent and prints a JSON summary (`moved`, `installed`, `unchanged`, `skipped`, `missing`, `errors`). `missing` lists project rules whose file wasn't found; `errors` includes any failed `vibe-rules load` (e.g. vibe-rules not installed) — surface these to the user but don't treat them as fatal.

5. **Report to the user.** Confirm the files written and summarise:
   - counts of agents, instances, workflows, and rules saved,
   - the current main-session skills and the workflow → success-path rows now in the orchestrator table (from the render),
   - which rule files were moved or installed (from the apply-rules summary), and any `missing`/`errors`,
   - that the `SubagentStart` hook now injects each instance's skills + condition-edge handoff rules automatically, and
   - that `/afk-uninstall` disables the orchestrator if they want to turn AFK off later.

## Notes

- This skill assumes the orchestrator is already scaffolded (Step 0). The one-time scaffolding — copying `afk.md`, the runtime scripts, `agent: afk`, the bash-validation hook, and the gitignore — is done by **`/afk-install`**, which then invokes this skill to author + render the config.
- `/afk-sync` is the lighter cousin: it re-renders the orchestrator from the current `afk.json` **without** opening the form, for when you've hand-edited `afk.json`/`afk.yaml`.
- Skills referenced in instance `skills` arrays must exist as project skills (`<projectPath>/.claude/skills/<id>/SKILL.md`).
- The bundled subagents live at `plugins/ai-tools-manager/agents/`. Their frontmatter has no `skills:` array — that list comes from `afk.json` at runtime via the hook. (The `afk` **orchestrator** is the exception: its frontmatter `skills:` is materialised from `main_session_loaded_skills` because it runs as the main session, not as a SubagentStart-hooked worker.)
