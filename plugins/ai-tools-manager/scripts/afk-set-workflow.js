#!/usr/bin/env node
// Sets the active workflow name in <cwd>/.claude/afk_session.json.
// Called by the AFK orchestrator at the start of each workflow execution:
//   node afk-set-workflow.js "<workflow name>"
//
// If no name is given, auto-resolves to the first configured workflow, else "default".
// Creates the session file if absent; preserves existing generated_instances.
//
// Self-contained on purpose: afk-install-orchestrator.js copies this file into the
// project's .claude/scripts/ so the orchestrator agent can run it via $CLAUDE_PROJECT_DIR.

const fs = require("fs");
const path = require("path");

const workflowName = process.argv[2] ?? null;
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const sessionPath = path.join(projectDir, ".claude", "afk_session.json");
const afkJsonPath = path.join(projectDir, ".claude", "afk.json");

function resolveWorkflowName(name) {
  if (name) return name;
  try {
    const cfg = JSON.parse(fs.readFileSync(afkJsonPath, "utf8"));
    const workflows = cfg.workflows ?? [];
    return (workflows[0] && workflows[0].name) || "default";
  } catch {
    // afk.json absent or unreadable
    return "default";
  }
}

try {
  const resolvedName = resolveWorkflowName(workflowName);

  let session = {};
  try {
    session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  } catch {
    // Start fresh
  }

  const updated = {
    workflow: resolvedName,
    generated_instances: session.generated_instances ?? [],
  };

  const claudeDir = path.join(projectDir, ".claude");
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const tmp = sessionPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(updated, null, 2));
  fs.renameSync(tmp, sessionPath);

  process.stdout.write(`AFK session: active workflow set to "${resolvedName}"\n`);
  process.exit(0);
} catch (err) {
  process.stderr.write(`afk-set-workflow: ${err.message}\n`);
  process.exit(1);
}
