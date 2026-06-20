---
name: afk-architecture
description: "Explains the AFK (Agents Framework Kickstarter) runtime end-to-end: how a project goes from afk.json to a live orchestrator, what the install does, how the SubagentStart/PreToolUse/SessionEnd hooks behave at runtime, how skills + condition-edge handoffs are injected, the HANDOFF routing contract, and the four config/state files (afk.yaml, afk.json, afk_session.json, afk_session.log.jsonl). Use when the user is working inside apps/ai-tools-manager or plugins/ai-tools-manager and asks how AFK works at runtime, what the orchestrator does, why a subagent did/didn't get its skills, how handoffs route, what the install/uninstall touches, or which afk file is authoritative."
---

# AFK Runtime Architecture

AFK turns a project into a multi-agent workflow: a main-session **orchestrator** (`afk`) classifies each request, runs gates, picks a configured workflow, and dispatches subagents whose skills + handoff rules are injected at runtime from `.claude/afk.json`.

This doc covers the **runtime** half. The **authoring** half — the visual canvas that produces the config — is documented in the `workflow-view` skill. The two meet at `.claude/afk.json`.

```
authoring (workflow-view skill)        runtime (this doc)
  /workflows + /rules canvas    ──▶    .claude/afk.json   ──▶   orchestrator + hooks
        writes afk.json                (source of truth)         read it every session
```

## Install pipeline

The setup is split across two skills that meet at `afk.json`: **`/afk-install`** scaffolds the orchestrator (the one-time bits), then hands off to **`/afk`** which authors and materialises the config. `/afk` is also the standalone "re-edit my config" entry point on an already-installed project.

```
User runs /afk-install
        │  Step 1: analyze repo → implementation agent(s)
        │  Step 2 (fresh install only): scan .claude/skills/ → best-fit map each project skill to a
        │          seeded agent (impl + test/reviewer/refactor/scribe) → per-agent AskUserQuestion
        │          checklist → skill map {agent: [skillId]}  (empty / skipped on re-install)
        ▼
afk-install.js   (scaffold-only, idempotent)
  1. templates/afk.md            → .claude/agents/afk.md         (only if absent — edits preserved)
  2. runtime scripts             → .claude/scripts/{afk-set-session-workflow.js, afk-render-orchestrator.js, bash-validation.sh, lib/afk-session.js}  (always refreshed)
  3. merge { "agent": "afk" } + PreToolUse Bash hook (bash-validation.sh) → .claude/settings.json  (preserves other keys)
  4. ensure                       .claude/.gitignore             (ignores afk_session.json + afk_session.log.jsonl)
  5. ensure repo-root             .gitignore  `# AFK` section     (**/.claude/afk_session.{json,log.jsonl} — covers every nested .claude/ in a monorepo)
        │  afk-install then invokes the /afk skill, seeded with the detected impl agents (+ skill map)
        ▼
/afk skill   (also the standalone re-edit entry point — guards on afk.md existing, else points to /afk-install)
        │  launch-ai-tools-manager-app.sh (AFK_IMPL_AGENTS + AFK_SKILL_MAP) → Docker app → user edits canvas
        │  └─ on a fresh install (no afk.json) defaultV3Config seeds the workflows from AFK_IMPL_AGENTS
        │     and attaches AFK_SKILL_MAP's skills to the matching seeded instances' skills[]
        ▼
App (submitAfkConfig) writes .claude/afk.json + afk.yaml, and a result file
        │  result = "AFK v3 config data: {JSON}" + verbatim afk.yaml
        ▼
skills/afk/SKILL.md
  • writes .claude/afk.json (JSON.stringify(config, null, 2), no trailing NL — matches the app)
  • writes afk.yaml verbatim
  • runs: node afk-render-orchestrator.js  → rewrites afk.md frontmatter skills + AFK:HANDOFFS table from afk.json
  • runs: node afk-apply-rules.js          → places/installs rule files from the rules slice
```

Why the editor sits between scaffold and render: the form is what *produces* `afk.json`, and both the render and the rule-apply steps *consume* it — so `/afk-install` must scaffold `afk.md` first (render needs it to exist), then let `/afk` author the config, then render. `/afk-sync` re-runs only the renderer after a hand-edit to `afk.json` (no form). `/afk-uninstall` reverses step 3 (removes `agent: afk` and the bash-validation PreToolUse hook) and clears the session files; `--purge` also removes the agent + copied scripts (including `bash-validation.sh`). Neither touches `afk.json` / `afk.yaml`.

`bash-validation.sh` (step 2/3) is a PreToolUse Bash guard: it denies any Bash command that reads a `.env` secret file, allowing only `.env.example`. It's a project-copied runtime script, so its hook command is `$CLAUDE_PROJECT_DIR/.claude/scripts/bash-validation.sh` and the installer reuses an existing `Bash` matcher rather than clobbering user hooks.

## Runtime lifecycle (one session)

```
New session starts → settings.json `agent: afk` makes the main session the orchestrator
        │
        ▼
Orchestrator (.claude/agents/afk.md):
  Step 0  classify request → node .claude/scripts/afk-set-session-workflow.js "<workflow>"
                              └─ writes { workflow, generated_instances } → afk_session.json
  Step 1-3  confidence + design gates (/confidence-check, /use-design-check — IF available)
  Step 4  pick the success path from the AFK:HANDOFFS table
  Step 5  TaskCreate per step; Task() each agent step
        │
        ▼ (each Task → subagent)
SubagentStart hook  (matcher ".*")  → afk-inject-agent-context.js
  • reads active workflow from afk_session.json + the instance from afk.json
  • injects additionalContext: the instance's skills + condition-edge labels
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
PreToolUse hook (matcher ".*") → afk-session-log.js → appends one line to afk_session.log.jsonl
        │
        ▼
SessionEnd hook → afk-session-cleanup.sh → deletes afk_session.json + afk_session.log.jsonl
```

## The four files

| File | Path | Role | Written by | Lifecycle |
|---|---|---|---|---|
| `afk.yaml` | `<project>/afk.yaml` | Human-readable rendering of the config; includes the **derived** `success_path` per workflow. Not read at runtime. | App (`afkConfigToYaml`) + skill (verbatim) | Committed; regenerated on save |
| `afk.json` | `<project>/.claude/afk.json` | **Source of truth** (`version: 3`). Every hook + the renderer read this. `success_path` is **not** stored here. | App + skill (byte-identical) | Committed; edited via canvas or by hand (+ `/afk-sync`) |
| `afk_session.json` | `<project>/.claude/afk_session.json` | Ephemeral session state: `{ workflow, generated_instances }`. Tells `afk-inject-agent-context.js` which workflow is active. | `afk-set-session-workflow.js`, `afk-inject-agent-context.js` | Ephemeral; **gitignored**; deleted at `SessionEnd` |
| `afk_session.log.jsonl` | `<project>/.claude/afk_session.log.jsonl` | Ephemeral **append-only** log. Three entry kinds: (1) plain tool-call `{ts, origin, log}` (PreToolUse); (2) `kind:"dispatch"` `{ts, origin:"main_session", agent, agent_id, input, log}` (SubagentStart); (3) `kind:"handoff"` `{ts, origin, agent_id, status, label, output, log}` (SubagentStop). Append-only so parallel subagents don't race. The ai-tools-manager app **live-tails** this file over SSE (`src/routes/api/session-log-stream.ts`) — hooks remain append-only and network-free; the SSE tail is read-only and separate from the write path. | `afk-session-log.js` (PreToolUse) + `afk-subagent-log.js` (SubagentStart/Stop) | Ephemeral; **gitignored**; deleted at `SessionEnd` |

`success_path` is derived (by `computeSuccessPath` in the app and the twin `successPath` in `afk-render-orchestrator.js`) — never persisted in `afk.json`, only rendered into `afk.yaml` and the orchestrator's table. Both renderers must emit identical output (` → ` separator, `human review` label).

## Hook reference (plugins/ai-tools-manager/hooks/hooks.json)

| Event | Matcher | Script | Effect |
|---|---|---|---|
| `SubagentStart` | `.*` | `afk-inject-agent-context.js` | Inject the matched instance's skills, its `HANDOFF:` routing lines (success + condition labels), and the per-route `handoff_details` payload protocol (from `templates/handoffs/<sender>/<receiver>.md`). No-op when the agent maps to no instance, so a broad matcher safely covers custom agents too. |
| `SubagentStart` | `.*` | `afk-subagent-log.js` | Append a `kind:"dispatch"` entry to `afk_session.log.jsonl`: the subagent's `agent_type`, `agent_id`, and the full spawning message (`input`). Runs alongside `afk-inject-agent-context.js`; order irrelevant. No-op when `afk.json` is absent. |
| `SubagentStop` | `.*` | `afk-subagent-log.js` | Append a `kind:"handoff"` entry: parses the subagent's `HANDOFF:` label from `last_assistant_message` → `status` (`"success"` / `"condition"` / `"unknown"`), stores the full final message as `output`. Correlated to the dispatch entry by `agent_id`. No-op when `afk.json` is absent. |
| `PreToolUse` | `.*` | `afk-session-log.js` | Append a tool-call line to `afk_session.log.jsonl`. No-op when `afk.json` is absent. |
| `SessionEnd` | `` | `afk-session-cleanup.sh` | Delete both ephemeral session files. |
| `UserPromptExpansion` | `create-*` | `launch-ai-tools-manager-app.sh` | Launch the Docker form for the `create-{skill,subagent,plugin,marketplace}` flows. (The `afk` / `afk-install` skills are **not** wired here — they run `launch-ai-tools-manager-app.sh` themselves; `afk-install` first analyzes the repo to seed the canvas with the detected implementation agent(s) and offers a checklist to attach the repo's local skills to the seeded agents; see their SKILL.md.) |

`afk-inject-agent-context.js` and `afk-session-log.js` run from `${CLAUDE_PLUGIN_ROOT}/scripts/` — edits to them take effect immediately for every project. `afk-set-session-workflow.js` and `afk-render-orchestrator.js` run from the **project copy** in `.claude/scripts/`, so changes to them only reach a project on (re)install. `templates/afk.md` is copied only if absent, so template changes reach **new installs only**.

## The HANDOFF contract

The subagent has no static knowledge of its handoffs — the `SubagentStart` hook injects, per its active-workflow instance:
1. **Skills** to load (`Skill` tool) before working.
2. **Routing lines** — the `HANDOFF:` labels this node may emit: `success` (when a success edge leaves the node, resolved *through* non-agent nodes like `human review` to the next agent) plus each labeled `condition` edge. Unlabeled condition edges are skipped — they aren't routable.
3. An instruction to **end its final message with exactly one `HANDOFF: <label>`** (`success`, or the exact condition label).
4. **The `handoff_details` payload protocol per route** — the JSON shape the receiving agent expects, read from `templates/handoffs/<sender>/<receiver>.md` (dir names = agent `name`; project-local `.claude/handoffs/<sender>/<receiver>.md` overrides the bundled copy). These live **outside** the `agents/` tree on purpose (see Things that bite). This is the whole communication layer: agent files no longer carry their own handoff shapes. A route with no matching template just gets the routing line, no payload.

The orchestrator (`templates/afk.md`, Step 5) reads the `HANDOFF:` line: `success` continues the workflow's success path; a label matching a condition edge routes back to that edge's target node. A missing/unknown line is treated as `success` but flagged. It then **forwards the emitted `handoff_details` payload** verbatim into the routed-to subagent's `Task` prompt.

Note: protocol templates live **only** in the agent template files, never in `afk.json` — keeping the app/skill byte-identical `afk.json` invariant intact. The hook reads them as a side input, exactly as it reads session state.

## Common questions — where to look

| Question | Look at |
|---|---|
| Why didn't a subagent get its skills? | active workflow in `afk_session.json` (was `afk-set-session-workflow.js` run?); the instance's `agent` must equal the subagent's `name`; the skill must be a real project skill |
| Why are the wrong skills injected? | likely no/mismatched active workflow → union across workflows (the injected `⚠️ warning` says so) |
| How do I change the orchestrator's behavior? | edit `.claude/agents/afk.md` — everything outside the generated frontmatter `skills:` and the `AFK:HANDOFFS` region is yours |
| The handoff table is stale | run `/afk-sync` (re-renders from `afk.json`) |
| How do I turn AFK off? | `/afk-uninstall` (removes `agent: afk`); `--purge` to also remove the agent + scripts |
| How did this session go / what could have gone better? | `/afk-post-mortem` — `afk-post-mortem.js` digests `afk_session.log.jsonl` (read-only) and the skill couples it with the main session's context to flag avoidable work, false checks, bad assumptions, and handoff issues, then proposes fixes. Run mid-session (the log is wiped at `SessionEnd`). |
| Where's the install logic? | `plugins/ai-tools-manager/scripts/afk-install.js` |

## Things that bite

- **`afk.json` is the source of truth; `afk.yaml` is a rendering.** Hooks never read `afk.yaml`. Hand-edit `afk.json` (then `/afk-sync`), not the YAML.
- **`success_path` is duplicated across the app/plugin boundary** (`computeSuccessPath` in TS, `successPath` in plain Node). They can't share code — keep their output byte-identical or `afk.yaml` and the orchestrator table will disagree.
- **The orchestrator only changes on new sessions.** `agent: afk` (and any `afk.md` change) takes effect next session, not the current one.
- **`afk.md` is never overwritten once present.** Re-running `/afk-install` refreshes the runtime scripts (and the `/afk` step it invokes re-renders the generated regions), but neither touches your custom orchestration prose. Template improvements reach existing installs only via manual edit or `/afk-sync` (which only touches the generated regions).
- **The gate skills are optional/external.** `/confidence-check` and `/use-design-check` are referenced "if available" but are not bundled in this marketplace — the orchestrator degrades gracefully when they're absent.
- **Session logs are append-only by design.** Don't switch `afk_session.log.jsonl` back to a read-modify-write JSON array — parallel subagents would lose entries.
- **Anything `.md` under `agents/` is discovered as an agent.** This is why the `handoff_details` protocol templates live at `templates/handoffs/<sender>/<receiver>.md`, **not** under `agents/`: a frontmatter-less `.md` inside the agents tree gets registered as a phantom agent (e.g. `…:refactor:handoffs:backend`) with **All tools**. Keep handoff templates (and any other non-agent `.md`) out of `agents/`. If you add a new sender/receiver pair, drop the file under `templates/handoffs/<sender>/` — `readHandoffProtocol()` resolves it there (and at the project-local `.claude/handoffs/<sender>/` override).
