#!/usr/bin/env bash
# Per-project ai-tools-manager path constants.
#
# Source this AFTER setting AFK_PROJECT_DIR when the project dir comes from stdin
# JSON (SessionStart/SessionEnd hooks). For scripts invoked with the project as cwd
# (ensure, wait, launch), omit AFK_PROJECT_DIR and it defaults to $(pwd).
#
# Exports:
#   AFK_PROJECT_DIR   – absolute path to the target project
#   AFK_KEY           – 12-char SHA-1 hash of AFK_PROJECT_DIR, stable per project
#   AFK_PROJECT_NAME  – docker compose project name  (ai-tools-<key>)
#   AFK_STATE_FILE    – persists AFK_PORT + AFK_COMPOSE_FILE for this project
#   AFK_MARKETPLACE_FILE – precompute data (mounted read-only at /tmp/marketplace-data.json)
#   AFK_RESULT_FILE   – form submit channel (mounted at /tmp/result.json)
#   AFK_SESSIONS_DIR  – per-project marker dir for reference-counted teardown
#
# Defines afk_load_state(): sources AFK_STATE_FILE and sets AFK_PORT + AFK_COMPOSE_FILE
# + AFK_PROJECT_NAME from it (needed by teardown to call docker compose down).

AFK_PROJECT_DIR="${AFK_PROJECT_DIR:-$(pwd)}"
AFK_KEY="$(printf '%s' "$AFK_PROJECT_DIR" | shasum 2>/dev/null | cut -c1-12)"
AFK_PROJECT_NAME="ai-tools-${AFK_KEY}"
AFK_STATE_FILE="/tmp/ai-tools-app.${AFK_KEY}.state"
AFK_MARKETPLACE_FILE="/tmp/ai-tools-marketplace.${AFK_KEY}.json"
AFK_RESULT_FILE="/tmp/ai-tools-result.${AFK_KEY}.json"
AFK_SESSIONS_DIR="/tmp/ai-tools-app.sessions/${AFK_KEY}"

afk_load_state() {
  # shellcheck disable=SC1090
  [[ -f "$AFK_STATE_FILE" ]] && source "$AFK_STATE_FILE"
  return 0
}
