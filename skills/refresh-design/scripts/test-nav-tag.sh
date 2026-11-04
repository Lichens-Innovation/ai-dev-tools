#!/usr/bin/env bash
# Tests nav-tag.mjs on a throwaway bundle. Run with: bash test-nav-tag.sh
set -u
script="$(cd "$(dirname "$0")" && pwd)/nav-tag.mjs"
bundle="$(mktemp -d "${TMPDIR:-/tmp}/nav-tag.XXXXXX")"
trap 'rm -rf "$bundle"' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fail=1; fi; }

mkdir -p "$bundle/components/ui/Button" "$bundle/components/ui/Card" "$bundle/components/Deep/a/B"
printf '<html><body>x</body></html>\n' > "$bundle/components/ui/Button/Button.html"
printf '<p>no body tag</p>\n' > "$bundle/components/Deep/a/B/B.html"
printf '<html><body><script src="../../../design-nav.js"></script></body></html>\n' > "$bundle/components/ui/Card/Card.html"

node "$script" "$bundle" >/dev/null; check "reports missing cards" "$?" "1"
node "$script" "$bundle" --fix >/dev/null; check "fix exits 0" "$?" "0"
node "$script" "$bundle" >/dev/null; check "all cards load the navbar" "$?" "0"
check "tag before </body>" "$(grep -c 'design-nav.js"></script>' "$bundle/components/ui/Button/Button.html")" "1"
check "deeper card gets a longer path" "$(grep -c '"../../../../design-nav.js"' "$bundle/components/Deep/a/B/B.html")" "1"
check "existing tag untouched" "$(grep -c 'design-nav' "$bundle/components/ui/Card/Card.html")" "1"
node "$script" "${TMPDIR:-/tmp}/none" >/dev/null 2>&1; check "missing folder exits 2" "$?" "2"
exit $fail
