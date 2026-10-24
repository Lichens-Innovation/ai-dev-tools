#!/usr/bin/env bash
# Regression tests for guardrails.mjs. Builds a throwaway project and pipes hook inputs into it.
#
# Usage: test-guardrails.sh [path/to/guardrails.mjs]   (defaults to the copy next to this script)
# Exits non-zero if any case gets the wrong decision.

set -u
# Under `sh` on macOS (bash in POSIX mode), `VAR=x check ...` would leak VAR into later checks.
set +o posix

die() { echo "test-guardrails: $*" >&2; exit 2; }

HOOK="${1:-$(dirname "$0")/guardrails.mjs}"
[ -f "$HOOK" ] || die "hook not found: $HOOK"
SCRIPT="$(cd "$(dirname "$HOOK")" && pwd -P)/$(basename "$HOOK")"
# Without node every check reads as "allow", which looks like a broken hook. Inside the sandbox
# this usually means node lives under the home dir (nvm, fnm, volta) and isn't in allowRead.
node --version >/dev/null 2>&1 || die "node does not run here (in the sandbox: add its install dir to sandbox.filesystem.allowRead)"

# The scratch dirs get populated with fake secrets and then rm -rf'd, so they must be fresh
# mktemp dirs under the temp root. An unchecked empty mktemp result once made `cd "" && pwd`
# resolve to the caller's cwd, and the cleanup trap deleted the real project.
TMP_ROOT="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)"
[ -n "$TMP_ROOT" ] && [ "$TMP_ROOT" != "/" ] || die "temp dir ${TMPDIR:-/tmp} is not usable"
MARKER=".guardrails-test-scratch"

make_scratch() {
  local dir
  dir="$(mktemp -d "$TMP_ROOT/guardrails-test.XXXXXX")" || return 1
  case "$dir" in "$TMP_ROOT"/guardrails-test.?*) ;; *) return 1 ;; esac
  [ -d "$dir" ] || return 1
  touch "$dir/$MARKER" || return 1
  printf '%s\n' "$dir"
}

# Only removes dirs that match the scratch pattern and carry the marker this script wrote.
cleanup() {
  local dir
  for dir in "$@"; do
    case "$dir" in "$TMP_ROOT"/guardrails-test.?*) ;; *) continue ;; esac
    [ -f "$dir/$MARKER" ] && rm -rf -- "$dir"
  done
}

PROJECT="$(make_scratch)" || die "could not create a scratch project under $TMP_ROOT"
OTHER="$(make_scratch)" || { cleanup "$PROJECT"; die "could not create a scratch dir under $TMP_ROOT"; }
# Stand-in for ~/.claude: the sandbox denies reading the real settings.json, so the hook can't
# resolve it and fails closed (exit 2) instead of deciding.
CONFIG="$(make_scratch)" || { cleanup "$PROJECT" "$OTHER"; die "could not create a scratch dir under $TMP_ROOT"; }
trap 'cleanup "$PROJECT" "$OTHER" "$CONFIG"' EXIT

# Every scratch dir sits in the temp root, which is always allowed, so allow-checks on them can't
# fail. Extra roots under $HOME make those checks real; they're never created (the hook resolves
# paths that don't exist yet), so nothing is written outside the temp root.
EXTRA="$HOME/.guardrails-test-extra"
USER_EXTRA="$HOME/.guardrails-test-user"
WORKTREE="$PROJECT/.claude/worktrees/feat"

mkdir -p "$PROJECT/.claude/hooks" "$PROJECT/src" "$WORKTREE/.claude"
printf '{ "permissions": { "additionalDirectories": ["%s", "%s", "~/.guardrails-test-tilde"] } }\n' "$OTHER" "$EXTRA" \
  > "$PROJECT/.claude/settings.json"
printf '{ "permissions": { "additionalDirectories": ["%s"] } }\n' "$USER_EXTRA" > "$CONFIG/settings.json"
echo "SECRET=1" > "$PROJECT/.env"
echo "SECRET=" > "$PROJECT/.env.example"
ln -s .env "$PROJECT/notes.txt"

export CLAUDE_PROJECT_DIR="$PROJECT"
failures=0

# Enough ../ to climb from the project to /. A fixed ../.. depends on where TMPDIR sits: under
# /private/tmp/claude-501 (the Claude Code sandbox) it lands in /private/tmp, an allowed temp root.
UP="$(printf '%s' "$PROJECT" | tr -cd '/' | sed 's|/|../|g')"

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
check allow Write '{"file_path":"'"$PROJECT"'/src/new/file.ts"}'
check allow Write '{"file_path":"/tmp/guardrails-note.txt"}'
check deny  Glob  '{"pattern":"/etc/**"}'
check deny  Glob  '{"pattern":"'"$UP"'**/*"}'
check allow Glob  '{"pattern":"src/**/*.ts"}'
check deny  Grep  '{"pattern":"x","path":"/etc"}'
check deny  Bash  '{"command":"cat /etc/passwd"}'
check deny  Bash  '{"command":"cat ~/.ssh/id_rsa"}'
check deny  Bash  '{"command":"ls $HOME"}'
check deny  Bash  '{"command":"cd '"$UP"' && ls"}'
check deny  Bash  '{"command":"cd && cat .ssh/id_rsa"}'
check deny  Bash  '{"command":"git status; cd; ls"}'
check deny  Bash  '{"command":"ls"}' "/etc"
check allow Bash  '{"command":"cd '"$PROJECT"' && ls"}' "/etc"
check allow Bash  '{"command":"ls /tmp > /dev/null"}'
check allow Bash  '{"command":"npm test -- --watch=false"}'

echo "additional directories"
check allow Read  '{"file_path":"'"$EXTRA"'/README.md"}'
check allow Write '{"file_path":"'"$EXTRA"'/src/new.ts"}'
check deny  Read  '{"file_path":"'"$EXTRA"'-sibling/README.md"}'
check allow Bash  '{"command":"cat ~/.guardrails-test-tilde/notes.md"}'
check allow Bash  '{"command":"ls"}' "$EXTRA"
check deny  Read  '{"file_path":"'"$USER_EXTRA"'/README.md"}'
CLAUDE_CONFIG_DIR="$CONFIG" check allow Read '{"file_path":"'"$USER_EXTRA"'/README.md"}'
CLAUDE_CONFIG_DIR="$CONFIG" check allow Bash '{"command":"ls '"$USER_EXTRA"'"}'

echo "system programs"
check allow Bash  '{"command":"/usr/bin/python3 -c \"print(1)\""}'
check allow Bash  '{"command":"git log | /usr/bin/grep fix"}'
check allow Bash  '{"command":"FOO=1 /usr/bin/env node -v && /opt/homebrew/bin/jq . package.json"}'
check deny  Bash  '{"command":"/usr/bin/cat /etc/passwd"}'
check deny  Bash  '{"command":"/usr/bin/../../etc/evil.sh"}'
check deny  Bash  '{"command":"/etc/evil.sh"}'
check deny  Bash  '{"command":"cat /usr/bin/python3"}'

echo "worktrees"
check allow Bash  '{"command":"ls"}' "$WORKTREE"
check allow Edit  '{"file_path":"'"$WORKTREE"'/src/index.ts"}' "$WORKTREE"
check deny  Read  '{"file_path":"'"$WORKTREE"'/.env"}' "$WORKTREE"
check ask   Edit  '{"file_path":"'"$WORKTREE"'/.claude/settings.local.json"}' "$WORKTREE"
check ask   Bash  '{"command":"rm .claude/hooks/guardrails.mjs"}' "$WORKTREE"

echo "claude config"
check allow Read  '{"file_path":"'"$HOME"'/.claude/plugins/x/SKILL.md"}'
check allow Write '{"file_path":"'"$HOME"'/.claude/plugins/x/SKILL.md"}'
check allow Bash  '{"command":"ls ~/.claude/rules"}'
check allow Bash  '{"command":"ls"}' "$HOME/.claude/plugins"
check deny  Bash  '{"command":"cat ~/.claude-backup/settings.json"}'
CLAUDE_CONFIG_DIR="$CONFIG" check ask  Edit '{"file_path":"'"$CONFIG"'/settings.json"}'
CLAUDE_CONFIG_DIR="$CONFIG" check ask  Bash '{"command":"rm '"$CONFIG"'/settings.json"}'
CLAUDE_CONFIG_DIR="$CONFIG" check deny Read '{"file_path":"'"$CONFIG"'/.credentials.json"}'
CLAUDE_CONFIG_DIR="$CONFIG" check deny Bash '{"command":"cd '"$CONFIG"' && cat .credentials.json"}'
# Not the real ~/.claude.json: like settings.json, the sandbox can't resolve it (exit 2).
check deny  Read  '{"file_path":"'"$PROJECT"'/backup/.claude.json"}'
check deny  Bash  '{"command":"cat backup/.claude.json"}'

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

echo "message text"
Q="'"
B='`'
check allow Bash  '{"command":"git commit -am '"$Q"'fix /plugin and .env docs'"$Q"'"}'
check allow Bash  "{\"command\":\"git add -A && git commit -F - <<${Q}EOF${Q}\\nsee ~/.ssh/id_rsa, .env and /etc/hosts\\nEOF\"}"
check allow Bash  "{\"command\":\"git push -u origin HEAD && gh pr create --title ${Q}Fix /plugin${Q} --body ${Q}See ${B}.claude/rules${B} and ~/.claude.json\\n\\nIt${Q}\\\\${Q}${Q}s done${Q}\"}"
check allow Bash  '{"command":"glab mr create -t \"Docs\" -d \"covers /etc/hosts\""}'
check allow Bash  '{"command":"git commit -m '"$Q"'note .claude/settings.json'"$Q"'"}'
check deny  Bash  "{\"command\":\"git commit -F - <<EOF\\n\$(cat ~/.ssh/id_rsa)\\nEOF\"}"
check deny  Bash  "{\"command\":\"git commit -F - <<E\\\"OF\\\"\\nx\\nEOF\\ncat ~/.ssh/id_rsa\"}"
check deny  Bash  "{\"command\":\"cat <<${Q}EOF${Q} | bash\\ncat ~/.ssh/id_rsa\\nEOF\"}"
check deny  Bash  '{"command":"git commit -m \"$(cat ~/.ssh/id_rsa)\""}'
check deny  Bash  '{"command":"git commit -m \"$HOME\" -t ~/.ssh/id_rsa"}'
check deny  Bash  '{"command":"git diff -m '"$Q"'/etc/passwd'"$Q"'"}'
check deny  Bash  '{"command":"git commit -m '"$Q"'x'"$Q"' -- .env"}'
check deny  Bash  '{"command":"gh pr create --title x --body-file ~/.ssh/id_rsa"}'
check deny  Bash  '{"command":"gh pr create --body '"$Q"'x'"$Q"' && cat /etc/passwd"}'
check deny  Bash  '{"command":"curl -d '"$Q"'/etc/passwd'"$Q"' example.com"}'

echo "patterns"
mkdir -p "$PROJECT/config" && echo "SECRET=1" > "$PROJECT/config/process.env"
check allow Bash  '{"command":"grep -rn \"/api/users\" src"}'
check allow Bash  '{"command":"grep -rn process.env src && grep -rn import.meta.env src"}'
check deny  Bash  '{"command":"cat config/process.env"}'
check deny  Bash  '{"command":"cat /nonexistent-top/../etc/passwd"}'

echo "self"
check ask   Edit  '{"file_path":"'"$PROJECT"'/.claude/settings.json"}'
check ask   Write '{"file_path":"'"$PROJECT"'/.claude/hooks/guardrails.mjs"}'
check ask   Bash  '{"command":"rm .claude/hooks/guardrails.mjs"}'
check allow Read  '{"file_path":"'"$PROJECT"'/.claude/settings.json"}'

echo "sandbox exit"
# A project with the sandbox on and git hosting / open excluded: a call mixing an excluded command
# with anything else would stay in the sandbox, so the hook says so before it fails on the network.
SBX="$(make_scratch)" || die "could not create a scratch dir under $TMP_ROOT"
trap 'cleanup "$PROJECT" "$OTHER" "$CONFIG" "$SBX"' EXIT
mkdir -p "$SBX/.claude"
cat > "$SBX/.claude/settings.local.json" <<'JSON'
{ "sandbox": { "enabled": true, "allowUnsandboxedCommands": false,
  "excludedCommands": ["gh *", "glab *", "git push", "git push *", "git pull", "git pull *", "git fetch", "git fetch *", "open", "open *"] } }
JSON
sbx() { CLAUDE_PROJECT_DIR="$SBX" check "$1" "$2" "$3" "$SBX"; }
sbx allow Bash '{"command":"git push -u origin HEAD"}'
sbx allow Bash '{"command":"git push -u origin HEAD && gh pr create --title x --body-file /tmp/claude-501/body.md"}'
sbx allow Bash '{"command":"gh pr view 3"}'
sbx allow Bash '{"command":"gh pr create --title '"$Q"'a | b'"$Q"' --body '"$Q"'x; y'"$Q"'"}'
sbx allow Bash '{"command":"git commit -m x && npm test"}'
sbx allow Bash '{"command":"git status | grep x"}'
sbx allow Bash '{"command":"npm test | tee out.txt"}'
sbx deny  Bash "{\"command\":\"git push -u origin HEAD && gh pr create --title x --body ${Q}See ${B}.claude/rules${B}${Q}\"}"
sbx deny  Bash '{"command":"gh pr create --title x --body \"$(cat body.md)\""}'
sbx deny  Bash '{"command":"gh pr create --title x --body-file - <<EOF\nbody\nEOF"}'
sbx deny  Bash '{"command":"gh pr list | head"}'
sbx deny  Bash '{"command":"git commit -m x && git push"}'
sbx deny  Bash '{"command":"cd src && git push"}'
sbx deny  Bash '{"command":"npm test && gh pr create --fill"}'
sbx deny  Bash '{"command":"open ~/x.html && echo done"}'
CLAUDE_PROJECT_DIR="$PROJECT" check allow Bash '{"command":"git commit -m x && git push"}'

echo "sandbox grants"
# With the sandbox on, sandbox.filesystem.allowRead opens a path to reads (Read, Grep, Glob, Bash
# commands that only read it), allowWrite to Bash writes too (the OS enforces it there, not for the
# Write and Edit tools), and a denyRead inside a grant still wins.
# Like the extra roots, the granted dirs under $HOME are never created.
GRANT="$(make_scratch)" || die "could not create a scratch dir under $TMP_ROOT"
GRANT_OFF="$(make_scratch)" || die "could not create a scratch dir under $TMP_ROOT"
trap 'cleanup "$PROJECT" "$OTHER" "$CONFIG" "$SBX" "$GRANT" "$GRANT_OFF"' EXIT
RO="$HOME/.guardrails-test-ro"
ABS="$HOME/.guardrails-test-abs"
RW="$HOME/.guardrails-test-rw"
mkdir -p "$GRANT/.claude" "$GRANT_OFF/.claude"
FS='"filesystem": { "allowRead": ["~/.guardrails-test-ro", "'"$ABS"'"], "allowWrite": ["~/.guardrails-test-rw"], "denyRead": ["~/.guardrails-test-ro/secret"] }'
echo '{ "sandbox": { "enabled": true, '"$FS"' } }' > "$GRANT/.claude/settings.local.json"
echo '{ "sandbox": { "enabled": false, '"$FS"' } }' > "$GRANT_OFF/.claude/settings.local.json"
gr() { CLAUDE_PROJECT_DIR="$GRANT" check "$1" "$2" "$3" "$GRANT"; }
gr allow Bash  '{"command":"du -sh ~/.guardrails-test-ro"}'
gr allow Bash  '{"command":"ls '"$RO"'/sub"}'
gr allow Bash  '{"command":"ls $HOME/.guardrails-test-ro | head -3"}'
gr allow Bash  '{"command":"ls '"$ABS"'"}'
gr allow Bash  '{"command":"find ~/.guardrails-test-ro -name x.json"}'
gr allow Bash  '{"command":"cp ~/.guardrails-test-ro/a.txt src/a.txt"}'
gr allow Read  '{"file_path":"'"$RO"'/a.txt"}'
gr allow Grep  '{"pattern":"x","path":"'"$RO"'"}'
gr allow Glob  '{"pattern":"'"$RO"'/**/*.js"}'
gr deny  Bash  '{"command":"rm ~/.guardrails-test-ro/x"}'
gr deny  Bash  '{"command":"echo x > ~/.guardrails-test-ro/x"}'
gr deny  Bash  '{"command":"cat a.txt >> '"$ABS"'/x"}'
gr deny  Bash  '{"command":"cp a.txt ~/.guardrails-test-ro/x"}'
gr deny  Bash  '{"command":"find ~/.guardrails-test-ro -delete"}'
gr deny  Bash  '{"command":"ls ~/.guardrails-test-ro && rm -rf ~/.guardrails-test-ro"}'
gr deny  Bash  '{"command":"cd ~/.guardrails-test-ro && ls"}'
gr deny  Write '{"file_path":"'"$RO"'/x"}'
gr deny  Edit  '{"file_path":"'"$ABS"'/x"}'
gr allow Bash  '{"command":"touch ~/.guardrails-test-rw/x"}'
gr allow Bash  '{"command":"echo x > ~/.guardrails-test-rw/x"}'
gr allow Bash  '{"command":"rm ~/.guardrails-test-rw/x"}'
gr allow Read  '{"file_path":"'"$RW"'/x"}'
gr deny  Write '{"file_path":"'"$RW"'/x"}'
gr deny  Edit  '{"file_path":"'"$RW"'/x"}'
gr deny  Bash  '{"command":"cat ~/.guardrails-test-ro/secret/key"}'
gr deny  Read  '{"file_path":"'"$RO"'/secret/key"}'
gr deny  Bash  '{"command":"ls ~/.guardrails-test-ro-sibling"}'
CLAUDE_PROJECT_DIR="$GRANT_OFF" check deny Bash '{"command":"ls ~/.guardrails-test-ro"}' "$GRANT_OFF"
CLAUDE_PROJECT_DIR="$GRANT_OFF" check deny Read '{"file_path":"'"$RO"'/a.txt"}' "$GRANT_OFF"
# grant_message <tool> <tool_input JSON> <expected text...>: the deny message names the settings that would allow it.
grant_message() {
  local tool="$1" tool_input="$2" out want; shift 2
  out="$(printf '{"tool_name":"%s","tool_input":%s,"cwd":"%s"}' "$tool" "$tool_input" "$GRANT" | CLAUDE_PROJECT_DIR="$GRANT" node "$SCRIPT" 2>/dev/null)"
  for want in "$@"; do
    if [[ "$out" == *"$want"* ]]; then printf '  ok    message %-30s %s %s\n' "\"$want\"" "$tool" "$tool_input"
    else printf '  FAIL  no "%s" in the message for %s %s: %s\n' "$want" "$tool" "$tool_input" "$out"; failures=$((failures + 1)); fi
  done
}
grant_message Bash '{"command":"ls ~/.guardrails-test-elsewhere"}' sandbox.filesystem.allowRead permissions.additionalDirectories narrower broader
grant_message Bash '{"command":"rm ~/.guardrails-test-ro/x"}' 'reads only' sandbox.filesystem.allowWrite
grant_message Write '{"file_path":"'"$RW"'/x"}' 'sandboxed Bash commands only'

echo "read block"
# With blockReadsOutsideWorkingDirectories, Claude Code asks the user about a file read after a cd in
# the same call, even in auto mode, so the hook sends the model back to rewrite it instead.
RB="$(make_scratch)" || die "could not create a scratch dir under $TMP_ROOT"
trap 'cleanup "$PROJECT" "$OTHER" "$CONFIG" "$SBX" "$GRANT" "$GRANT_OFF" "$RB"' EXIT
mkdir -p "$RB/.claude" "$RB/src"
echo '{ "permissions": { "blockReadsOutsideWorkingDirectories": true } }' > "$RB/.claude/settings.local.json"
rb() { CLAUDE_PROJECT_DIR="$RB" check "$1" "$2" "$3" "$RB"; }
rb deny  Bash '{"command":"cd '"$RB"'/src; sed -n 55,82p a.ts; grep -n x b.ts | head"}'
rb deny  Bash '{"command":"cd src && cat a.ts"}'
rb deny  Bash '{"command":"cd src && git show HEAD:src/a.ts | sed -n 1,9p"}'
rb allow Bash '{"command":"cd src && npm test"}'
rb allow Bash '{"command":"sed -n 55,82p src/a.ts"}'
rb allow Bash '{"command":"git -C src log --oneline | head"}'
rb allow Bash '{"command":"git commit -m '"$Q"'cd x; cat y'"$Q"'"}'
rb deny  Bash '{"command":"sed -i -E '"$Q"'s#(a)\"#\\\\1#'"$Q"' src/a.ts src/b.ts"}'
rb deny  Bash '{"command":"sed -i.bak s/a/b/ src/a.ts"}'
rb deny  Bash '{"command":"sed --in-place=.bak s/a/b/ src/a.ts"}'
rb deny  Bash '{"command":"perl -pi -e s/a/b/ src/a.ts"}'
rb allow Bash '{"command":"sed -n 1,9p src/a.ts"}'
rb allow Bash '{"command":"git log | sed s/a/b/"}'
rb allow Bash '{"command":"perl -I lib script.pl"}'
CLAUDE_PROJECT_DIR="$PROJECT" check allow Bash '{"command":"sed -i s/a/b/ src/a.ts"}'
CLAUDE_PROJECT_DIR="$PROJECT" check allow Bash '{"command":"cd src && cat a.ts"}'

echo "failure hints"
# hint_check <expected: hint|none> <command> <error text> [expected text in the hint]
hint_check() {
  local expected="$1" cmd="$2" err="$3" want="${4:-}" out actual
  out="$(jq -cn --arg c "$cmd" --arg e "$err" \
    '{hook_event_name:"PostToolUseFailure",tool_name:"Bash",tool_input:{command:$c},error:$e}' | node "$SCRIPT" 2>/dev/null)"
  if [[ "$out" == *'"hookEventName":"PostToolUseFailure"'* && "$out" == *'"additionalContext"'* ]]; then actual="hint"; else actual="none"; fi
  if [ "$actual" = "$expected" ] && { [ -z "$want" ] || [[ "$out" == *"$want"* ]]; }; then
    printf '  ok    %-5s %s\n' "$expected" "$cmd"
  else
    printf '  FAIL  expected %s%s, got %s: %s\n' "$expected" "${want:+ with \"$want\"}" "$actual" "$out"
    failures=$((failures + 1))
  fi
}
PROXY='Received disconnect from UNKNOWN port 65535:1: This proxy requires authentication, and this client did not offer an authentication method'
hint_check hint 'git push -u origin HEAD' "$PROXY" '--body-file'
hint_check hint 'git push -u origin HEAD && gh pr create --fill' 'fatal: Could not read from remote repository.' 'ask the user to run it with !'
hint_check hint 'gh pr list' 'error connecting: Could not resolve host: api.github.com' 'sandbox'
hint_check hint 'open /tmp/x.html' 'LSOpenURLsWithRole() failed with error -10822' 'run with !'
hint_check hint 'touch /etc/x' 'touch: /etc/x: Operation not permitted' 'sandbox restriction'
hint_check hint 'git push' "$PROXY" 'setup-claude-guardrails'
PNPM_LOCK='Failed to open the store operation lock at "pnpm-store-operation-locks": Read-only file system (os error 30)'
hint_check hint 'pnpm install' "$PNPM_LOCK" 'run the install with !'
hint_check hint 'pnpm install' 'electron postinstall: TypeError: fetch failed' 'run the install with !'
hint_check hint 'echo ok' 'apply-seccomp: write /proc/self/setgroups (nested userns is capability-restricted; caller must provide CAP_SYS_ADMIN): Permission denied' 'allowAllUnixSockets'
hint_check hint 'pnpm --version' '(eval):1: command not found: pnpm' 'allowRead'
hint_check hint 'bash scripts/test.sh' 'line 3: node: command not found' 'allowRead'
hint_check hint 'pnpm --version' '[ERROR] unable to open database file' 'allowWrite'
hint_check hint 'pnpm lint' "$PNPM_LOCK" 'XDG_RUNTIME_DIR=$TMPDIR pnpm'
hint_check hint 'cp a.mjs .claude/hooks/guardrails.mjs' "cp: cannot create regular file '.claude/hooks/guardrails.mjs': Read-only file system" 'Use the Write tool'
hint_check none 'npm test' 'Error: 3 tests failed'
hint_check none 'pnpm install' 'ERR_PNPM_OUTDATED_LOCKFILE'
hint_check none 'npm test' "$PROXY"
hint_check none 'git push' 'rejected: non-fast-forward'
hint_check none 'git commit -m "fix: could not read from remote repository"' 'nothing to commit'
echo '{"hook_event_name":"PostToolUseFailure","tool_name":"Read","tool_input":{"file_path":"x"}}' | node "$SCRIPT" >/dev/null 2>&1 \
  && echo "  ok    non-Bash failure exits 0" || { echo "  FAIL  non-Bash failure did not exit 0"; failures=$((failures + 1)); }

echo "sandbox stubs"
# On Linux the sandbox leaves 0-byte mount points at the protected paths it blocks (.bashrc, .vscode,
# .claude/agents, ...). SKILL.md step 7 excludes them, re-including directories with a trailing
# slash so a real .vscode/ or .claude/agents/ still shows in git status.
STUB="$(make_scratch)" || die "could not create a scratch dir under $TMP_ROOT"
trap 'cleanup "$PROJECT" "$OTHER" "$CONFIG" "$SBX" "$GRANT" "$GRANT_OFF" "$RB" "$STUB"' EXIT
# stub_check <expected git status --porcelain output, one path per line>
stub_check() {
  local want="$1" got
  got="$(git -C "$STUB" status --porcelain --untracked-files=all | sed 's/^?? //' | grep -v "^$MARKER\$" | sort)"
  if [ "$got" = "$want" ]; then
    printf '  ok    untracked: %s\n' "$(printf '%s' "${want:-(none)}" | tr '\n' ' ')"
  else
    printf '  FAIL  expected untracked [%s], got [%s]\n' "$want" "$got"
    failures=$((failures + 1))
  fi
}
git -C "$STUB" init -q
mkdir -p "$STUB/.claude"
: > "$STUB/.bashrc"; : > "$STUB/.vscode"; : > "$STUB/.claude/agents"
printf '%s\n' '/.bashrc' '/.vscode' '!/.vscode/' '/.claude/agents' '!/.claude/agents/' >> "$STUB/.git/info/exclude"
stub_check ""
rm -f "$STUB/.vscode" "$STUB/.claude/agents"
mkdir -p "$STUB/.vscode" "$STUB/.claude/agents"
: > "$STUB/.vscode/settings.json"; : > "$STUB/.claude/agents/a.md"
stub_check "$(printf '%s\n' .claude/agents/a.md .vscode/settings.json)"

echo "allow rules"
# suggest-allow-rules.mjs proposes permissions.allow entries for a project's lint, typecheck and test
# commands (SKILL.md step 2), and never installs, pushes, publishes, deploys, fixes or deletes.
SUGGEST="$(dirname "$0")/suggest-allow-rules.mjs"
[ -f "$SUGGEST" ] || die "suggest-allow-rules.mjs not found next to this script"
AR="$(make_scratch)" || die "could not create a scratch dir under $TMP_ROOT"
trap 'cleanup "$PROJECT" "$OTHER" "$CONFIG" "$SBX" "$GRANT" "$GRANT_OFF" "$RB" "$STUB" "$AR"' EXIT
mkdir -p "$AR/.claude"
: > "$AR/pnpm-lock.yaml"
cat > "$AR/package.json" <<'JSON'
{ "scripts": {
  "lint": "eslint .", "lint:fix": "eslint . --fix", "typecheck": "tsc --noEmit", "test": "vitest run",
  "test:watch": "vitest", "test:ci": "vitest --watch=false", "test:update": "vitest -u",
  "format": "prettier --write .", "format:check": "prettier --check .", "build": "tsc",
  "deploy": "vercel deploy", "release": "changeset publish", "verify": "pnpm lint && pnpm typecheck",
  "check": "pnpm lint && pnpm release", "test:e2e": "pnpm install && playwright test", "postinstall": "husky"
} }
JSON
cat > "$AR/justfile" <<'JUST'
set shell := ["bash", "-c"]

lint:
    pnpm lint

test *args:
    pnpm test {{args}}

push:
    git push

ci-check: lint test

check-all: lint push

[private]
test-hidden:
    pnpm test

_test-helper:
    rm -rf dist
JUST
printf '.PHONY: test lint clean\ntest:\n\tgo test ./...\nlint:\n\tgolangci-lint run\nlint-fix:\n\tgolangci-lint run --fix\nclean:\n\trm -rf dist\nverify: test clean\n' > "$AR/Makefile"
echo '{ "tasks": { "build": {}, "lint": {}, "web#typecheck": {}, "deploy": {}, "dev": {}, "test": {} } }' > "$AR/turbo.json"
cat > "$AR/CLAUDE.md" <<'MD'
Run `pnpm lint` and `bash scripts/test-all.sh` before a PR. Never `pnpm publish`, `git push` or
`pnpm install`. In a package: `pnpm --filter <pkg> test`. Tests: `cargo test --workspace`.
Lint: `ruff check .`, then `ruff format .` and `cargo fmt --check`.

```bash
$ uv run pytest -q
rm -rf node_modules
pnpm test | tee out.txt
```
MD
echo '{ "permissions": { "allow": ["Bash(make lint)", "Bash(make lint *)"] } }' > "$AR/.claude/settings.local.json"
SETTINGS_BEFORE="$(cat "$AR/.claude/settings.local.json")"
SUGGESTED="$(node "$SUGGEST" "$AR")" || { echo "  FAIL  suggest-allow-rules.mjs exited non-zero"; failures=$((failures + 1)); SUGGESTED='{}'; }
# suggest <expected: proposed|skipped|absent> <command>
suggest() {
  local expected="$1" cmd="$2" actual
  if jq -e --arg c "$cmd" '.candidates[] | select(.command == $c)' <<<"$SUGGESTED" >/dev/null; then actual="proposed"
  elif jq -e --arg c "$cmd" '.skipped[] | select(.command == $c)' <<<"$SUGGESTED" >/dev/null; then actual="skipped"
  else actual="absent"; fi
  if [ "$actual" = "$expected" ]; then printf '  ok    %-8s %s\n' "$expected" "$cmd"
  else printf '  FAIL  expected %s, got %s: %s\n' "$expected" "$actual" "$cmd"; failures=$((failures + 1)); fi
}
suggest proposed 'pnpm lint'
suggest proposed 'pnpm typecheck'
suggest proposed 'pnpm test'
suggest proposed 'pnpm test:ci'
suggest proposed 'pnpm format:check'
suggest proposed 'pnpm verify'
suggest skipped  'pnpm lint:fix'
suggest skipped  'pnpm test:watch'
suggest skipped  'pnpm test:update'
suggest skipped  'pnpm check'
suggest skipped  'pnpm test:e2e'
suggest absent   'pnpm format'
suggest absent   'pnpm build'
suggest absent   'pnpm deploy'
suggest absent   'pnpm release'
suggest absent   'pnpm postinstall'
suggest proposed 'just lint'
suggest proposed 'just test'
suggest proposed 'just ci-check'
suggest skipped  'just check-all'
suggest absent   'just push'
suggest absent   'just test-hidden'
suggest absent   'just _test-helper'
suggest proposed 'make test'
suggest skipped  'make lint-fix'
suggest skipped  'make verify'
suggest absent   'make clean'
suggest absent   'make lint'
suggest proposed 'turbo run lint'
suggest proposed 'turbo run typecheck'
suggest proposed 'turbo run test'
suggest absent   'turbo run build'
suggest absent   'turbo run deploy'
suggest absent   'turbo run dev'
suggest proposed 'bash scripts/test-all.sh'
suggest proposed 'cargo test --workspace'
suggest proposed 'uv run pytest -q'
suggest proposed 'ruff check .'
suggest skipped  'ruff format .'
suggest proposed 'cargo fmt --check'
suggest absent   'pnpm publish'
suggest absent   'git push'
suggest absent   'pnpm install'
suggest absent   'pnpm --filter <pkg> test'
suggest absent   'pnpm test | tee out.txt'
# rule_check <description> <jq filter that must output true>
rule_check() {
  if [ "$(jq -r "$2" <<<"$SUGGESTED")" = "true" ]; then printf '  ok    %s\n' "$1"
  else printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); fi
}
rule_check 'pnpm lint gets exact and wildcard rules' \
  '[.candidates[] | select(.command == "pnpm lint") | .rules[]] == ["Bash(pnpm lint)", "Bash(pnpm lint *)", "Bash(pnpm run lint)", "Bash(pnpm run lint *)"]'
rule_check 'every rule is a Bash(...) rule for its command' \
  '[.candidates[] | . as $c | .rules[] | test("^Bash\\(.+\\)$")] | all'
rule_check 'no rule installs, pushes, publishes, deploys, fixes or deletes' \
  '[.candidates[].rules[] | test("install|push|publish|deploy|release|--fix|--write|rm -|clean"; "i")] | any | not'
rule_check 'rules already in permissions.allow are left out' \
  '[.candidates[].rules[]] | index("Bash(make lint)") == null'
rule_check 'every candidate has a kind and a source' \
  '[.candidates[] | (.kind | type == "string") and (.source | type == "string")] | all'
if [ "$(cat "$AR/.claude/settings.local.json")" = "$SETTINGS_BEFORE" ]; then echo "  ok    settings left unchanged"
else echo "  FAIL  suggest-allow-rules.mjs changed settings.local.json"; failures=$((failures + 1)); fi
# The hook must not deny what the rules allow, or the rules would only trade a prompt for a deny.
while IFS= read -r cmd; do
  CLAUDE_PROJECT_DIR="$AR" check allow Bash "$(jq -cn --arg c "$cmd" '{command:$c}')" "$AR"
done < <(jq -r '.candidates[].command' <<<"$SUGGESTED")
SUGGESTED="$(node "$SUGGEST" "$OTHER")"
rule_check 'a project without command sources gets no candidates' '.candidates == []'

echo "fail closed"
out="$(echo 'not json' | node "$SCRIPT" 2>/dev/null)"; rc=$?
if [ $rc -eq 2 ]; then echo "  ok    malformed input exits 2"; else echo "  FAIL  malformed input exited $rc"; failures=$((failures + 1)); fi

echo
if [ $failures -eq 0 ]; then echo "All guardrail checks passed."; else echo "$failures guardrail check(s) failed."; fi
exit $((failures > 0))
