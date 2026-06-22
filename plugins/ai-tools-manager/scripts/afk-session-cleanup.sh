#!/usr/bin/env bash
# SessionEnd hook — two responsibilities:
#  1. Remove the ephemeral AFK session files (afk_session.json, afk_session.log.jsonl)
#     from the project's .claude/ directory. The source of truth (.claude/afk.json) and
#     the orchestrator agent (.claude/agents/afk.md) are intentionally preserved.
#  2. Tear down the persistent ai-tools-manager container — but only when the LAST
#     session ends. The container is host-global and shared across all concurrent
#     Claude sessions, so teardown is reference-counted: each session registers a
#     marker at SessionStart (afk-app-session-register.sh); we drop ours here and
#     only run `docker compose down` once no markers remain. This fixes the race
#     where one session ending killed the container other sessions were still using.
#     If the user already stopped the container manually, `down` is a harmless no-op.

set -euo pipefail

STDIN_DATA=$(cat)

cwd=$(echo "$STDIN_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null || echo "")
sid=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")

# 1. Ephemeral AFK session files (only when we know the cwd).
if [[ -n "$cwd" ]]; then
  rm -f "$cwd/.claude/afk_session.json" "$cwd/.claude/afk_session.log.jsonl"
fi

# 2. Reference-counted teardown. Drop this session's marker, then count what's left.
SESSIONS_DIR="/tmp/ai-tools-app.sessions"
[[ -n "$sid" ]] && rm -f "$SESSIONS_DIR/$sid"

remaining=0
if [[ -d "$SESSIONS_DIR" ]]; then
  remaining=$(find "$SESSIONS_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
fi

# Tear down only if WE started the app (state file present) AND no other session
# is still live. Without registration markers (remaining==0) this matches the old
# unconditional behavior — a safe fallback for sessions started before this hook.
STATE_FILE="/tmp/ai-tools-app.state"
if [[ -f "$STATE_FILE" && "$remaining" -eq 0 ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"  # sets COMPOSE_FILE
  if [[ -n "${COMPOSE_FILE:-}" && -f "$COMPOSE_FILE" ]]; then
    docker compose -f "$COMPOSE_FILE" -p ai-tools-manager down > /dev/null 2>&1 || true
  fi
  rm -f "$STATE_FILE" /tmp/ai-tools-result.json /tmp/ai-tools-marketplace.json
  rmdir "$SESSIONS_DIR" 2>/dev/null || true
fi

exit 0
