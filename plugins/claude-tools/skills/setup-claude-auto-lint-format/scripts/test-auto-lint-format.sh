#!/usr/bin/env bash
# Regression tests for auto-lint-format.mjs, in a throwaway project under $TMPDIR.
# Usage: bash test-auto-lint-format.sh [path/to/auto-lint-format.mjs]
set -u

HOOK="${1:-$(cd "$(dirname "$0")" && pwd)/auto-lint-format.mjs}"
HOOK="$(cd "$(dirname "$HOOK")" && pwd)/$(basename "$HOOK")"

if [ -z "${TMPDIR:-}" ] || [ ! -d "$TMPDIR" ] || [ ! -w "$TMPDIR" ]; then
  echo "temp dir '${TMPDIR:-}' is not usable" >&2
  exit 2
fi
ROOT="$(mktemp -d "$TMPDIR/auto-lint-test.XXXXXX")" || { echo "could not create a scratch dir" >&2; exit 2; }
case "$ROOT" in "$TMPDIR"/auto-lint-test.*) ;; *) echo "unexpected scratch dir $ROOT" >&2; exit 2 ;; esac
trap 'rm -rf "$ROOT"' EXIT

mkdir -p "$ROOT/.claude/hooks" "$ROOT/src" "$ROOT/apps/web" "$ROOT/node_modules/x" "$ROOT/generated"
# "Linter": fails when the file contains BAD. "Formatter": rewrites TABS to spaces, always succeeds.
cat > "$ROOT/.claude/hooks/auto-lint-format.json" <<'EOF'
{
  "ignore": ["generated/**"],
  "rules": [
    { "match": ["*.py"], "commands": ["sed -i.bak 's/TAB/    /' {file} && rm -f {file}.bak", "grep -n BAD {file} && exit 1 || exit 0"] },
    { "match": ["apps/web/**/*.ts", "apps/web/*.ts"], "cwd": "apps/web", "commands": ["test \"$(basename \"$PWD\")\" = web && ! grep -q BAD {file}"] },
    { "match": ["*.md"], "commands": ["nonexistent-linter-xyz {file}"] },
    { "match": ["*.sh"], "commands": ["echo \"spaces ok\"; exit 0"] },
    { "match": ["*.slow"], "timeout": 1, "commands": ["sleep 3; exit 1"] },
    { "match": ["*.just"], "commands": ["sh -c 'echo \"lint-file failed: {file}\" >&2; exit 1'"] },
    { "match": ["*.multi"], "commands": ["exit 0", "echo type-error >&2; exit 1", "echo second-error >&2; exit 1"] }
  ]
}
EOF

pass=0
fail=0
# run <tool_name> <file path> -> sets CODE and ERR
run() {
  ERR="$(jq -n --arg t "$1" --arg f "$2" --arg d "$ROOT" '{tool_name:$t,cwd:$d,tool_input:{file_path:$f}}' |
    CLAUDE_PROJECT_DIR="$ROOT" node "$HOOK" 2>&1 >/dev/null)"
  CODE=$?
}
# expect <exit code> <label> [text that must appear in the output]
expect() {
  local code="$1" label="$2" text="${3:-}"
  if [ "$CODE" -ne "$code" ]; then
    fail=$((fail + 1)); echo "FAIL: $label: expected exit $code, got $CODE"; echo "  output: $ERR"
  elif [ "$code" -eq 0 ] && [ -n "$ERR" ]; then
    fail=$((fail + 1)); echo "FAIL: $label: expected silence, got: $ERR"
  elif [ -n "$text" ] && [[ "$ERR" != *"$text"* ]]; then
    fail=$((fail + 1)); echo "FAIL: $label: output lacks '$text'"; echo "  output: $ERR"
  else
    pass=$((pass + 1))
  fi
}

# Clean file: silent, exit 0
printf 'x = 1\n' > "$ROOT/src/ok.py"
run Write "$ROOT/src/ok.py"; expect 0 "clean file is silent"

# Lint error: exit 2, the linter output and the relative path reach stderr
printf 'x = BAD\n' > "$ROOT/src/bad.py"
run Edit "$ROOT/src/bad.py"; expect 2 "lint error" "BAD"
expect 2 "lint error names the file" "src/bad.py"

# Formatter fixes the file silently, then the linter passes
printf 'x =TAB1\n' > "$ROOT/src/fmt.py"
run Write "$ROOT/src/fmt.py"; expect 0 "formatter fix is silent"
if grep -q TAB "$ROOT/src/fmt.py"; then fail=$((fail + 1)); echo "FAIL: formatter did not rewrite the file"; else pass=$((pass + 1)); fi

# Relative path, MultiEdit
run MultiEdit "src/bad.py"; expect 2 "relative path"

# cwd option and nested globs
printf 'let a = 1\n' > "$ROOT/apps/web/a.ts"
run Write "$ROOT/apps/web/a.ts"; expect 0 "rule with cwd, clean"
printf 'let a = BAD\n' > "$ROOT/apps/web/b.ts"
run Write "$ROOT/apps/web/b.ts"; expect 2 "rule with cwd, error"
printf 'BAD\n' > "$ROOT/src/c.ts"
run Write "$ROOT/src/c.ts"; expect 0 "file outside the rule's glob"

# Ignored paths
printf 'BAD\n' > "$ROOT/generated/g.py"
run Write "$ROOT/generated/g.py"; expect 0 "ignored by config"
printf 'BAD\n' > "$ROOT/node_modules/x/n.py"
run Write "$ROOT/node_modules/x/n.py"; expect 0 "node_modules always ignored"

# Command not found: exit 1 (user only), not 2 (Claude)
printf '# t\n' > "$ROOT/README.md"
run Write "$ROOT/README.md"; expect 1 "command not found is a setup problem" "could not run"

# Command whose output is noise on success stays silent
printf 'echo\n' > "$ROOT/s.sh"
run Write "$ROOT/s.sh"; expect 0 "passing command output is not shown"

# Per-rule timeout: a command slower than its timeout is dropped silently
printf 'x\n' > "$ROOT/t.slow"
run Write "$ROOT/t.slow"; expect 0 "command past its timeout is silent"

# Several failing commands (lint, then an extra check) are all reported together
printf 'x\n' > "$ROOT/t.multi"
run Write "$ROOT/t.multi"; expect 2 "extra check failure" "type-error"
expect 2 "second failure reported too" "second-error"

# File with a quote in its name is passed safely
printf 'x = BAD\n' > "$ROOT/src/it's.py"
run Write "$ROOT/src/it's.py"; expect 2 "quote in file name"

# Skipped: outside the project, deleted file, tool without file_path, no match
run Write "/etc/hosts"; expect 0 "outside the project"
run Write "$ROOT/src/deleted.py"; expect 0 "file does not exist"
printf 'BAD\n' > "$ROOT/notes.txt"
run Write "$ROOT/notes.txt"; expect 0 "no rule matches"
ERR="$(echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | CLAUDE_PROJECT_DIR="$ROOT" node "$HOOK" 2>&1)"; CODE=$?
expect 0 "tool input without file_path"

# No config at all, bad config, bad input: all fail open
mv "$ROOT/.claude/hooks/auto-lint-format.json" "$ROOT/cfg.json"
run Write "$ROOT/src/bad.py"; expect 0 "no config"
echo 'not json' > "$ROOT/.claude/hooks/auto-lint-format.json"
run Write "$ROOT/src/bad.py"; expect 0 "invalid config"
rm -f "$ROOT/.claude/hooks/auto-lint-format.json"
ERR="$(echo 'not json' | CLAUDE_PROJECT_DIR="$ROOT" node "$HOOK" 2>/dev/null)"; CODE=$?
expect 0 "invalid input fails open"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
