#!/usr/bin/env bash
# SessionEnd hook — removes the ephemeral session files (afk_session.json and
# afk_session.log.jsonl) from the project's .claude/ directory. They should not
# persist between Claude sessions. The source of truth (.claude/afk.json) and the
# orchestrator agent (.claude/agents/afk.md) are intentionally preserved.

set -euo pipefail

STDIN_DATA=$(cat)

cwd=$(echo "$STDIN_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null || echo "")

if [[ -z "$cwd" ]]; then
  exit 0
fi

rm -f "$cwd/.claude/afk_session.json" "$cwd/.claude/afk_session.log.jsonl"

exit 0
