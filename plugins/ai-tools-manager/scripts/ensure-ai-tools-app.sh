#!/usr/bin/env bash
# Usage: ensure-ai-tools-app.sh [route]
# Idempotently bring the ai-tools-manager container up (building if needed) and,
# if a route is given, open the browser to it. Unlike the legacy one-shot launcher
# this does NOT block on a result file and does NOT tear the container down on exit —
# the app is now a persistent, session-scoped service. Teardown happens at SessionEnd
# (afk-session-cleanup.sh) via the state file written here, or manually from Docker Desktop.
#
# Re-runnable: the marketplace-data precompute runs on EVERY invocation so the container's
# readCwd()/repoRoot stay correct for the current session, even when the container is already up.
set -euo pipefail

ROUTE="${1:-/}"
[[ "$ROUTE" != /* ]] && ROUTE="/$ROUTE"
PORT=3009

# Find repo root (directory containing turbo.json)
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
MARKETPLACE_FILE="/tmp/ai-tools-marketplace.json"
STATE_FILE="/tmp/ai-tools-app.state"

# Docker won't create a file where it expects one if a dir was left in its place.
[[ -d "$MARKETPLACE_FILE" ]] && rm -rf "$MARKETPLACE_FILE"
# The result file is mounted into the container; ensure it exists as a file and start CLEAN.
# Truncation lives here (once per ensure), not in wait-ai-tools-result.sh: the dispatcher loop
# may re-invoke wait after a Bash-timeout kill, and truncating on each wait would drop a result
# the user submitted during the gap.
RESULT_FILE="/tmp/ai-tools-result.json"
[[ -d "$RESULT_FILE" ]] && rm -rf "$RESULT_FILE"
: > "$RESULT_FILE"

# Pre-generate marketplace data on the host (container can't access host paths).
# Captures cwd (the current Claude working dir), repoRoot, the installable vibe-rules
# list, and the AFK seed env (implAgents / skillMap). Runs every time so cwd is current.
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
  fs.writeFileSync('$MARKETPLACE_FILE', JSON.stringify({marketplaces, byMarketplace, cwd: process.cwd(), repoRoot: '$REPO_ROOT', vibeRules, implAgents, skillMap}));
} catch { fs.writeFileSync('$MARKETPLACE_FILE', JSON.stringify({marketplaces:[], byMarketplace:{}, cwd: process.cwd(), repoRoot: '$REPO_ROOT', vibeRules, implAgents, skillMap})); }
" 2>/dev/null || echo '{"marketplaces":[],"byMarketplace":{},"cwd":"","repoRoot":"","vibeRules":[],"implAgents":[],"skillMap":{}}' > "$MARKETPLACE_FILE"

# Bring the container up only if it isn't already serving. `up -d --build` is a no-op
# rebuild when nothing changed, but skipping it when the app already responds avoids the
# rebuild cost on every ensure during a session.
if ! curl -sf "http://localhost:${PORT}/" > /dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" up -d --build >&2

  # Wait for the server to be ready
  DEADLINE=$(( $(date +%s) + 60 ))
  until curl -sf "http://localhost:${PORT}/" > /dev/null 2>&1; do
    if [[ $(date +%s) -gt $DEADLINE ]]; then
      echo '{"decision":"block","reason":"Forms container did not start in time."}'
      exit 0
    fi
    sleep 0.2
  done
fi

# Record that this host started/owns the app, so SessionEnd teardown knows to stop it
# and which compose file to use. Presence of this file == "we own teardown".
printf 'COMPOSE_FILE=%q\n' "$COMPOSE_FILE" > "$STATE_FILE"

# Open the browser to the requested route
case "$(uname)" in
  Darwin) open "http://localhost:${PORT}${ROUTE}" ;;
  Linux)  xdg-open "http://localhost:${PORT}${ROUTE}" 2>/dev/null || true ;;
  MINGW*|CYGWIN*) start "http://localhost:${PORT}${ROUTE}" ;;
esac
