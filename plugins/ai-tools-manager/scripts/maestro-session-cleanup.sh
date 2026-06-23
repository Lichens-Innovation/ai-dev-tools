#!/usr/bin/env bash
# SessionEnd hook — two responsibilities:
#  1. Remove the ephemeral Maestro session files (maestro_session.json, maestro_session.log.jsonl)
#     from the project's .claude/ directory. The source of truth (.claude/maestro.json) and
#     the orchestrator agent (.claude/agents/maestro.md) are intentionally preserved.
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

# 1. Ephemeral Maestro session files (only when we know the cwd).
if [[ -n "$cwd" ]]; then
  rm -f "$cwd/.claude/maestro_session.json" "$cwd/.claude/maestro_session.log.jsonl"
fi

# 2. Per-project reference-counted teardown.
if [[ -n "$cwd" ]]; then
  # Derive per-project paths from the session cwd.
  MAESTRO_PROJECT_DIR="$cwd"
  # shellcheck source=lib/maestro-app-paths.sh
  source "$SCRIPT_DIR/lib/maestro-app-paths.sh"

  # Drop this session's marker.
  [[ -n "$sid" ]] && rm -f "$MAESTRO_SESSIONS_DIR/$sid"

  # Count remaining live sessions for this project.
  remaining=0
  if [[ -d "$MAESTRO_SESSIONS_DIR" ]]; then
    remaining=$(find "$MAESTRO_SESSIONS_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')
  fi

  # Tear down only if WE started the app (state file present) AND no other session
  # for this project is still live.
  maestro_load_state  # sets MAESTRO_COMPOSE_FILE, MAESTRO_PROJECT_NAME, MAESTRO_PORT
  if [[ -f "$MAESTRO_STATE_FILE" && "$remaining" -eq 0 ]]; then
    if [[ -n "${MAESTRO_COMPOSE_FILE:-}" && -f "$MAESTRO_COMPOSE_FILE" ]]; then
      docker compose -f "$MAESTRO_COMPOSE_FILE" -p "$MAESTRO_PROJECT_NAME" down > /dev/null 2>&1 || true
    fi
    rm -f "$MAESTRO_STATE_FILE" "$MAESTRO_MARKETPLACE_FILE" "$MAESTRO_RESULT_FILE"
  fi

  # Clean up the now-empty sessions dir regardless (no-op if non-empty or absent).
  rmdir "$MAESTRO_SESSIONS_DIR" 2>/dev/null || true
fi

exit 0
