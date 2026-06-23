#!/usr/bin/env node
// Uninstalls / disables the Maestro orchestrator in a project. The inverse of
// maestro-install.js. Idempotent — safe to re-run.
//
//   node maestro-uninstall.js [projectDir] [--purge]
//
// Default: removes the bash-validation PreToolUse hook from
//   <project>/.claude/settings.json (only the keys Maestro added; all other keys
//   are preserved), deletes the ephemeral session files, and cleans up any
//   legacy `agent: "maestro"` key left by older installs.
// --purge: additionally removes the installed orchestrator skill, the
//   project-copied runtime scripts, and the user-authored config (maestro.json) —
//   i.e. everything the install pipeline produced.
//
// Default (no --purge): never touches maestro.json — that is the user-authored
// config and is kept so a later /maestro-install or /maestro-update can restore things.
// Prints a JSON summary to stdout.

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const purge = args.includes("--purge");
const projectDir = args.find((a) => !a.startsWith("--")) || process.env.CLAUDE_PROJECT_DIR || process.cwd();

const BASH_VALIDATION_COMMAND = "$CLAUDE_PROJECT_DIR/.claude/scripts/bash-validation.sh";

// Strip our bash-validation hook from the PreToolUse list, dropping any Bash
// matcher entry left empty afterwards. Returns true if anything changed.
function removeBashValidationHook(settings) {
  const pre = settings.hooks && settings.hooks.PreToolUse;
  if (!Array.isArray(pre)) return false;
  let changed = false;
  for (const entry of pre) {
    if (!entry || !Array.isArray(entry.hooks)) continue;
    const before = entry.hooks.length;
    entry.hooks = entry.hooks.filter((h) => !(h && h.command === BASH_VALIDATION_COMMAND));
    if (entry.hooks.length !== before) changed = true;
  }
  if (changed) {
    settings.hooks.PreToolUse = pre.filter(
      (e) => !(e && e.matcher === "Bash" && Array.isArray(e.hooks) && e.hooks.length === 0)
    );
  }
  return changed;
}

// Removes the bash-validation hook (and any legacy `agent: "maestro"` from older
// installs) from settings.json in one read/write. Returns which keys were touched.
function cleanSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return { removedAgentSetting: false, removedBashHook: false };
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return { removedAgentSetting: false, removedBashHook: false };
  }
  let removedAgentSetting = false;
  if (settings.agent === "maestro") {
    delete settings.agent;
    removedAgentSetting = true;
  }
  const removedBashHook = removeBashValidationHook(settings);
  if (removedAgentSetting || removedBashHook) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
  return { removedAgentSetting, removedBashHook };
}

function removeIfPresent(p) {
  if (!fs.existsSync(p)) return false;
  fs.rmSync(p, { recursive: true, force: true });
  return true;
}

try {
  const claudeDir = path.join(projectDir, ".claude");

  const { removedAgentSetting, removedBashHook } = cleanSettings(path.join(claudeDir, "settings.json"));
  const removedSession = [
    removeIfPresent(path.join(claudeDir, "maestro_session.json")),
    removeIfPresent(path.join(claudeDir, "maestro_session.log.jsonl")),
  ].some(Boolean);

  const purged = [];
  if (purge) {
    const targets = [
      path.join(claudeDir, "skills", "maestro", "SKILL.md"),
      path.join(claudeDir, "scripts", "maestro-set-session-workflow.cjs"),
      path.join(claudeDir, "scripts", "maestro-render-orchestrator.cjs"),
      path.join(claudeDir, "scripts", "bash-validation.sh"),
      path.join(claudeDir, "scripts", "lib", "maestro-session.cjs"),
      path.join(claudeDir, "maestro.json"),
    ];
    for (const t of targets) if (removeIfPresent(t)) purged.push(path.relative(projectDir, t));
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      removedAgentSetting,
      removedBashHook,
      removedSession,
      purged: purge ? purged : null,
      keptConfig: !purge,
    }) + "\n"
  );
} catch (err) {
  process.stderr.write(`maestro-uninstall: ${err.message}\n`);
  process.exit(1);
}
