#!/usr/bin/env bash
# SessionStart hook — register this session as a live user of the persistent,
# host-global ai-tools-manager container, via a per-session marker file under
# /tmp/ai-tools-app.sessions/. The SessionEnd cleanup (afk-session-cleanup.sh)
# drops this session's marker and only tears the container down when NO markers
# remain — so the shared app survives until the LAST session ends, not the first.
#
# This fixes the host-global teardown race: previously any one session ending ran
# `docker compose down` on the container other live sessions were still using.
#
# Reference counting (one file per session) is race-free across concurrent
# sessions — no read-modify-write of a shared counter. A session that crashes
# without a SessionEnd leaves a stale marker; the escape hatch is the in-app Stop
# button or a manual stop from Docker Desktop.
set -euo pipefail

STDIN_DATA=$(cat)
sid=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")

# No session id → nothing to register; teardown falls back to its legacy behavior.
[[ -z "$sid" ]] && exit 0

SESSIONS_DIR="/tmp/ai-tools-app.sessions"
mkdir -p "$SESSIONS_DIR"
: > "$SESSIONS_DIR/$sid"

exit 0
