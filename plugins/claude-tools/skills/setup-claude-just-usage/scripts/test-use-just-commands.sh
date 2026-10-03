#!/usr/bin/env bash
# Regression tests for use-just-commands.mjs, in a throwaway two-level project under $TMPDIR.
# Usage: bash test-use-just-commands.sh [path/to/use-just-commands.mjs]
set -u

HOOK="${1:-$(cd "$(dirname "$0")" && pwd)/use-just-commands.mjs}"
HOOK="$(cd "$(dirname "$HOOK")" && pwd)/$(basename "$HOOK")"

if [ -z "${TMPDIR:-}" ] || [ ! -d "$TMPDIR" ] || [ ! -w "$TMPDIR" ]; then
  echo "temp dir '${TMPDIR:-}' is not usable" >&2
  exit 2
fi
ROOT="$(mktemp -d "$TMPDIR/just-usage-test.XXXXXX")" || { echo "could not create a scratch dir" >&2; exit 2; }
case "$ROOT" in "$TMPDIR"/just-usage-test.*) ;; *) echo "unexpected scratch dir $ROOT" >&2; exit 2 ;; esac
trap 'rm -rf "$ROOT"' EXIT

mkdir -p "$ROOT/.claude/hooks" "$ROOT/apps/web/.claude/hooks" "$ROOT/apps/other"
cat > "$ROOT/.claude/hooks/use-just-commands.json" <<'EOF'
{ "justfile": "justfile", "blocked": [
  { "command": "uv", "message": "Use just recipes." },
  { "command": "docker", "message": "Use just up / down." },
  { "command": "ruff", "message": "Use just lint." },
  { "command": "just check-types", "message": "Types come from LSP." }
] }
EOF
cat > "$ROOT/apps/web/.claude/hooks/use-just-commands.json" <<'EOF'
{ "justfile": "justfile", "blocked": [
  { "command": "pnpm test", "message": "Use just test." },
  { "command": "eslint", "message": "Use just lint." }
] }
EOF

pass=0
fail=0
# check <deny|allow> <cwd relative to root> <command>
check() {
  local want="$1" dir="$2" cmd="$3" out got
  out="$(jq -n --arg c "$cmd" --arg d "$ROOT/$dir" '{tool_name:"Bash",cwd:$d,tool_input:{command:$c}}' |
    CLAUDE_PROJECT_DIR="$ROOT" node "$HOOK" 2>&1)"
  case "$out" in *'"permissionDecision":"deny"'*) got=deny ;; *) got=allow ;; esac
  if [ "$got" = "$want" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL ($dir): expected $want: $cmd"; echo "  output: $out"; fi
}

# Root level
check deny . 'uv run pytest'
check deny . 'docker compose up -d'
check deny . 'ruff check .'
check deny . 'uvx ruff check .'
check deny . 'uv run ruff format'
check deny . 'FOO=1 uv sync'
check deny . 'env FOO=1 docker ps'
check deny . 'sudo docker ps'
check deny . 'git status && uv sync'
check deny . 'git status; docker ps'
check deny . 'cat x | docker run y'
check deny . 'echo $(docker ps)'
check deny . '(cd src && uv sync)'
check deny . '/usr/local/bin/docker ps'
check deny . 'just check-types'
check deny . 'just check-types --all'
check allow . 'just lint'
check allow . 'just --list'
check allow . 'just check'
check allow . 'git commit -m "bump uv and docker; ruff too"'
check allow . 'echo "uv run x"'
check allow . 'grep -rn docker README.md'
check allow . 'git log --oneline'
check allow . 'cat <<EOF
uv run pytest
EOF'
check allow . 'ls docker-compose.yml'
check allow . 'npm run uvx'

# Runners from other ecosystems
check deny . 'bundle exec ruff check'
check deny . 'mise exec -- ruff check'
check deny . 'poetry run ruff check'
check deny . 'pdm run ruff check'
check deny . 'composer exec ruff'
check deny . 'bun x ruff'
check allow . 'bundle exec rspec'
check allow . 'mise exec -- node -v'

# Nested level: own config plus the root one
check deny apps/web 'pnpm test'
check deny apps/web 'pnpm exec eslint .'
check deny apps/web 'npx eslint src'
check deny apps/web 'uv sync'
check allow apps/web 'pnpm install'
check allow apps/web 'just test'

# Sibling without a config: only the root one applies, and the web config does not
check allow apps/other 'pnpm test'
check allow apps/other 'eslint .'
check deny apps/other 'uv sync'

# cd moves the directory the following commands are checked in
check deny . 'cd apps/web && pnpm test'
check allow . 'cd apps/other && pnpm test'
check allow apps/web 'cd ../other && pnpm test'
check deny apps/other 'cd ../web && pnpm test'
check allow . 'pnpm test'

# Not a Bash command, or garbage
out="$(echo '{"tool_name":"Read","tool_input":{"file_path":"x"}}' | CLAUDE_PROJECT_DIR="$ROOT" node "$HOOK" 2>&1)"
if [ -z "$out" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: non-Bash call produced output: $out"; fi
out="$(echo 'not json' | CLAUDE_PROJECT_DIR="$ROOT" node "$HOOK" 2>/dev/null)"
if [ -z "$out" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: bad input did not fail open: $out"; fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
