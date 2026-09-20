---
name: maestro-app
description: "Opens the Maestro visual editor (web form) for an already-installed project, then materialises the edited config: writes .claude/maestro.json, re-renders the orchestrator skill, and applies rule placements. Use when the user runs /maestro-app, or asks to edit the Maestro workflow/agents/skills/rules visually, open the Maestro canvas, or change agent↔skill mappings. Requires Maestro to already be installed — if it is not, this skill stops and points the user at /maestro-install."
---

# Maestro (edit + sync)

Open the Maestro visual editor for this project and push the result to the filesystem. This is the everyday "edit my Maestro config" path: the form writes the source-of-truth `.claude/maestro.json`; your job is to persist it, re-render the orchestrator from it, and apply any rule changes.

The form lives at two routes:
- `/workflows` — configure agents, skills, workflow instances, and workflow graphs
- `/rules` — assign rules to the project root and/or specific directory paths

## User's intention

$ARGUMENTS

## Workflow

0. **Precondition — Maestro must already be installed.** Check that the orchestrator skill exists:

   ```bash
   test -f "${CLAUDE_PROJECT_DIR:-.}/.claude/skills/maestro/SKILL.md" && echo present || echo missing
   ```

   If it prints `missing`, **stop without launching the form**. The orchestrator hasn't been installed, so editing config now would leave an unwired `maestro.json`. Tell the user to run **`/maestro-install`** first (it scaffolds the orchestrator and then opens this same editor), then stop.

> **Dispatcher path.** When invoked by the `/ai-tools` dispatcher, the form payload (the `Maestro v3 config data:` block) is already supplied to you. In that case **skip Step 1** (do not launch the form) and go straight to Step 2 with the supplied payload; Steps 2–5 are unchanged. Step 0's precondition still applies.

1. **Launch the form and read the payload.** Run the form launcher in the **background** — the user fills the form interactively, which can take a while:

   ```bash
   bash "${CLAUDE_SKILL_DIR}/../../scripts/launch-ai-tools-manager-app.sh" maestro
   ```

   If `$ARGUMENTS` contains a comma-separated list of implementation agents to seed the canvas (passed by `/maestro-install` on a fresh install — e.g. `backend`, `frontend`, `backend,frontend`), prefix the command with `MAESTRO_IMPL_AGENTS="<list>"`. On a standalone `/maestro-app` run leave it unset; the canvas pre-populates from the existing `maestro.json`.

   `/maestro-install` may also pass a **skill map** — best-fit project-skill→agent assignments the user confirmed at install time. When present in `$ARGUMENTS`, also prefix the command with `MAESTRO_SKILL_MAP='<json>'` (a JSON object like `{"frontend":["react"],"test":["component-test"]}`). It seeds the matching seeded instances' `referenced_skills[]` (referenced is the default mode; promote to loaded in the canvas) so the canvas opens pre-populated. Only meaningful on a fresh install (no `maestro.json`); leave it unset on a standalone `/maestro-app` run. Example combined prefix:

   ```bash
   MAESTRO_IMPL_AGENTS="frontend" MAESTRO_SKILL_MAP='{"frontend":["react"],"test":["component-test"]}' \
     bash "${CLAUDE_SKILL_DIR}/../../scripts/launch-ai-tools-manager-app.sh" maestro
   ```

   `launch-ai-tools-manager-app.sh` builds the image, opens the browser, and blocks until the user submits. When it completes, **its stdout is the form result** — a line beginning `Maestro v3 config data:` followed by a JSON object `{ "projectPath": "<absolute cwd>", "config": { …MaestroConfigV3… } }`.

   If the user cancels, the result is a `{ "decision": "block", "reason": … }` payload — stop and report the reason instead of writing anything.

   The v3 `config` shape:

   ```json
   {
     "version": 3,
     "agents_available": ["backend", "test"],
     "skills_available": ["confidence-check", "expressjs"],
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
   - `skills_available` is a plain string array of skill ids.
   - `workflow_instances` is the project-scoped array of named `{ name, agent, loaded_skills[], referenced_skills[] }` records. `loaded_skills` are auto-loaded by the `SubagentStart` hook before the agent works; `referenced_skills` are surfaced as available and loaded only if the task needs them. Nodes reference an instance by name; an agent node's `id` equals its instance name.
   - `main-session` is the implicit entry point — it appears only in `edges` (`from: "main-session"`), never in `nodes`.
   - Node types are `agent`, `human_review`, and `skill`. A `skill` node carries a `skill` id (the skill-node analog of an agent node's `instance`) and renders in the success path as `/<skill>`; the orchestrator runs it inline via the `Skill` tool rather than dispatching a subagent.
   - `success_path` is **derived** (the orchestrator renderer computes it for the `Maestro:HANDOFFS` table); it is never stored in `maestro.json`.
   - each `rules` entry is **one assignment of a rule to one location** (`scope: "project"` for the root, or `paths: ["<dir>/**"]` for a directory) with a `source` of `"project"` (on-disk rule file, moved into place) or `"vibe-rules"` (installed via `vibe-rules load`). A rule id appears at most once. Step 4 applies these to the filesystem.

2. **Write the config file** under `projectPath`. **Always do this — do not skip it even if the file already exists.**
   - `<projectPath>/.claude/maestro.json` — the `config` object from the form payload, serialized with `JSON.stringify(config, null, 2)`: 2-space indent and **no trailing newline**. Create `.claude/` if needed.

   The app runs inside Docker and cannot write back to the host filesystem, so **you are always the one responsible for persisting the file**. Writing it unconditionally is safe — if the content is identical to what's on disk, git will show no diff.

3. **Re-render the orchestrator** from the new `maestro.json`:

   ```bash
   node "${CLAUDE_PROJECT_DIR:-.}/.claude/scripts/maestro-render-orchestrator.cjs" "<projectPath>"
   ```

   This rewrites the `<!-- Maestro:HANDOFFS -->` table in `<projectPath>/.claude/skills/maestro/SKILL.md` (from each workflow's derived success path). Everything else in the skill file (custom orchestration prose) is preserved. This is the same renderer `/maestro-update` runs. If it reports `maestro/SKILL.md not found`, the precondition in Step 0 was bypassed — stop and tell the user to run `/maestro-install`.

4. **Apply rule placements** from the new config:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/maestro-apply-rules.js" "<projectPath>"
   ```

   This reads the `rules` slice of `maestro.json` and, for each assignment, puts the rule file where it was assigned:
   - `source: "project"` → **moves** the rule's `.claude/rules/<file>.md` into the assigned directory's `.claude/rules/` (no-op if it's already there, e.g. assigned to the project root where it already lives).
   - `source: "vibe-rules"` → installs it with `vibe-rules load <id> claude-code -t <dir>/.claude/rules/<id>.md` (appends a tagged block; skipped if already present so re-runs don't duplicate).
   - Removed / unassigned rules are **left untouched** — the script never deletes files.

   It is idempotent and prints a JSON summary (`moved`, `installed`, `unchanged`, `skipped`, `missing`, `errors`). `missing` lists project rules whose file wasn't found; `errors` includes any failed `vibe-rules load` (e.g. vibe-rules not installed) — surface these to the user but don't treat them as fatal.

5. **Report to the user.** Confirm the files written and summarise:
   - counts of agents, instances, workflows, and rules saved,
   - the workflow → success-path rows now in the orchestrator table (from the render),
   - which rule files were moved or installed (from the apply-rules summary), and any `missing`/`errors`,
   - that the `SubagentStart` hook now injects each instance's skills (auto-loaded `loaded_skills` + available-on-demand `referenced_skills`) + condition-edge handoff rules automatically, and
   - that `/maestro-uninstall` removes the orchestrator skill and scripts if they want to tear Maestro down.

## Notes

- This skill assumes the orchestrator is already scaffolded (Step 0). The one-time scaffolding — copying the `maestro` skill, the runtime scripts, the bash-validation hook, and the gitignore — is done by **`/maestro-install`**, which then invokes this skill to author + render the config.
- `/maestro-update` is the lighter cousin: it re-renders the orchestrator from the current `maestro.json` **without** opening the form, for when you've hand-edited `maestro.json`.
- Skills referenced in instance `loaded_skills` / `referenced_skills` arrays must exist as project skills (`<projectPath>/.claude/skills/<id>/SKILL.md`).
- The bundled subagents live at `plugins/ai-tools-manager/agents/`. Their frontmatter has no `skills:` array — that list comes from `maestro.json` at runtime via the `SubagentStart` hook.
