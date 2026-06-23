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
};
