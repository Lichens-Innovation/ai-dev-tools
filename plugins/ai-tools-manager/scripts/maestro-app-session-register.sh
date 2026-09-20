#!/usr/bin/env bash
# SessionStart hook — register this session as a live user of the per-project
# ai-tools-manager container, via a marker file under a project-keyed sessions dir.
# The SessionEnd cleanup (maestro-session-cleanup.sh) drops this session's marker and
# only tears the container down when NO markers remain for that project — so the app
# survives until the LAST session for that project ends, not the first.
#
# Each project's container is isolated (separate compose project name + port + tmp
# files + sessions dir), so sessions in different repos never affect each other's
# reference counts.
#
# A session that crashes without a SessionEnd leaves a stale marker; the escape hatches
# are the in-app Stop button or a manual stop from Docker Desktop.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STDIN_DATA=$(cat)

sid=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "")
[[ -z "$sid" ]] && exit 0

project_cwd=$(echo "$STDIN_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null || echo "")
[[ -z "$project_cwd" ]] && exit 0

# Derive per-project paths from the session cwd.
MAESTRO_PROJECT_DIR="$project_cwd"
# shellcheck source=lib/maestro-app-paths.sh
source "$SCRIPT_DIR/lib/maestro-app-paths.sh"

mkdir -p "$MAESTRO_SESSIONS_DIR"
: > "$MAESTRO_SESSIONS_DIR/$sid"

exit 0
