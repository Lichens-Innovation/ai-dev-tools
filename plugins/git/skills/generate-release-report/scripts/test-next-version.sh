#!/usr/bin/env bash
# Tests for next-version.sh against throwaway repos. Usage: bash test-next-version.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
script="$here/next-version.sh"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/next-version-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

fail=0
gi() { git -C "$1" -c user.name=t -c user.email=t@t -c commit.gpgsign=false "${@:2}"; }
commit() { gi "$1" commit -q --allow-empty -m "$2"; }
check() { # <name> <repo> <key> <expected> [base] [head]
  local got
  got=$(bash "$script" -C "$2" "${5:-main}" "${6:-dev}" | grep "^$3=" | head -1 | cut -d= -f2-)
  if [ "$got" = "$4" ]; then echo "ok   $1"; else echo "FAIL $1: $3 expected '$4' got '$got'"; fail=1; fi
}

# 1. No tag: first release is 1.0.0
r1="$tmp/r1"; git init -q -b main "$r1"
commit "$r1" "chore: init"
gi "$r1" switch -q -c dev
commit "$r1" "docs: readme"
check "docs only releases nothing" "$r1" bump none
commit "$r1" "fix(ui): typo"
check "no tag, fix -> 1.0.0" "$r1" next 1.0.0

# 2. Tagged v1.4.2: bump levels on top of each other
r2="$tmp/r2"; git init -q -b main "$r2"
commit "$r2" "feat: first"
gi "$r2" tag v1.4.2
gi "$r2" switch -q -c dev
commit "$r2" "chore: deps"
commit "$r2" "refactor: split module"
commit "$r2" "Merge pull request #9 from x/y"
check "chore/refactor/non-conventional release nothing" "$r2" bump none
check "last version read from tag" "$r2" last 1.4.2
commit "$r2" "perf(api): cache"
check "perf -> patch" "$r2" next 1.4.3
commit "$r2" "feat(ui): new card (#12)"
check "feat -> minor" "$r2" next 1.5.0
check "feat counted" "$r2" feat 1
commit "$r2" "fix!: drop old endpoint"
check "bang -> major" "$r2" next 2.0.0

# 3. BREAKING CHANGE footer, and revert
r3="$tmp/r3"; git init -q -b main "$r3"
commit "$r3" "feat: first"
gi "$r3" tag v0.9.0
gi "$r3" switch -q -c dev
commit "$r3" "revert: undo thing"
check "revert -> patch" "$r3" next 0.9.1
gi "$r3" commit -q --allow-empty -m "feat: new api" -m "BREAKING CHANGE: removes v1"
check "BREAKING CHANGE footer -> major" "$r3" next 1.0.0

# 4. Custom tagFormat, custom rules warning
r4="$tmp/r4"; git init -q -b main "$r4"
printf '%s\n' '{"tagFormat":"release-${version}","plugins":[["@semantic-release/commit-analyzer",{"preset":"conventionalcommits","releaseRules":[{"type":"docs","release":"patch"}]}]]}' > "$r4/.releaserc.json"
gi "$r4" add .releaserc.json
commit "$r4" "chore: init"
gi "$r4" tag release-2.0.0
gi "$r4" switch -q -c dev
commit "$r4" "fix: bug"
check "custom tagFormat" "$r4" next 2.0.1
check "custom tag prefix" "$r4" prefix release-
check "default tag prefix" "$r2" prefix v
check "releaseRules warns" "$r4" warn "custom releaseRules in the config: this result may differ from semantic-release"

# 5. Unknown ref fails
bash "$script" -C "$r1" main nope >/dev/null 2>&1
if [ $? -eq 3 ]; then echo "ok   unknown ref exits 3"; else echo "FAIL unknown ref"; fail=1; fi

exit $fail
