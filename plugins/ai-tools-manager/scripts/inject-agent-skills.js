#!/usr/bin/env node
// PreToolUse hook for the Task tool.
// Reads <CLAUDE_PROJECT_DIR>/afk.yaml, looks up the invoked subagent's
// configured skills, and emits them as additionalContext.
// No-op (exit 0, empty output) when afk.yaml is absent or the subagent is unmapped.

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

// Minimal parser for the afk.yaml shape we control. Extracts agents[].id +
// agents[].skills and skills[].id + skills[].source. Tolerant of extra keys.
function parseAfk(text) {
  const lines = text.split(/\r?\n/);
  const agents = [];
  const skills = [];
  let section = null; // "agents" | "skills" | null
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    if (section === "agents") agents.push(current);
    else if (section === "skills") skills.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Top-level key (no indent).
    const topMatch = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ")) {
      pushCurrent();
      const [, key] = topMatch;
      section = key === "agents" || key === "skills" ? key : null;
      continue;
    }

    if (!section) continue;

    // New list item under the current section.
    const itemStart = line.match(/^\s+-\s+(.*)$/);
    if (itemStart) {
      pushCurrent();
      current = {};
      const rest = itemStart[1];
      const kv = rest.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
      if (kv) assignField(current, kv[1], kv[2]);
      continue;
    }

    // Continuation line of the current item.
    const cont = line.match(/^\s+([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (cont && current) assignField(current, cont[1], cont[2]);
  }
  pushCurrent();

  return { agents, skills };
}

function assignField(obj, key, value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    obj[key] = trimmed
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  } else {
    obj[key] = trimmed.replace(/^["']|["']$/g, "");
  }
}

(async () => {
  const stdin = await readStdin();
  let payload = {};
  try {
    payload = JSON.parse(stdin || "{}");
  } catch {
    process.exit(0);
  }

  const subagentType =
    payload?.tool_input?.subagent_type ||
    payload?.tool_input?.subagentType ||
    "";
  if (!subagentType) process.exit(0);

  const projectDir =
    process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
  const afkPath = path.join(projectDir, "afk.yaml");
  if (!fs.existsSync(afkPath)) process.exit(0);

  let config;
  try {
    config = parseAfk(fs.readFileSync(afkPath, "utf8"));
  } catch {
    process.exit(0);
  }

  const agent = config.agents.find((a) => a.id === subagentType);
  if (!agent || !Array.isArray(agent.skills) || agent.skills.length === 0) {
    process.exit(0);
  }

  const skillList = agent.skills.join(", ");
  const additionalContext =
    `Skills configured for the \`${subagentType}\` subagent in this project's afk.yaml: ${skillList}.\n\n` +
    `Load each one with the Skill tool before starting your work, then follow your agent file as written.`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext,
      },
    }),
  );
})();
