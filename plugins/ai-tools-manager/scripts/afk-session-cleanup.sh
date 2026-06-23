#!/usr/bin/env bash
# SessionEnd hook — two responsibilities:
#  1. Remove the ephemeral AFK session files (afk_session.json, afk_session.log.jsonl)
#     from the project's .claude/ directory. The source of truth (.claude/afk.json) and
#     the orchestrator agent (.claude/agents/afk.md) are intentionally preserved.
#  2. Tear down the per-project ai-tools-manager container — but only when the LAST
#     session for that project ends. Each project has its own compose project, port,
#     and reference-counted sessions dir: we drop this session's marker and only run
#     `docker compose down` once no markers remain for that project. Other projects'
#     containers are never touched. If the user already stopped the container manually,
#     `down` is a harmless no-op.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STDIN_DATA=$(cat)

cwd=$(echo "$STDIN_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null || echo "")
sid=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")

# 1. Ephemeral AFK session files (only when we know the cwd).
if [[ -n "$cwd" ]]; then
  rm -f "$cwd/.claude/afk_session.json" "$cwd/.claude/afk_session.log.jsonl"
fi

# 2. Per-project reference-counted teardown.
if [[ -n "$cwd" ]]; then
  # Derive per-project paths from the session cwd.
  AFK_PROJECT_DIR="$cwd"
  # shellcheck source=lib/afk-app-paths.sh
  source "$SCRIPT_DIR/lib/afk-app-paths.sh"

  # Drop this session's marker.
  [[ -n "$sid" ]] && rm -f "$AFK_SESSIONS_DIR/$sid"

  # Count remaining live sessions for this project.
  remaining=0
  if [[ -d "$AFK_SESSIONS_DIR" ]]; then
    remaining=$(find "$AFK_SESSIONS_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
  fi

  # Tear down only if WE started the app (state file present) AND no other session
  # for this project is still live.
  afk_load_state  # sets AFK_COMPOSE_FILE, AFK_PROJECT_NAME, AFK_PORT
  if [[ -f "$AFK_STATE_FILE" && "$remaining" -eq 0 ]]; then
    if [[ -n "${AFK_COMPOSE_FILE:-}" && -f "$AFK_COMPOSE_FILE" ]]; then
      docker compose -f "$AFK_COMPOSE_FILE" -p "$AFK_PROJECT_NAME" down > /dev/null 2>&1 || true
    fi
    rm -f "$AFK_STATE_FILE" "$AFK_MARKETPLACE_FILE" "$AFK_RESULT_FILE"
  fi

  # Clean up the now-empty sessions dir regardless (no-op if non-empty or absent).
  rmdir "$AFK_SESSIONS_DIR" 2>/dev/null || true
fi

exit 0
