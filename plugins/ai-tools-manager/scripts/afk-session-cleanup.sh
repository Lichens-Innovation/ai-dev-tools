#!/usr/bin/env bash
# SessionEnd hook — two responsibilities:
#  1. Remove the ephemeral AFK session files (afk_session.json, afk_session.log.jsonl)
#     from the project's .claude/ directory. The source of truth (.claude/afk.json) and
#     the orchestrator agent (.claude/agents/afk.md) are intentionally preserved.
#  2. Tear down the persistent ai-tools-manager container IF this host started it this
#     session — signalled by /tmp/ai-tools-app.state (written by ensure-ai-tools-app.sh).
#     If the user already stopped the container manually from Docker Desktop, `down` is a
#     harmless no-op. The state/result/marketplace tmp files are cleaned up regardless.

set -euo pipefail

STDIN_DATA=$(cat)

cwd=$(echo "$STDIN_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null || echo "")

# 1. Ephemeral AFK session files (only when we know the cwd).
if [[ -n "$cwd" ]]; then
  rm -f "$cwd/.claude/afk_session.json" "$cwd/.claude/afk_session.log.jsonl"
fi

# 2. Persistent app teardown — only if we own it (state file present).
STATE_FILE="/tmp/ai-tools-app.state"
if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"  # sets COMPOSE_FILE
  if [[ -n "${COMPOSE_FILE:-}" && -f "$COMPOSE_FILE" ]]; then
    docker compose -f "$COMPOSE_FILE" -p ai-tools-manager down > /dev/null 2>&1 || true
  fi
  rm -f "$STATE_FILE" /tmp/ai-tools-result.json /tmp/ai-tools-marketplace.json
fi

exit 0
