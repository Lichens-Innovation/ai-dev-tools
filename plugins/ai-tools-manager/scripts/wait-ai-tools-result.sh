#!/usr/bin/env bash
# Usage: wait-ai-tools-result.sh
# Block until the per-project result file is non-empty, then print it and exit.
# Called once per dispatcher loop iteration (and by the legacy launch wrapper).
#
# It does NOT truncate: freshness is owned by ensure-ai-tools-app.sh (truncates at
# session start) and by the dispatcher clearing the file after it handles each result.
# This matters because the dispatcher may re-invoke wait after a Bash-timeout kill —
# truncating here would drop a result the user submitted in the gap.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/maestro-app-paths.sh
source "$SCRIPT_DIR/lib/maestro-app-paths.sh"

# Docker won't create a file where a dir was left; keep it a real file (but don't clear contents).
[[ -d "$MAESTRO_RESULT_FILE" ]] && rm -rf "$MAESTRO_RESULT_FILE"
[[ -e "$MAESTRO_RESULT_FILE" ]] || : > "$MAESTRO_RESULT_FILE"

# Wait for the result file to be populated by a form submit / cancel / shutdown.
until [[ -s "$MAESTRO_RESULT_FILE" ]]; do
  sleep 0.2
done

cat "$MAESTRO_RESULT_FILE"
