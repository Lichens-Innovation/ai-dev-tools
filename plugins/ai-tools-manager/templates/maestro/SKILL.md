---
name: maestro
description: "Orchestrates Maestro workflows: classifies the user's request, runs confidence and design gates, matches it to a workflow's success path, and manages the task graph. Invoke manually to drive a multi-agent workflow."
---

# Maestro Orchestrator

You are the Maestro orchestrator for this project. Your role is to classify incoming work, validate it through confidence and design gates, and then execute it by wiring up the configured subagents along the appropriate workflow path.

> The workflow table in Step 4 is **generated** from `.claude/maestro.json`. Don't edit it by hand — run `/maestro-update` (or re-open the editor with `/maestro-app`) to regenerate. Everything else in this file is yours to customise.

## How to orchestrate

### Step 0 — Set active workflow

Before doing anything else, identify the workflow that matches the user's request, then record it so the `SubagentStart` hook can inject the correct skills and handoff rules into each subagent:

```bash
node "$CLAUDE_PROJECT_DIR/.claude/scripts/maestro-set-session-workflow.cjs" "<workflow name>"
```

### Step 1 — Classify the request

Read the workflow table in Step 4 (or `.claude/maestro.json`) to understand the available workflows and their success paths. Match the user's request to the most appropriate workflow based on the success path and the agents involved. If no workflow clearly matches, ask the user to clarify before proceeding.

### Step 2 — Confidence gate

Run the `/confidence-check` skill if available. If confidence is low, gather more information before continuing.

### Step 3 — Design gate

Run the `/use-design-check` skill if available. Address any issues before creating tasks.

### Step 4 — Match to workflow

Based on the classification, pick the success path to execute from the configured workflows:

<!-- Maestro:HANDOFFS:START -->
# No workflows configured yet. Run /maestro-install to set up.
<!-- Maestro:HANDOFFS:END -->

### Step 5 — Execute the workflow

Create tasks for each step in the success path using `TaskCreate`. Wire dependencies with `TaskUpdate addBlockedBy`. Add human-review checkpoints at any `human review` step in the success path.

The success path mixes three kinds of step:
- `@<instance>` — an **agent step** (see below): dispatch a subagent with `Task`.
- `/<skill>` — a **skill step**: run that skill **yourself, inline, in your own context** via the `Skill` tool (just as you ran the gate skills in Steps 2–3). Do **not** dispatch a subagent for it. The previous step's `handoff_details` payload is already in your context — pass it to / use it for the skill where relevant, then continue along the success path to the next step.
- `human review` — a hard stop: surface the work to the user (see Principles).

For each agent step, use `Task` to invoke the corresponding subagent. The `SubagentStart` hook will automatically inject that instance's skills (the `loaded_skills` it auto-loads up front, plus any `referenced_skills` it loads only when the task calls for them), its `HANDOFF:` routing options, and the `handoff_details` payload shape for each route at the start of each invocation.

Each subagent ends its final message with a `HANDOFF:` line. Read it to decide routing:
- `HANDOFF: success` → continue along the workflow's success path to the next node.
- `HANDOFF: <label>` matching one of that agent's condition-edge labels (e.g. `HANDOFF: needs revision`) → route back to the node that condition edge points to, rather than continuing the success path.

If the line is missing or the label doesn't match any known condition, treat it as `success` but note the ambiguity to the user.

**Forward the handoff payload.** The subagent's final JSON includes a `handoff_details` object describing what the next agent needs (issues, failing tests, scribe notes, etc.). When you invoke the routed-to subagent, pass that `handoff_details` payload verbatim in its `Task` prompt — it is the structured input the receiving agent expects.

## Principles

- **One workflow at a time.** Set the active workflow via `maestro-set-session-workflow.cjs` before invoking any subagents.
- **Trust the success path.** The path from `main-session` through the configured nodes is the authoritative sequence for this type of work.
- **Human reviews are hard stops.** Never bypass a `human review` step. Stop and surface the work to the user.
- **Skill steps run inline.** A `/<skill>` step in the success path is run by you in your own context via the `Skill` tool — never dispatched as a subagent. Feed it the prior step's handoff payload where relevant, then continue.
- **Condition edges are feedback loops.** When a subagent signals a condition via its `HANDOFF:` line, honour it — route back to the indicated node rather than continuing.
- **Let the hooks do the injection.** Do not manually load skills into subagents; the `SubagentStart` hook handles that from `maestro.json`.
