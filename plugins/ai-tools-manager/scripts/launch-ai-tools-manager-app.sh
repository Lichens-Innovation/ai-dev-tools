#!/usr/bin/env bash
# Usage: launch-ai-tools-manager-app.sh <form-name>
# e.g.   launch-ai-tools-manager-app.sh create-skill
#
# Backward-compatible one-shot entry point used by the legacy create-* UserPromptExpansion
# hooks and by /maestro-app: bring the app up at the given route, then block for a single result and
# print it. It is now a thin wrapper over the two lifecycle primitives:
#   ensure-ai-tools-app.sh  — idempotent start + open browser (NO teardown)
#   wait-ai-tools-result.sh — truncate + block for one result + print
#
# Unlike the previous version there is NO EXIT trap: the container persists after this returns
# and is torn down at SessionEnd (maestro-session-cleanup.sh) or manually from Docker Desktop. The
# MAESTRO_IMPL_AGENTS / MAESTRO_SKILL_MAP env vars are read by ensure's precompute, so /maestro-app + /maestro-install
# keep seeding the canvas exactly as before.
set -euo pipefail

FORM_NAME="${1:?Usage: launch-ai-tools-manager-app.sh <form-name>}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$SCRIPT_DIR/ensure-ai-tools-app.sh" "$FORM_NAME"
bash "$SCRIPT_DIR/wait-ai-tools-result.sh"
