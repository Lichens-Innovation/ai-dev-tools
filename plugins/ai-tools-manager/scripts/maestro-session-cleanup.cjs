#!/usr/bin/env node
// SessionEnd hook — the PROJECT-LOCAL cleanup, copied into <project>/.claude/scripts/ by the
// desktop app's installer (packages/maestro-core/src/install.ts).
//
// It removes the ephemeral Maestro session files and nothing else:
//   maestro_session.json, maestro_session.log.jsonl, maestro_session_tasks.json
// The source of truth (.claude/maestro.json) and the orchestrator skill are kept.
//
// Why this exists next to maestro-session-cleanup.sh: that one ALSO tears down the per-project
// ai-tools-manager container (reference-counted docker compose down) and sources
// lib/maestro-app-paths.sh. Both are the plugin's business. A project-local copy would `source`
// a file the project doesn't have and, under `set -euo pipefail`, fail the hook on every session
// end — and a project configured from the desktop app has no container to tear down anyway.
//
// Node rather than bash: every other project-local hook is node, and the .sh shells out to
// python3 to parse the payload, which a project cannot assume is installed.
//
// Reads the hook payload on stdin; no-op when it carries no cwd.

const fs = require("fs");
const path = require("path");
const { readStdin } = require("./lib/maestro-session.cjs");

const EPHEMERAL = ["maestro_session.json", "maestro_session.log.jsonl", "maestro_session_tasks.json"];

async function main() {
  let payload = {};
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch {
    return;
  }
  const cwd = payload.cwd;
  if (!cwd) return;
  for (const name of EPHEMERAL) {
    try {
      fs.rmSync(path.join(cwd, ".claude", name), { force: true });
    } catch {
      // A session file we cannot delete is not worth failing the session's exit over.
    }
  }
}

main().then(
  () => process.exit(0),
  () => process.exit(0),
);
