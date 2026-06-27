---
name: maestro-architecture
description: "Explains the Maestro runtime end-to-end: how a project goes from maestro.json to a live orchestrator, what the install does, how the SubagentStart/PreToolUse/SessionEnd hooks behave at runtime, how skills + condition-edge handoffs are injected, the HANDOFF routing contract, and the three config/state files (maestro.json, maestro_session.json, maestro_session.log.jsonl). Use when the user is working inside apps/ai-tools-manager or plugins/ai-tools-manager and asks how Maestro works at runtime, what the orchestrator does, why a subagent did/didn't get its skills, how handoffs route, what the install/uninstall touches, or which maestro file is authoritative."
---

# Maestro Runtime Architecture

Maestro turns a project into a multi-agent workflow: the user manually invokes the **`/maestro`** skill, which classifies each request, runs gates, picks a configured workflow, and dispatches subagents whose skills + handoff rules are injected at runtime from `.claude/maestro.json`.

This doc covers the **runtime** half. The **authoring** half — the visual canvas that produces the config — is documented in the `workflow-view` skill. The two meet at `.claude/maestro.json`.

```
authoring (workflow-view skill)        runtime (this doc)
  /workflows + /rules canvas    ──▶    .claude/maestro.json   ──▶   orchestrator + hooks
        writes maestro.json                (source of truth)         read it every session
```

## Install pipeline

The setup is split across two skills that meet at `maestro.json`: **`/maestro-install`** scaffolds the orchestrator (the one-time bits), then hands off to **`/maestro-app`** which authors and materialises the config. `/maestro-app` is also the standalone "re-edit my config" entry point on an already-installed project.

```
User runs /maestro-install
        │  Step 1: analyze repo → implementation agent(s)
        │  Step 2 (fresh install only): scan .claude/skills/ (skill id = dir name; frontmatter
        │          optional) → best-fit map each project skill to a seeded agent (impl +
        │          test/reviewer/refactor/scribe) → single AskUserQuestion consent prompt →
        │          skill map {agent: [skillId]}  (empty / skipped on re-install)
        ▼
maestro-install.js   (scaffold-only, idempotent)
  1. templates/maestro/SKILL.md → .claude/skills/maestro/SKILL.md  (only if absent — edits preserved)
  2. runtime scripts             → .claude/scripts/{maestro-set-session-workflow.cjs, maestro-render-orchestrator.cjs, bash-validation.sh, lib/maestro-session.cjs}  (always refreshed)
  3. merge PreToolUse Bash hook (bash-validation.sh) → .claude/settings.json  (preserves other keys; no longer writes `agent: "maestro"`)
  4. ensure repo-root             .gitignore  `# Maestro` section     (**/.claude/maestro_session.{json,log.jsonl} — covers every nested .claude/ in a monorepo, including root)
        │  maestro-install then invokes the /maestro-app skill, seeded with the detected impl agents (+ skill map)
        ▼
/maestro-app skill   (also the standalone re-edit entry point — guards on maestro/SKILL.md existing, else points to /maestro-install)
        │  launch-ai-tools-manager-app.sh (MAESTRO_IMPL_AGENTS + MAESTRO_SKILL_MAP) → Docker app → user edits canvas
        │  └─ on a fresh install (no maestro.json) defaultV3Config seeds the workflows from MAESTRO_IMPL_AGENTS
        │     and attaches MAESTRO_SKILL_MAP's skills to the matching seeded instances' referenced_skills[] (default mode)
        ▼
App (submitMaestroConfig) writes .claude/maestro.json, and a result file
        │  result = "Maestro v3 config data: {JSON}"
        ▼
skills/maestro-app/SKILL.md
  • writes .claude/maestro.json (JSON.stringify(config, null, 2), no trailing NL — matches the app)
  • runs: node maestro-render-orchestrator.cjs  → rewrites the Maestro:HANDOFFS table in maestro/SKILL.md from maestro.json
  • runs: node maestro-apply-rules.js          → places/installs rule files from the rules slice
```

Why the editor sits between scaffold and render: the form is what *produces* `maestro.json`, and both the render and the rule-apply steps *consume* it — so `/maestro-install` must scaffold `maestro/SKILL.md` first (render needs it to exist), then let `/maestro-app` author the config, then render. `/maestro-update` first refreshes the project-copied runtime scripts from the plugin (so plugin updates propagate without a full reinstall), then re-runs the renderer — use it after a hand-edit to `maestro.json` or after updating the plugin. `/maestro-uninstall` reverses step 3 (removes the bash-validation PreToolUse hook and any legacy `agent: "maestro"` left by older installs) and clears the session files; `--purge` also removes the orchestrator skill + copied scripts (including `bash-validation.sh`). Neither touches `maestro.json`.

`bash-validation.sh` (step 2/3) is a PreToolUse Bash guard: it denies any Bash command that reads a `.env` secret file, allowing only `.env.example`. It's a project-copied runtime script, so its hook command is `$CLAUDE_PROJECT_DIR/.claude/scripts/bash-validation.sh` and the installer reuses an existing `Bash` matcher rather than clobbering user hooks.

## Runtime lifecycle (one session)

```
User invokes /maestro in a session
        │
        ▼
Orchestrator (.claude/skills/maestro/SKILL.md):
  Step 0  classify request → node .claude/scripts/maestro-set-session-workflow.cjs "<workflow>"
                              └─ writes { workflow, generated_instances } → maestro_session.json
  Step 1-3  confidence + design gates (/confidence-check, /use-design-check — IF available)
  Step 4  pick the success path from the Maestro:HANDOFFS table
  Step 5  TaskCreate per step; Task() each agent step
        │
        ▼ (each Task → subagent)
SubagentStart hook  (matcher ".*")  → maestro-inject-agent-context.js
  • reads active workflow from maestro_session.json + the instance from maestro.json
  • injects additionalContext: the instance's loaded_skills (auto-load first) + referenced_skills (load only if relevant) + condition-edge labels
  • condition edges → tells the subagent to end with a `HANDOFF: <label>` / `HANDOFF: success` line
  • if the active workflow can't be resolved → prepends a ⚠️ warning (skills may be unioned/wrong)
        │
        ▼
Subagent runs, ends with a HANDOFF: line
        │
        ▼
Orchestrator reads HANDOFF:  → `success` continues the success path; a matching label routes back to that node
        │
   (every tool call, all agents)
        ▼
PreToolUse hook (matcher ".*") → maestro-session-log.js → appends one line to maestro_session.log.jsonl
        │
        ▼
SessionEnd hook → maestro-session-cleanup.sh → deletes maestro_session.json + maestro_session.log.jsonl,
                                            drops this session's marker from the per-project
                                            /tmp/ai-tools-app.sessions/<key>/ dir, AND tears down
                                            THIS PROJECT'S container only when no markers remain
                                            for that project (other projects' containers untouched)
```

## The four files

| File | Path | Role | Written by | Lifecycle |
|---|---|---|---|---|
| `maestro.json` | `<project>/.claude/maestro.json` | **Source of truth** (`version: 3`). Every hook + the renderer read this. `success_path` is **not** stored here. | App + skill (byte-identical) | Committed; edited via canvas or by hand (+ `/maestro-update`) |
| `maestro_session.json` | `<project>/.claude/maestro_session.json` | Ephemeral session state: `{ workflow, generated_instances }`. Tells `maestro-inject-agent-context.js` which workflow is active. | `maestro-set-session-workflow.cjs`, `maestro-inject-agent-context.js` | Ephemeral; **gitignored**; deleted at `SessionEnd` |
| `maestro_session.log.jsonl` | `<project>/.claude/maestro_session.log.jsonl` | Ephemeral **append-only** log. Three entry kinds: (1) plain tool-call `{ts, origin, log}` (PreToolUse); (2) `kind:"dispatch"` `{ts, origin:"main_session", agent, agent_id, input, offered_skills?, log}` (SubagentStart); (3) `kind:"handoff"` `{ts, origin, agent_id, status, label, output, log}` (SubagentStop). Append-only so parallel subagents don't race. The ai-tools-manager app **live-tails** this file over SSE (`src/routes/api/session-log-stream.ts`) — hooks remain append-only and network-free; the SSE tail is read-only and separate from the write path. | `maestro-session-log.js` (PreToolUse) + `maestro-subagent-log.js` (SubagentStart/Stop) | Ephemeral; **gitignored**; deleted at `SessionEnd` |
| `maestro_session_tasks.json` | `<project>/.claude/maestro_session_tasks.json` | Ephemeral task-coverage tracker: `{ steps: ["@backend", "human review", ...] }`. Records which success-path steps already have a `TaskCreate` in this session. Read-modify-write is safe (only the main orchestrator calls `TaskCreate`, no parallel race). | `maestro-validate-tasks.js` (PostToolUse) | Ephemeral; **gitignored**; deleted at `SessionEnd` |

`success_path` is derived by `successPathSteps` in `lib/maestro-session.cjs` — never persisted in `maestro.json`, only rendered into the orchestrator's `Maestro:HANDOFFS` table (` → ` separator, `human review` label).

## Hook reference (plugins/ai-tools-manager/hooks/hooks.json)

| Event | Matcher | Script | Effect |
|---|---|---|---|
| `SubagentStart` | `.*` | `maestro-inject-agent-context.js` | Inject the matched instance's skills (two blocks: `loaded_skills` to auto-load + `referenced_skills` to load only if relevant), its `HANDOFF:` routing lines (success + condition labels), and the per-route `handoff_details` payload protocol (from `templates/handoffs/<sender>/<receiver>.md`). No-op when the agent maps to no instance, so a broad matcher safely covers custom agents too. |
| `SubagentStart` | `.*` | `maestro-subagent-log.js` | Append a `kind:"dispatch"` entry to `maestro_session.log.jsonl`: the subagent's `agent_type`, `agent_id`, the full spawning message (`input`), and `offered_skills` (`{loaded, referenced}` — the skills `maestro-inject-agent-context.js` surfaces, resolved via the **shared** `resolveSearchList` + `collectAgentSkills` in `lib/maestro-session.cjs` so the logged set can't drift from the injected one). `/session-log` diffs `offered_skills` against the agent's reported `skillsTriage` to flag silently-dropped skills. Runs alongside `maestro-inject-agent-context.js`; order irrelevant. No-op when `maestro.json` is absent. |
| `SubagentStop` | `.*` | `maestro-subagent-log.js` | Append a `kind:"handoff"` entry: parses the subagent's `HANDOFF:` label from `last_assistant_message` → `status` (`"success"` / `"condition"` / `"unknown"`), stores the full final message as `output`. Correlated to the dispatch entry by `agent_id`. No-op when `maestro.json` is absent. |
| `PreToolUse` | `.*` | `maestro-session-log.js` | Append a tool-call line to `maestro_session.log.jsonl`. No-op when `maestro.json` is absent. |
| `PostToolUse` | `TaskCreate` | `maestro-validate-tasks.js` | Validate that the created task matches a step in the active workflow's success path. Tracks created steps across the session in `maestro_session_tasks.json` (ephemeral, deleted at `SessionEnd`). Warns via `additionalContext` + `systemMessage` when a task doesn't match any workflow node or when a success-path step was skipped (e.g. `human review`). No-op when `maestro.json` is absent or no active workflow. |
| `SessionStart` | `` | `maestro-app-session-register.sh` | Register this session as a live user of the per-project ai-tools-manager container, via a marker file under `/tmp/ai-tools-app.sessions/<project-key>/<session_id>`. Reference counting is per-project — teardown waits only until the last session *for that project* ends, leaving other projects' containers untouched. No-op when `session_id` or `cwd` is unavailable. |
| `SessionEnd` | `` | `maestro-session-cleanup.sh` | Delete all ephemeral session files (`maestro_session.json`, `maestro_session.log.jsonl`, `maestro_session_tasks.json`), drop this session's marker from the per-project sessions dir, **and** tear down *this project's* container (`-p ai-tools-<key>`) only when no markers remain for that project *and* its state file (`/tmp/ai-tools-app.<key>.state`) is present. Other projects' containers are never touched. |
| `UserPromptExpansion` | `create-*` | `launch-ai-tools-manager-app.sh` | Launch the Docker form for the `create-{skill,subagent,plugin,marketplace}` flows. The launcher is a thin `ensure-ai-tools-app.sh` + `wait-ai-tools-result.sh` wrapper over a **persistent, project-scoped** container on a per-project port (3010–3099, allocated once and persisted in the state file). The container mounts the target project at `/project` so the app can read/write `maestro.json`, Maestro tasks, rules, and the session log from any repo on disk. The `/ai-tools` dispatcher skill is the unified entry point that brings the app up once and listens for every submit; `maestro` / `maestro-install` still run the launcher themselves (`maestro-install` first analyzes the repo to seed the canvas and offers to attach local skills — see their SKILL.md). |

`maestro-inject-agent-context.js` and `maestro-session-log.js` run from `${CLAUDE_PLUGIN_ROOT}/scripts/` — edits to them take effect immediately for every project. The bash lifecycle scripts (`ensure-ai-tools-app.sh`, `wait-ai-tools-result.sh`, `maestro-app-session-register.sh`, `maestro-session-cleanup.sh`) also run from `${CLAUDE_PLUGIN_ROOT}/scripts/`; they all source `lib/maestro-app-paths.sh` (same dir) to derive the per-project key, port, and tmp file paths from the current project's cwd. `maestro-set-session-workflow.cjs` and `maestro-render-orchestrator.cjs` run from the **project copy** in `.claude/scripts/`, so changes to them only reach a project on (re)install. `templates/maestro/SKILL.md` is copied only if absent, so template changes reach **new installs only**.

## The HANDOFF contract

The subagent has no static knowledge of its handoffs — the `SubagentStart` hook injects, per its active-workflow instance:
1. **Skills**, in two kinds. `loaded_skills` are auto-loaded (`Skill` tool) before working — the imperative "load each one first" block. `referenced_skills` are surfaced as *available*: the agent loads one only if the task involves the logic that skill describes (it reads each skill's description to decide), otherwise ignores it. A skill that is `loaded` for any matched instance is dropped from the referenced list (loaded wins).
2. **Routing lines** — the `HANDOFF:` labels this node may emit: `success` (when a success edge leaves the node, resolved *through* non-agent nodes like `human review` to the next agent) plus each labeled `condition` edge. Unlabeled condition edges are skipped — they aren't routable.
3. An instruction to **end its final message with exactly one `HANDOFF: <label>`** (`success`, or the exact condition label).
4. **The `handoff_details` payload protocol per route** — the JSON shape the receiving agent expects, read from `templates/handoffs/<sender>/<receiver>.md` (dir names = agent `name`; project-local `.claude/handoffs/<sender>/<receiver>.md` overrides the bundled copy). These live **outside** the `agents/` tree on purpose (see Things that bite). This is the whole communication layer: agent files no longer carry their own handoff shapes. A route with no matching template just gets the routing line, no payload.

The orchestrator (`templates/maestro/SKILL.md`, Step 5) reads the `HANDOFF:` line: `success` continues the workflow's success path; a label matching a condition edge routes back to that edge's target node. A missing/unknown line is treated as `success` but flagged. It then **forwards the emitted `handoff_details` payload** verbatim into the routed-to subagent's `Task` prompt.

Note: protocol templates live **only** in the agent template files, never in `maestro.json` — keeping the app/skill byte-identical `maestro.json` invariant intact. The hook reads them as a side input, exactly as it reads session state.

## Common questions — where to look

| Question | Look at |
|---|---|
| Why didn't a subagent get its skills? | active workflow in `maestro_session.json` (was `maestro-set-session-workflow.cjs` run?); the instance's `agent` must equal the subagent's `name`; the skill must be a real project skill |
| Why are the wrong skills injected? | likely no/mismatched active workflow → union across workflows (the injected `⚠️ warning` says so) |
| How do I change the orchestrator's behavior? | edit `.claude/skills/maestro/SKILL.md` — everything outside the `Maestro:HANDOFFS` region is yours |
| The handoff table is stale | run `/maestro-update` (re-renders from `maestro.json`) |
| How do I turn Maestro off? | `/maestro-uninstall` (removes the bash-validation hook + session files); `--purge` to also remove the orchestrator skill + scripts |
| How did this session go / what could have gone better? | `/maestro-post-mortem` — `maestro-post-mortem.js` digests `maestro_session.log.jsonl` (read-only) and the skill couples it with the main session's context to flag avoidable work, false checks, bad assumptions, and handoff issues, then proposes fixes. Run mid-session (the log is wiped at `SessionEnd`). |
| Where's the install logic? | `plugins/ai-tools-manager/scripts/maestro-install.js` |

## Things that bite

- **The app container is per-project, not host-global.** Each project (keyed by its cwd via a 12-char SHA-1: `lib/maestro-app-paths.sh`) gets its own compose project name (`ai-tools-<key>`), port (3010–3099, allocated once on the first cold start and persisted in `/tmp/ai-tools-app.<key>.state`), and tmp channel files. Two Claude sessions in different repos run side by side without colliding; `SessionEnd` only tears down the container for its own project. The old fixed port 3009 / `-p ai-tools-manager` no longer applies to any script-managed container (3009 remains the bare `docker compose up` default for local dev without the scripts).
- **`maestro.json` is the single source of truth.** Hand-edit it then run `/maestro-update` to re-render the orchestrator.
- **`maestro/SKILL.md` is never overwritten once present.** Re-running `/maestro-install` or `/maestro-update` refreshes the runtime scripts, but neither touches your custom orchestration prose. Template improvements reach existing installs only via manual edit or `/maestro-update` (which re-renders only the `Maestro:HANDOFFS` region, not your custom prose).
- **The gate skills are optional.** `/confidence-check` and `/use-design-check` are now bundled in this plugin (`plugins/ai-tools-manager/skills/{confidence-check,use-design-check}`), but the orchestrator still references them "if available" and degrades gracefully if a project hasn't installed them.
- **Session logs are append-only by design.** Don't switch `maestro_session.log.jsonl` back to a read-modify-write JSON array — parallel subagents would lose entries.
- **Anything `.md` under `agents/` is discovered as an agent.** This is why the `handoff_details` protocol templates live at `templates/handoffs/<sender>/<receiver>.md`, **not** under `agents/`: a frontmatter-less `.md` inside the agents tree gets registered as a phantom agent (e.g. `…:refactor:handoffs:backend`) with **All tools**. Keep handoff templates (and any other non-agent `.md`) out of `agents/`. If you add a new sender/receiver pair, drop the file under `templates/handoffs/<sender>/` — `readHandoffProtocol()` resolves it there (and at the project-local `.claude/handoffs/<sender>/` override).
