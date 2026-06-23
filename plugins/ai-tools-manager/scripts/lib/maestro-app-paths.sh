#!/usr/bin/env bash
# Per-project ai-tools-manager path constants.
#
# Source this AFTER setting MAESTRO_PROJECT_DIR when the project dir comes from stdin
# JSON (SessionStart/SessionEnd hooks). For scripts invoked with the project as cwd
# (ensure, wait, launch), omit MAESTRO_PROJECT_DIR and it defaults to $(pwd).
#
# Exports:
#   MAESTRO_PROJECT_DIR   – absolute path to the target project
#   MAESTRO_KEY           – 12-char SHA-1 hash of MAESTRO_PROJECT_DIR, stable per project
#   MAESTRO_PROJECT_NAME  – docker compose project name  (ai-tools-<key>)
#   MAESTRO_STATE_FILE    – persists MAESTRO_PORT + MAESTRO_COMPOSE_FILE for this project
#   MAESTRO_MARKETPLACE_FILE – precompute data (mounted read-only at /tmp/marketplace-data.json)
#   MAESTRO_RESULT_FILE   – form submit channel (mounted at /tmp/result.json)
#   MAESTRO_SESSIONS_DIR  – per-project marker dir for reference-counted teardown
#
# Defines maestro_load_state(): sources MAESTRO_STATE_FILE and sets MAESTRO_PORT + MAESTRO_COMPOSE_FILE
# + MAESTRO_PROJECT_NAME from it (needed by teardown to call docker compose down).

MAESTRO_PROJECT_DIR="${MAESTRO_PROJECT_DIR:-$(pwd)}"
MAESTRO_KEY="$(printf '%s' "$MAESTRO_PROJECT_DIR" | shasum 2>/dev/null | cut -c1-12)"
MAESTRO_PROJECT_NAME="ai-tools-${MAESTRO_KEY}"
MAESTRO_STATE_FILE="/tmp/ai-tools-app.${MAESTRO_KEY}.state"
MAESTRO_MARKETPLACE_FILE="/tmp/ai-tools-marketplace.${MAESTRO_KEY}.json"
MAESTRO_RESULT_FILE="/tmp/ai-tools-result.${MAESTRO_KEY}.json"
MAESTRO_SESSIONS_DIR="/tmp/ai-tools-app.sessions/${MAESTRO_KEY}"

maestro_load_state() {
  # shellcheck disable=SC1090
  [[ -f "$MAESTRO_STATE_FILE" ]] && source "$MAESTRO_STATE_FILE"
  return 0
}
