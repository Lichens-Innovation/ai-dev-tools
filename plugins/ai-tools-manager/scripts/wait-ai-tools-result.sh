#!/usr/bin/env bash
# Usage: wait-ai-tools-result.sh
# Block until the result file is non-empty, then print it and exit. Called once per dispatcher
# loop iteration (and by the legacy launch wrapper).
#
# It does NOT truncate: freshness is owned by ensure-ai-tools-app.sh (truncates at session start)
# and by the dispatcher clearing the file after it handles each result. This matters because the
# dispatcher may re-invoke wait after a Bash-timeout kill — truncating here would drop a result the
# user submitted in the gap. Blocks until a submit/cancel/shutdown arrives; the caller ends a wait
# by interrupting (Esc) or via an in-app action.
set -euo pipefail

RESULT_FILE="/tmp/ai-tools-result.json"

# Docker won't create a file where a dir was left; keep it a real file (but don't clear contents).
[[ -d "$RESULT_FILE" ]] && rm -rf "$RESULT_FILE"
[[ -e "$RESULT_FILE" ]] || > "$RESULT_FILE"

# Wait for the result file to be populated by a form submit / cancel / shutdown.
until [[ -s "$RESULT_FILE" ]]; do
  sleep 0.2
done

cat "$RESULT_FILE"
