#!/usr/bin/env bash
# Usage: gather-info.sh <form-name>
# e.g.   gather-info.sh create-skill
set -euo pipefail

FORM_NAME="${1:?Usage: gather-info.sh <form-name>}"
FORM_PATH="/$FORM_NAME"
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
RESULT_FILE="/tmp/ai-tools-result.json"
MARKETPLACE_FILE="/tmp/ai-tools-marketplace.json"

# Ensure the result file exists as a file (Docker won't create a dir in its place)
[[ -d "$RESULT_FILE" ]] && rm -rf "$RESULT_FILE"
> "$RESULT_FILE"
trap 'docker compose -f "$COMPOSE_FILE" down > /dev/null 2>&1 || true; rm -f "$RESULT_FILE" "$MARKETPLACE_FILE"' EXIT

# Pre-generate marketplace data on the host (container can't access host paths)
# Also captures cwd so forms can use it as a default (e.g. targetDir in create-marketplace)
node -e "
const fs = require('fs'), path = require('path');
const home = process.env.HOME || '';
const knownPath = path.join(home, '.claude', 'plugins', 'known_marketplaces.json');
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
  fs.writeFileSync('$MARKETPLACE_FILE', JSON.stringify({marketplaces, byMarketplace, cwd: process.cwd()}));
} catch { fs.writeFileSync('$MARKETPLACE_FILE', JSON.stringify({marketplaces:[], byMarketplace:{}, cwd: process.cwd()})); }
" 2>/dev/null || echo '{"marketplaces":[],"byMarketplace":{},"cwd":""}' > "$MARKETPLACE_FILE"

# Start the container (builds image if needed)
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

# Open the browser
case "$(uname)" in
  Darwin) open "http://localhost:${PORT}${FORM_PATH}" ;;
  Linux)  xdg-open "http://localhost:${PORT}${FORM_PATH}" 2>/dev/null || true ;;
  MINGW*|CYGWIN*) start "http://localhost:${PORT}${FORM_PATH}" ;;
esac

# Wait for the result file to be populated
until [[ -s "$RESULT_FILE" ]]; do
  sleep 0.2
done

cat "$RESULT_FILE"
