#!/usr/bin/env node
// Installs the AFK orchestrator into a project. Idempotent — safe to re-run.
//   1. copies templates/afk.md      → <project>/.claude/agents/afk.md   (only if absent)
//   2. copies runtime scripts        → <project>/.claude/scripts/        (always refreshed)
//   3. merges { "agent": "afk" }     → <project>/.claude/settings.json   (preserves other keys)
//   4. ignores the ephemeral session files via <project>/.claude/.gitignore
//   5. renders frontmatter skills + AFK:HANDOFFS table from .claude/afk.json
//
//   node afk-install-orchestrator.js [projectDir]
//
// Run by the agents-framework-kickstarter skill after afk.json is written. Prints a
// JSON summary to stdout.

const fs = require("fs");
const path = require("path");
const { render } = require("./afk-render-orchestrator");

const projectDir = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const pluginRoot = path.resolve(__dirname, "..");

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

// Keep the ephemeral session state out of version control. The files are
// recreated each session and removed at SessionEnd, but a crash (no SessionEnd)
// can leave them behind as untracked noise in a consumer project.
function ensureGitignore(claudeDir) {
  const gitignorePath = path.join(claudeDir, ".gitignore");
  const entries = ["afk_session.json", "afk_session.log.jsonl"];
  const existed = fs.existsSync(gitignorePath);
  const existing = existed ? fs.readFileSync(gitignorePath, "utf8") : "";
  const present = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = entries.filter((e) => !present.has(e));
  if (missing.length === 0) return false;
  let block = missing.join("\n") + "\n";
  if (!existed) {
    block = "# AFK ephemeral session state — recreated each session, removed at SessionEnd\n" + block;
  } else if (existing && !existing.endsWith("\n")) {
    block = "\n" + block;
  }
  fs.appendFileSync(gitignorePath, block);
  return true;
}

function mergeSettingsAgent(settingsPath) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }
  if (settings.agent === "afk") return false;
  settings.agent = "afk";
  ensureDir(path.dirname(settingsPath));
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return true;
}

try {
  const claudeDir = path.join(projectDir, ".claude");
  const agentsDir = path.join(claudeDir, "agents");
  const scriptsDir = path.join(claudeDir, "scripts");
  ensureDir(agentsDir);
  ensureDir(scriptsDir);
  ensureDir(path.join(scriptsDir, "lib"));

  const installedAgent = copyIfMissing(
    path.join(pluginRoot, "templates", "afk.md"),
    path.join(agentsDir, "afk.md"),
  );

  // Runtime scripts the orchestrator / repo invoke via $CLAUDE_PROJECT_DIR.
  // Always refreshed so projects pick up plugin fixes.
  fs.copyFileSync(path.join(pluginRoot, "scripts", "afk-set-workflow.js"), path.join(scriptsDir, "afk-set-workflow.js"));
  fs.copyFileSync(
    path.join(pluginRoot, "scripts", "afk-render-orchestrator.js"),
    path.join(scriptsDir, "afk-render-orchestrator.js"),
  );
  fs.copyFileSync(
    path.join(pluginRoot, "scripts", "lib", "afk-session.js"),
    path.join(scriptsDir, "lib", "afk-session.js"),
  );

  const setAgentSetting = mergeSettingsAgent(path.join(claudeDir, "settings.json"));
  const wroteGitignore = ensureGitignore(claudeDir);
  const r = render(projectDir);

  process.stdout.write(
    JSON.stringify({
      ok: true,
      installedAgent,
      setAgentSetting,
      wroteGitignore,
      rendered: r.ok,
      renderReason: r.reason || null,
    }) + "\n",
  );
} catch (err) {
  process.stderr.write(`afk-install-orchestrator: ${err.message}\n`);
  process.exit(1);
}
