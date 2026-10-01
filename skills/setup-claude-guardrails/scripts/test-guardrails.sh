#!/usr/bin/env bash
# Regression tests for guardrails.mjs. Builds a throwaway project and pipes hook inputs into it.
#
# Usage: test-guardrails.sh [path/to/guardrails.mjs]   (defaults to the copy next to this script)
# Exits non-zero if any case gets the wrong decision.

set -u
SCRIPT="$(cd "$(dirname "${1:-$(dirname "$0")/guardrails.mjs}")" && pwd)/$(basename "${1:-guardrails.mjs}")"
PROJECT="$(mktemp -d)"
OTHER="$(mktemp -d)"
trap 'rm -rf "$PROJECT" "$OTHER"' EXIT
PROJECT="$(cd "$PROJECT" && pwd -P)"
OTHER="$(cd "$OTHER" && pwd -P)"

mkdir -p "$PROJECT/.claude/hooks" "$PROJECT/src"
printf '{ "permissions": { "additionalDirectories": ["%s"] } }\n' "$OTHER" > "$PROJECT/.claude/settings.json"
echo "SECRET=1" > "$PROJECT/.env"
echo "SECRET=" > "$PROJECT/.env.example"
ln -s .env "$PROJECT/notes.txt"

export CLAUDE_PROJECT_DIR="$PROJECT"
failures=0

# check <expected: deny|ask|allow> <tool> <tool_input JSON> [cwd]
check() {
  local expected="$1" tool="$2" tool_input="$3" cwd="${4:-$PROJECT}" out rc actual
  out="$(printf '{"tool_name":"%s","tool_input":%s,"cwd":"%s"}' "$tool" "$tool_input" "$cwd" | node "$SCRIPT" 2>/dev/null)"
  rc=$?
  if [ $rc -eq 2 ]; then actual="error"
  elif [[ "$out" == *'"permissionDecision":"deny"'* ]]; then actual="deny"
  elif [[ "$out" == *'"permissionDecision":"ask"'* ]]; then actual="ask"
  else actual="allow"; fi
  if [ "$actual" = "$expected" ]; then
    printf '  ok    %-5s %-5s %s\n' "$expected" "$tool" "$tool_input"
  else
    printf '  FAIL  expected %s, got %s: %s %s\n' "$expected" "$actual" "$tool" "$tool_input"
    failures=$((failures + 1))
  fi
}

echo "scope"
check deny  Read  '{"file_path":"/etc/hosts"}'
check deny  Read  '{"file_path":"'"$HOME"'/.ssh/id_rsa"}'
check allow Read  '{"file_path":"'"$PROJECT"'/src/index.ts"}'
check allow Read  '{"file_path":"'"$OTHER"'/README.md"}'
check allow Read  '{"file_path":"'"$HOME"'/.claude/plugins/x/SKILL.md"}'
check deny  Write '{"file_path":"'"$HOME"'/.claude/settings.json"}'
check allow Write '{"file_path":"'"$PROJECT"'/src/new/file.ts"}'
check deny  Glob  '{"pattern":"/etc/**"}'
check deny  Glob  '{"pattern":"../../**/*"}'
check allow Glob  '{"pattern":"src/**/*.ts"}'
check deny  Grep  '{"pattern":"x","path":"/etc"}'
check deny  Bash  '{"command":"cat /etc/passwd"}'
check deny  Bash  '{"command":"cat ~/.ssh/id_rsa"}'
check deny  Bash  '{"command":"ls $HOME"}'
check deny  Bash  '{"command":"cd ../.. && ls"}'
check deny  Bash  '{"command":"cd && cat .ssh/id_rsa"}'
check deny  Bash  '{"command":"git status; cd; ls"}'
check deny  Bash  '{"command":"ls"}' "/etc"
check allow Bash  '{"command":"cd '"$PROJECT"' && ls"}' "/etc"
check allow Bash  '{"command":"ls /tmp > /dev/null"}'
check allow Bash  '{"command":"npm test -- --watch=false"}'

echo "env"
check deny  Read  '{"file_path":"'"$PROJECT"'/.env"}'
check deny  Read  '{"file_path":"'"$PROJECT"'/.ENV.local"}'
check deny  Read  '{"file_path":"'"$PROJECT"'/config/prod.env"}'
check deny  Read  '{"file_path":"'"$PROJECT"'/notes.txt"}'
check allow Read  '{"file_path":"'"$PROJECT"'/.env.example"}'
check allow Read  '{"file_path":"'"$PROJECT"'/.env.local.sample"}'
check allow Edit  '{"file_path":"'"$PROJECT"'/.env.example"}'
check deny  Edit  '{"file_path":"'"$PROJECT"'/.env.production"}'
check deny  Grep  '{"pattern":"KEY","glob":".env*"}'
check allow Glob  '{"pattern":"**/.env*"}'
check deny  Bash  '{"command":"cat .env"}'
check deny  Bash  '{"command":"cat .env*"}'
check deny  Bash  '{"command":"cat .ENV"}'
check deny  Bash  '{"command":"cat .en?"}'
check deny  Bash  '{"command":"cat .e[n]v"}'
check deny  Bash  '{"command":"cat .e'"''"'nv"}'
check deny  Bash  '{"command":"source ./.env && npm start"}'
check deny  Bash  '{"command":"cat notes.txt"}'
check deny  Bash  '{"command":"git show HEAD:.env"}'
check allow Bash  '{"command":"diff .env.example .env.local.sample"}'
check allow Bash  '{"command":"node -e \"console.log(process.env.NODE_ENV)\""}'
check allow Bash  '{"command":"ls *.ts"}'

echo "self"
check ask   Edit  '{"file_path":"'"$PROJECT"'/.claude/settings.json"}'
check ask   Write '{"file_path":"'"$PROJECT"'/.claude/hooks/guardrails.mjs"}'
check ask   Bash  '{"command":"rm .claude/hooks/guardrails.mjs"}'
check allow Read  '{"file_path":"'"$PROJECT"'/.claude/settings.json"}'

echo "fail closed"
out="$(echo 'not json' | node "$SCRIPT" 2>/dev/null)"; rc=$?
if [ $rc -eq 2 ]; then echo "  ok    malformed input exits 2"; else echo "  FAIL  malformed input exited $rc"; failures=$((failures + 1)); fi

echo
if [ $failures -eq 0 ]; then echo "All guardrail checks passed."; else echo "$failures guardrail check(s) failed."; fi
exit $((failures > 0))
