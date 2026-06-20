#!/usr/bin/env node
// SubagentStart hook for worker subagents.
// Reads <cwd>/.claude/afk.json (v3), looks up the invoked agent type's instance
// in the active workflow, and emits as additionalContext:
//   1. the instance's configured skills,
//   2. the HANDOFF routing lines this agent may emit (success + condition labels),
//   3. the per-route handoff_details payload protocol (from the
//      templates/handoffs/<sender>/<target>.md template) so the whole
//      communication layer lives here rather than in each agent file.
// No-op (exit 0, no output) when afk.json is absent, not v3, or the agent type is
// not mapped to any workflow node.

const fs = require("fs");
const path = require("path");
const { readStdin, readJson, resolveWorkflowName, readSession, writeSession } = require("./lib/afk-session");

// Read the handoff_details payload template for a sender -> receiver edge.
// Convention: handoffs/<sender>/<receiver>.md (dir names === agent `name`). Kept
// out of the agents/ tree so Claude Code doesn't register the frontmatter-less
// templates as phantom agents. Checked project-local first (so target=project
// agents can override), then the bundled plugin copy. Returns content or null.
function readHandoffProtocol(projectDir, sender, receiver) {
  const candidates = [
    path.join(projectDir, ".claude", "handoffs", sender, `${receiver}.md`),
    path.join(__dirname, "..", "templates", "handoffs", sender, `${receiver}.md`),
  ];
  for (const p of candidates) {
    try {
      const body = fs.readFileSync(p, "utf8").trim();
      if (body) return body;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function collect(cfg, sessionPath, agentType) {
  const instances = cfg.workflow_instances || [];
  const workflows = cfg.workflows || [];

  const session = readSession(sessionPath);
  const activeWorkflowName = session.workflow || null;

  // Scope to the active workflow when it resolves. When no workflow is set yet —
  // e.g. the user invoked an agent on the first prompt, before the orchestrator
  // classified the request and ran afk-set-session-workflow.js — fall back to the
  // default workflow (resolveWorkflowName → first configured workflow, i.e. "default")
  // rather than unioning across every workflow, which can inject the wrong routes/skills.
  // A genuinely broken active name (set but unknown) still unions + warns loudly.
  const activeMatches = activeWorkflowName ? workflows.filter((w) => w.name === activeWorkflowName) : [];
  let warning = null;
  let searchList;
  if (activeWorkflowName && activeMatches.length > 0) {
    searchList = activeMatches;
  } else if (activeWorkflowName) {
    searchList = workflows;
    warning =
      `The active workflow "${activeWorkflowName}" (from afk_session.json) matches no workflow in afk.json. ` +
      `The skills below are unioned across all workflows and may be wrong — re-run afk-set-session-workflow.js with a valid workflow name.`;
  } else {
    const fallbackName = resolveWorkflowName(cfg);
    const fallbackMatches = workflows.filter((w) => w.name === fallbackName);
    searchList = fallbackMatches.length > 0 ? fallbackMatches : workflows;
    if (workflows.length > 1) {
      warning =
        `No active workflow is set (afk-set-session-workflow.js was not run); falling back to the "${fallbackName}" workflow. ` +
        `If you intended a different workflow, the orchestrator should set it before invoking subagents.`;
    }
  }

  const instByName = (name) => instances.find((i) => i.name === name);

  const skillSet = new Set();
  const matchedInstances = [];
  // routeKey ("success" | condition label) -> target agent name (may be null)
  const routes = new Map();

  for (const wf of searchList) {
    const nodeById = (id) => (wf.nodes || []).find((n) => n.id === id);

    // Resolve a node to the agent that will actually receive the handoff.
    // Agent nodes resolve directly; along a success path we step through
    // non-agent nodes (e.g. human_review) to the next agent.
    const agentOfNode = (node, followSuccess) => {
      if (!node) return null;
      if (node.type === "agent") {
        const inst = instByName(node.instance);
        return inst ? inst.agent : null;
      }
      if (!followSuccess) return null;
      const next = (wf.edges || []).find((e) => e.from === node.id && e.kind === "success");
      return next ? agentOfNode(nodeById(next.to), true) : null;
    };

    for (const node of wf.nodes || []) {
      if (node.type !== "agent") continue;
      const inst = instByName(node.instance);
      if (!inst || inst.agent !== agentType) continue;
      matchedInstances.push(node.instance);
      for (const s of inst.skills || []) skillSet.add(s);
      for (const edge of wf.edges || []) {
        if (edge.from !== node.id) continue;
        if (edge.kind === "success") {
          const target = agentOfNode(nodeById(edge.to), true);
          if (!routes.has("success")) routes.set("success", target);
        } else if (edge.kind === "condition" && edge.label) {
          // A condition edge needs a label to be routable; unlabeled ones are
          // skipped (the orchestrator can't match a HANDOFF line to them).
          if (!routes.has(edge.label)) routes.set(edge.label, agentOfNode(nodeById(edge.to), false));
        }
      }
    }
  }

  if (matchedInstances.length === 0) return null;

  // Record the generated instances in the session (best-effort).
  try {
    const generated = session.generated_instances || [];
    for (const name of matchedInstances) if (!generated.includes(name)) generated.push(name);
    writeSession(sessionPath, {
      workflow: activeWorkflowName || resolveWorkflowName(cfg),
      generated_instances: generated,
    });
  } catch {
    // Don't fail the hook on session write errors.
  }

  return {
    skills: Array.from(skillSet),
    routes: Array.from(routes, ([label, target]) => ({ label, target })),
    warning,
  };
}

(async () => {
  let payload = {};
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch {
    process.exit(0);
  }

  // SubagentStart provides agent_type (the subagent's `name` frontmatter value).
  const agentType = payload && payload.agent_type ? payload.agent_type : "";
  if (!agentType) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const cfg = readJson(path.join(projectDir, ".claude", "afk.json"));
  if (!cfg || cfg.version !== 3) process.exit(0);

  const sessionPath = path.join(projectDir, ".claude", "afk_session.json");
  const result = collect(cfg, sessionPath, agentType);
  if (!result) process.exit(0);

  const parts = [];
  if (result.warning) {
    parts.push(`⚠️ AFK warning: ${result.warning}`);
  }
  if (result.skills.length > 0) {
    parts.push(
      `Skills configured for the \`${agentType}\` agent instance in this project's afk.yaml (v3): ${result.skills.join(", ")}.\n\n` +
        `Load each one with the Skill tool before starting your work, then follow your agent file as written.`
    );
  }

  if (result.routes.length > 0) {
    const hasSuccess = result.routes.some((r) => r.label === "success");
    const lines = result.routes.map((r) => {
      const to = r.target ? ` (routes to \`${r.target}\`)` : "";
      return r.label === "success"
        ? `- \`HANDOFF: success\` — continue along the workflow's success path${to}.`
        : `- \`HANDOFF: ${r.label}\` — when that condition applies${to}.`;
    });
    parts.push(
      `Handoff routing for the \`${agentType}\` agent. End your final message with exactly one \`HANDOFF:\` line so ` +
        `the orchestrator can route deterministically:\n${lines.join("\n")}` +
        (hasSuccess ? "" : "\n(No success path leaves this node — it only feeds back via the condition above.)")
    );

    // Per-route payload protocol, sourced from templates/handoffs/<sender>/<target>.md
    // so the communication contract is owned here, not duplicated in the agent
    // files. Only emitted for routes whose target has a template.
    const protocols = [];
    for (const r of result.routes) {
      if (!r.target) continue;
      const proto = readHandoffProtocol(projectDir, agentType, r.target);
      if (!proto) continue;
      protocols.push(`Route \`HANDOFF: ${r.label}\` → \`${r.target}\`:\n\n${proto}`);
    }
    if (protocols.length > 0) {
      parts.push(
        `When you hand off, set the \`handoff_details\` field of your output JSON to the shape for the route you take ` +
          `(use \`null\` when nothing applies):\n\n${protocols.join("\n\n")}`
      );
    }
  }

  if (parts.length === 0) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: parts.join("\n\n---\n\n"),
      },
    })
  );
})();
