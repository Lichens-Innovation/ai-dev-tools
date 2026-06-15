#!/usr/bin/env node
// Uninstalls / disables the AFK orchestrator in a project. The inverse of
// afk-install-orchestrator.js. Idempotent — safe to re-run.
//
//   node afk-uninstall.js [projectDir] [--purge]
//
// Default: removes the `agent: "afk"` key from <project>/.claude/settings.json
//   (only when it equals "afk"; all other keys are preserved), and deletes the
//   ephemeral session files. New sessions stop adopting the orchestrator.
// --purge: additionally removes the installed orchestrator agent and the
//   project-copied runtime scripts.
//
// Never touches afk.json / afk.yaml — that is the user-authored config and is
// kept so a later /agents-framework-kickstarter or /afk-sync can restore things.
// Prints a JSON summary to stdout.

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const purge = args.includes("--purge");
const projectDir = args.find((a) => !a.startsWith("--")) || process.env.CLAUDE_PROJECT_DIR || process.cwd();

function removeAgentSetting(settingsPath) {
  if (!fs.existsSync(settingsPath)) return false;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return false;
  }
  if (settings.agent !== "afk") return false;
  delete settings.agent;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return true;
}

function removeIfPresent(p) {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

try {
  const claudeDir = path.join(projectDir, ".claude");

  const removedAgentSetting = removeAgentSetting(path.join(claudeDir, "settings.json"));
  const removedSession =
    [
      removeIfPresent(path.join(claudeDir, "afk_session.json")),
      removeIfPresent(path.join(claudeDir, "afk_session.log.jsonl")),
    ].some(Boolean);

  const purged = [];
  if (purge) {
    const targets = [
      path.join(claudeDir, "agents", "afk.md"),
      path.join(claudeDir, "scripts", "afk-set-workflow.js"),
      path.join(claudeDir, "scripts", "afk-render-orchestrator.js"),
      path.join(claudeDir, "scripts", "lib", "afk-session.js"),
    ];
    for (const t of targets) if (removeIfPresent(t)) purged.push(path.relative(projectDir, t));
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      removedAgentSetting,
      removedSession,
      purged: purge ? purged : null,
      keptConfig: true,
    }) + "\n",
  );
} catch (err) {
  process.stderr.write(`afk-uninstall: ${err.message}\n`);
  process.exit(1);
}
