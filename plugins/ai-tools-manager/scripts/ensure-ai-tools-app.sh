#!/usr/bin/env bash
# Usage: ensure-ai-tools-app.sh [route]
# Idempotently bring the ai-tools-manager container up (building if needed) and,
# if a route is given, open the browser to it. Unlike the legacy one-shot launcher
# this does NOT block on a result file and does NOT tear the container down on exit —
# the app is now a persistent, project-scoped service. Teardown happens at SessionEnd
# (afk-session-cleanup.sh) once no markers remain, or manually from Docker Desktop.
#
# Re-runnable: the marketplace-data precompute runs on EVERY invocation so the container's
# readCwd() stays correct for the current session, even when the container is already up.
#
# Per-project isolation: each target project (keyed by cwd) gets its own compose project,
# port, and tmp channel files. Two Claude sessions in different repos run side by side
# without colliding. The port is allocated once per project and persisted in the state file.
set -euo pipefail

ROUTE="${1:-/}"
[[ "$ROUTE" != /* ]] && ROUTE="/$ROUTE"

# Locate the ai-dev-tools repo root (where the compose file and app source live).
# This is always the ai-dev-tools monorepo, NOT the target project.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
while [[ "$REPO_ROOT" != "/" && ! -f "$REPO_ROOT/turbo.json" ]]; do
  REPO_ROOT="$(dirname "$REPO_ROOT")"
done

if [[ ! -f "$REPO_ROOT/turbo.json" ]]; then
  echo '{"decision":"block","reason":"Could not locate repo root (no turbo.json found)."}'
  exit 0
fi

COMPOSE_FILE="$REPO_ROOT/apps/ai-tools-manager/docker-compose.yml"

# Per-project keys and paths (AFK_PROJECT_DIR defaults to $(pwd) = the target project).
# shellcheck source=lib/afk-app-paths.sh
source "$SCRIPT_DIR/lib/afk-app-paths.sh"

# Docker won't create a file where it expects one if a dir was left in its place.
[[ -d "$AFK_MARKETPLACE_FILE" ]] && rm -rf "$AFK_MARKETPLACE_FILE"

# Truncate the per-project result file here (once per ensure). wait-ai-tools-result.sh
# must NOT truncate: the dispatcher loop may re-invoke wait after a Bash-timeout kill,
# and truncating there would drop a result the user submitted during the gap.
[[ -d "$AFK_RESULT_FILE" ]] && rm -rf "$AFK_RESULT_FILE"
: > "$AFK_RESULT_FILE"

# Port: reuse the persisted port if this project's container is already known,
# otherwise find the first free port in the 3010-3099 range.
afk_load_state  # sets AFK_PORT + AFK_COMPOSE_FILE if state file exists
if [[ -z "${AFK_PORT:-}" ]]; then
  for _p in $(seq 3010 3099); do
    if ! lsof -iTCP:"$_p" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      AFK_PORT="$_p"
      break
    fi
  done
fi

if [[ -z "${AFK_PORT:-}" ]]; then
  echo '{"decision":"block","reason":"No free port found in range 3010-3099."}'
  exit 0
fi

# Pre-generate marketplace data on the host (container can't access arbitrary host paths).
# Captures cwd (the target project dir), the installable vibe-rules list, and the AFK
# seed env (implAgents / skillMap). Runs every time so data is current.
node -e "
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const home = process.env.HOME || '';
const knownPath = path.join(home, '.claude', 'plugins', 'known_marketplaces.json');
const implAgents = (process.env.AFK_IMPL_AGENTS || '').split(',').map(s => s.trim()).filter(Boolean);
let skillMap = {};
try { const m = JSON.parse(process.env.AFK_SKILL_MAP || '{}'); if (m && typeof m === 'object') skillMap = m; } catch {}
let vibeRules = [];
try {
  const out = execFileSync('vibe-rules', ['list'], { encoding: 'utf8' });
  vibeRules = out.split(/\r?\n/).map(l => { const m = l.match(/^\s*-\s+(.+?)\s*\$/); return m ? m[1] : null; }).filter(Boolean);
} catch {}
try {
  const known = JSON.parse(fs.readFileSync(knownPath, 'utf8'));
  const marketplaces = [], byMarketplace = {};
  for (const [name, mkt] of Object.entries(known)) {
    if (mkt.source?.source !== 'directory') continue;
    marketplaces.push(name);
    try {
      const mktJson = JSON.parse(fs.readFileSync(path.join(mkt.installLocation, '.claude-plugin', 'marketplace.json'), 'utf8'));
      byMarketplace[name] = (mktJson.plugins || []).map(p => p.name);
    } catch { byMarketplace[name] = []; }
  }
  fs.writeFileSync('$AFK_MARKETPLACE_FILE', JSON.stringify({marketplaces, byMarketplace, cwd: process.cwd(), vibeRules, implAgents, skillMap}));
} catch { fs.writeFileSync('$AFK_MARKETPLACE_FILE', JSON.stringify({marketplaces:[], byMarketplace:{}, cwd: process.cwd(), vibeRules, implAgents, skillMap})); }
" 2>/dev/null || echo '{"marketplaces":[],"byMarketplace":{},"cwd":"","vibeRules":[],"implAgents":[],"skillMap":{}}' > "$AFK_MARKETPLACE_FILE"

# Export per-project vars so docker-compose can interpolate them in the compose file.
export AFK_PROJECT_DIR AFK_PORT AFK_RESULT_FILE AFK_MARKETPLACE_FILE

# Bring the container up only if it isn't already serving on its port. `up -d --build`
# is a no-op rebuild when nothing changed, but skipping it when the app already responds
# avoids the rebuild cost on every ensure during a session.
if ! curl -sf "http://localhost:${AFK_PORT}/" > /dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" -p "$AFK_PROJECT_NAME" up -d --build >&2

  # Wait for the server to be ready
  DEADLINE=$(( $(date +%s) + 60 ))
  until curl -sf "http://localhost:${AFK_PORT}/" > /dev/null 2>&1; do
    if [[ $(date +%s) -gt $DEADLINE ]]; then
      echo '{"decision":"block","reason":"Forms container did not start in time."}'
      exit 0
    fi
    sleep 0.2
  done
fi

# Persist state so SessionEnd teardown and subsequent ensures can recover
# the compose file path, project name, and port for this project.
printf 'AFK_COMPOSE_FILE=%q\nAFK_PROJECT_NAME=%q\nAFK_PORT=%q\n' \
  "$COMPOSE_FILE" "$AFK_PROJECT_NAME" "$AFK_PORT" > "$AFK_STATE_FILE"

# Open the browser to the requested route
case "$(uname)" in
  Darwin) open "http://localhost:${AFK_PORT}${ROUTE}" ;;
  Linux)  xdg-open "http://localhost:${AFK_PORT}${ROUTE}" 2>/dev/null || true ;;
  MINGW*|CYGWIN*) start "http://localhost:${AFK_PORT}${ROUTE}" ;;
esac
