// Shared helpers for the Maestro hook scripts (maestro-inject-agent-context.js, maestro-session-log.js).
// Plain Node built-ins only — plugins ship without node_modules.

const fs = require("fs");
const path = require("path");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// Active workflow name resolution: an explicit name wins, otherwise the first
// configured workflow, otherwise "default".
function resolveWorkflowName(cfg, explicit) {
  if (explicit) return explicit;
  const workflows = (cfg && cfg.workflows) || [];
  return (workflows[0] && workflows[0].name) || "default";
}

function readSession(p) {
  return readJson(p) || { workflow: null, generated_instances: [] };
}

function writeSession(p, session) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
  fs.renameSync(tmp, p);
}

// ---------------------------------------------------------------------------
// Success-path helpers — shared between the renderer and the validation hook.
// ---------------------------------------------------------------------------

// Human-readable label for a single workflow node.
function nodeLabel(id, wf, instances) {
  if (id === "main-session") return "";
  const n = (wf.nodes || []).find((x) => x.id === id);
  if (!n) return id;
  if (n.type === "agent") {
    const inst = (instances || []).find((i) => i.name === n.instance);
    return "@" + ((inst && inst.name) || n.instance || n.id);
  }
  if (n.type === "skill") return "/" + (n.skill || n.id);
  return "human review";
}

// Ordered array of step labels along the success path of a workflow.
// This is the SOLE source of truth for "what steps the workflow has in order".
function successPathSteps(wf, instances) {
  const out = [];
  let cur = "main-session";
  const seen = new Set();
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = (wf.edges || []).find((e) => e.from === cur && e.kind === "success");
    if (!next) break;
    const label = nodeLabel(next.to, wf, instances);
    if (label) out.push(label);
    cur = next.to;
  }
  return out;
}

// Set of ALL node labels in the workflow (success path + condition targets).
// Used to distinguish "valid node, just off the success path" from "not in this workflow at all".
function workflowNodeLabels(wf, instances) {
  const labels = new Set();
  for (const n of wf.nodes || []) {
    const l = nodeLabel(n.id, wf, instances);
    if (l) labels.add(l);
  }
  return labels;
}

// Tool-call logs are append-only (one JSON object per line) so concurrent
// writers — e.g. parallel subagents firing PreToolUse — can't clobber each
// other the way a read-modify-write of a shared JSON array would.
const SESSION_LOG_FILE = "maestro_session.log.jsonl";

function sessionLogPath(claudeDir) {
  return path.join(claudeDir, SESSION_LOG_FILE);
}

function appendSessionLog(claudeDir, entry) {
  fs.appendFileSync(sessionLogPath(claudeDir), JSON.stringify(entry) + "\n");
}

module.exports = {
  readStdin,
  readJson,
  resolveWorkflowName,
  readSession,
  writeSession,
  appendSessionLog,
  sessionLogPath,
  SESSION_LOG_FILE,
  nodeLabel,
  successPathSteps,
  workflowNodeLabels,
};
