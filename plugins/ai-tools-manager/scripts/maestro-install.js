#!/usr/bin/env node
// Scaffolds the AFK orchestrator into a project. Idempotent — safe to re-run.
//   1. copies templates/agent-orchestrator/SKILL.md → <project>/.claude/skills/agent-orchestrator/SKILL.md  (only if absent)
//   2. copies runtime scripts        → <project>/.claude/scripts/        (always refreshed)
//   3. merges the bash-validation PreToolUse hook → <project>/.claude/settings.json (preserves other keys)
//   4. adds an `# AFK` section to the repo-root .gitignore ignoring every nested
//      .claude/afk_session*.{json,jsonl} across the repo / monorepo (the `**/` glob covers
//      root-level .claude/ too, so no per-package .gitignore is needed)
//
// Scaffolding only — it does NOT render the orchestrator skill's managed region. Rendering
// needs afk.json (written by the form) and is done afterwards by afk-render-orchestrator.cjs
// (the /afk skill runs it; /afk-sync wraps it standalone). The /afk-install skill
// runs this first to lay down the skill, then hands off to /afk to author + render.
//
//   node afk-install.js [projectDir]
//
// Run by the afk-install skill before the config is authored. Prints a JSON summary to stdout.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectDir = process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const pluginRoot = path.resolve(__dirname, "..");

const GITIGNORE_HEADER = "# AFK ephemeral session state — recreated each session, removed at SessionEnd";

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

// Append any missing `entries` to the .gitignore at `gitignorePath`, under the
// AFK header (added only if not already present). Returns true if it changed.
function appendGitignoreEntries(gitignorePath, entries) {
  const existed = fs.existsSync(gitignorePath);
  const existing = existed ? fs.readFileSync(gitignorePath, "utf8") : "";
  const present = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = entries.filter((e) => !present.has(e));
  if (missing.length === 0) return false;
  const needsHeader = !present.has(GITIGNORE_HEADER);
  let block = (needsHeader ? GITIGNORE_HEADER + "\n" : "") + missing.join("\n") + "\n";
  if (existed && existing && !existing.endsWith("\n")) block = "\n" + block;
  ensureDir(path.dirname(gitignorePath));
  fs.appendFileSync(gitignorePath, block);
  return true;
}

// Keep the ephemeral session state out of version control. The files are
// Resolve the git toplevel from the project dir, or null if not a git repo.
function findRepoRoot(startDir) {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Belt-and-suspenders for monorepos: ignore EVERY nested .claude session file
// across the whole tree from the repo-root .gitignore. The `**/` globs match
// .claude/ at any depth (including the root), so a session log left behind in
// any package is covered without a per-package .claude/.gitignore.
function ensureRepoRootGitignore(repoRoot) {
  if (!repoRoot) return false;
  return appendGitignoreEntries(path.join(repoRoot, ".gitignore"), [
    "**/.claude/afk_session.json",
    "**/.claude/afk_session.log.jsonl",
  ]);
}

const BASH_VALIDATION_COMMAND = "$CLAUDE_PROJECT_DIR/.claude/scripts/bash-validation.sh";

// Register the .env-read guard as a PreToolUse hook on the Bash tool. Reuses an
// existing Bash matcher when present so we don't clobber user-defined hooks.
function ensureBashValidationHook(settings) {
  settings.hooks = settings.hooks || {};
  const pre = settings.hooks.PreToolUse || (settings.hooks.PreToolUse = []);
  const hasHook = pre.some(
    (e) => e && Array.isArray(e.hooks) && e.hooks.some((h) => h && h.command === BASH_VALIDATION_COMMAND)
  );
  if (hasHook) return false;
  let bashEntry = pre.find((e) => e && e.matcher === "Bash" && Array.isArray(e.hooks));
  if (!bashEntry) {
    bashEntry = { matcher: "Bash", hooks: [] };
    pre.push(bashEntry);
  }
  bashEntry.hooks.push({ type: "command", command: BASH_VALIDATION_COMMAND });
  return true;
}

// Merge the bash-validation hook into settings.json, preserving all other keys.
function mergeSettings(settingsPath) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }
  const setBashHook = ensureBashValidationHook(settings);
  if (setBashHook) {
    ensureDir(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
  return { setBashHook };
}

try {
  const claudeDir = path.join(projectDir, ".claude");
  const orchestratorSkillDir = path.join(claudeDir, "skills", "agent-orchestrator");
  const scriptsDir = path.join(claudeDir, "scripts");
  ensureDir(orchestratorSkillDir);
  ensureDir(scriptsDir);
  ensureDir(path.join(scriptsDir, "lib"));

  const installedOrchestratorSkill = copyIfMissing(
    path.join(pluginRoot, "templates", "agent-orchestrator", "SKILL.md"),
    path.join(orchestratorSkillDir, "SKILL.md")
  );

  // Runtime scripts the orchestrator / repo invoke via $CLAUDE_PROJECT_DIR.
  // They run in-place inside the project, whose package.json may declare
  // "type": "module" — so they must be .cjs to stay CommonJS regardless.
  // Always refreshed so projects pick up plugin fixes.
  fs.copyFileSync(
    path.join(pluginRoot, "scripts", "afk-set-session-workflow.cjs"),
    path.join(scriptsDir, "afk-set-session-workflow.cjs")
  );
  fs.copyFileSync(
    path.join(pluginRoot, "scripts", "afk-render-orchestrator.cjs"),
    path.join(scriptsDir, "afk-render-orchestrator.cjs")
  );
  fs.copyFileSync(
    path.join(pluginRoot, "scripts", "lib", "afk-session.cjs"),
    path.join(scriptsDir, "lib", "afk-session.cjs")
  );

  // PreToolUse Bash guard that blocks reading .env secret files. Copied with its
  // executable bit so the hook can run it directly.
  const bashValidationDest = path.join(scriptsDir, "bash-validation.sh");
  fs.copyFileSync(path.join(pluginRoot, "scripts", "bash-validation.sh"), bashValidationDest);
  fs.chmodSync(bashValidationDest, 0o755);

  const { setBashHook } = mergeSettings(path.join(claudeDir, "settings.json"));
  const wroteRepoGitignore = ensureRepoRootGitignore(findRepoRoot(projectDir));

  process.stdout.write(
    JSON.stringify({
      ok: true,
      installedOrchestratorSkill,
      setBashHook,
      wroteRepoGitignore,
    }) + "\n"
  );
} catch (err) {
  process.stderr.write(`afk-install: ${err.message}\n`);
  process.exit(1);
}
