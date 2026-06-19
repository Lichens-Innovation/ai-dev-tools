#!/usr/bin/env node
// SubagentStart / SubagentStop hook — appends communication entries to the same
// afk_session.log.jsonl as afk-session-log.js (PreToolUse).
//
// SubagentStart  → dispatch entry:  who was called, with the full spawning message.
// SubagentStop   → handoff entry:   the agent's outcome, parsed from its HANDOFF: line,
//                                   with the full final message for debugging.
//
// Both are no-ops when afk.json is absent (AFK not configured for this project).
// Entries use kind:"dispatch"/"handoff" so the reader can distinguish them from
// the plain tool-call entries written by afk-session-log.js.
// Append-only to the same file so parallel subagents don't race.

const fs = require("fs");
const path = require("path");
const { readStdin, appendSessionLog } = require("./lib/afk-session");

// Parse the HANDOFF: label from the agent's final message.
// Tolerates backticks, asterisks, and surrounding whitespace, e.g.:
//   HANDOFF: success
//   `HANDOFF: success`
//   **HANDOFF: tests_failed**
// Takes the LAST occurrence so a model preamble doesn't shadow the terminal line.
function parseHandoff(msg) {
  if (!msg || typeof msg !== "string") return { status: "unknown", label: null };
  const matches = [...msg.matchAll(/[`*]*HANDOFF:\s*([^\n`*]+)[`*]*/gi)];
  if (matches.length === 0) return { status: "unknown", label: null };
  const raw = matches[matches.length - 1][1].trim();
  if (!raw) return { status: "unknown", label: null };
  const label = raw;
  const status = label.toLowerCase() === "success" ? "success" : "condition";
  return { status, label };
}

(async () => {
  let p = {};
  try {
    p = JSON.parse((await readStdin()) || "{}");
  } catch {
    process.exit(0);
  }

  const cwd = p.cwd || process.env.CLAUDE_PROJECT_DIR || "";
  if (!cwd) process.exit(0);

  const claudeDir = path.join(cwd, ".claude");
  if (!fs.existsSync(path.join(claudeDir, "afk.json"))) process.exit(0);

  const event = p.hook_event_name || "";
  const agentType = p.agent_type || "";
  const agentId = p.agent_id || "";
  const lastMsg = p.last_assistant_message || null;

  try {
    if (event === "SubagentStart") {
      appendSessionLog(claudeDir, {
        ts: new Date().toISOString(),
        origin: "main_session",
        kind: "dispatch",
        agent: agentType,
        agent_id: agentId,
        input: lastMsg,
        log: `→ ${agentType}`,
      });
    } else if (event === "SubagentStop") {
      const { status, label } = parseHandoff(lastMsg);
      appendSessionLog(claudeDir, {
        ts: new Date().toISOString(),
        origin: agentType || "unknown",
        kind: "handoff",
        agent_id: agentId,
        status,
        label,
        output: lastMsg,
        log: label ? `HANDOFF: ${label}` : "HANDOFF: (none)",
      });
    }
  } catch {
    // Best-effort — never fail the agent on a logging error.
  }

  process.exit(0);
})();
