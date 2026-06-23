#!/usr/bin/env node
// Re-renders the generated region of the project's Maestro orchestrator skill
// (.claude/skills/maestro/SKILL.md) from .claude/maestro.json:
//   - the <!-- Maestro:HANDOFFS --> table   ← workflows + derived success paths
//
//   node maestro-render-orchestrator.cjs [projectDir]
//
// Invoked by the /maestro-app skill (on form save) and by the /maestro-update skill.

const fs = require("fs");
const path = require("path");
const { readJson } = require("./lib/maestro-session.cjs");

// Derived success path (never stored in maestro.json) for a single workflow.
// This is the SOLE implementation — the success path is computed here at render
// time and written into the orchestrator's Maestro:HANDOFFS table. Labels: "@<instance>"
// for agent nodes, "/<skill>" for skill nodes, "human review" for review nodes,
// joined by " → ".
function successPath(wf, instances) {
  const labelFor = (id) => {
    if (id === "main-session") return "";
    const n = (wf.nodes || []).find((x) => x.id === id);
    if (!n) return id;
    if (n.type === "agent") {
      const inst = instances.find((i) => i.name === n.instance);
      return "@" + ((inst && inst.name) || n.instance || n.id);
    }
    if (n.type === "skill") return "/" + (n.skill || n.id);
    return "human review";
  };
  const out = [];
  let cur = "main-session";
  const seen = new Set();
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = (wf.edges || []).find((e) => e.from === cur && e.kind === "success");
    if (!next) break;
    const label = labelFor(next.to);
    if (label) out.push(label);
    cur = next.to;
  }
  return out.join(" → ");
}

function handoffTable(cfg) {
  const instances = cfg.workflow_instances || [];
  const workflows = cfg.workflows || [];
  if (workflows.length === 0) {
    return "# No workflows configured yet. Run /maestro-install to set up.";
  }
  const rows = workflows.map((wf) => {
    const sp = successPath(wf, instances) || "(no steps configured)";
    return `| ${wf.name || "unnamed"} | ${sp} |`;
  });
  return ["| Workflow | Success path |", "| --- | --- |", ...rows].join("\n");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceRegion(text, start, end, replacement) {
  const re = new RegExp(`${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}`);
  if (!re.test(text)) return text;
  return text.replace(re, `${start}\n${replacement}\n${end}`);
}

function render(projectDir) {
  const cfg = readJson(path.join(projectDir, ".claude", "maestro.json"));
  if (!cfg) return { ok: false, reason: "maestro.json not found" };
  const skillPath = path.join(projectDir, ".claude", "skills", "maestro", "SKILL.md");
  if (!fs.existsSync(skillPath)) return { ok: false, reason: "maestro/SKILL.md not found" };

  let text = fs.readFileSync(skillPath, "utf8");
  text = replaceRegion(text, "<!-- Maestro:HANDOFFS:START -->", "<!-- Maestro:HANDOFFS:END -->", handoffTable(cfg));
  fs.writeFileSync(skillPath, text);
  return { ok: true };
}

if (require.main === module) {
  const dir = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const r = render(dir);
  if (!r.ok) {
    process.stderr.write(`maestro-render-orchestrator: ${r.reason}\n`);
    process.exit(1);
  }
  process.stdout.write("Maestro orchestrator skill re-rendered from .claude/maestro.json\n");
}

module.exports = { render, successPath, handoffTable };
