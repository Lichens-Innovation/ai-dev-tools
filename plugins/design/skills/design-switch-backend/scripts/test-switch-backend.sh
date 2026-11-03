#!/usr/bin/env bash
# Tests switch-backend.mjs on a throwaway manifest. Run with: bash test-switch-backend.sh
set -u
script="$(cd "$(dirname "$0")" && pwd)/switch-backend.mjs"
proj="$(mktemp -d "${TMPDIR:-/tmp}/switch-backend.XXXXXX")"
trap 'rm -rf "$proj"' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fail=1; fi; }
sb() { node "$script" "$@" --manifest "$proj/design.manifest.json"; }
get() { node -e "const m=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const v=process.argv[2].split('.').reduce((o,k)=>o?.[k],m);console.log(v===undefined?'undefined':JSON.stringify(v))" "$proj/design.manifest.json" "$1"; }

mkdir -p "$proj/theme"
printf ':root{--bg:#fff}\n' > "$proj/theme/inputs.css"
inputs_hash=$(shasum -a 256 < "$proj/theme/inputs.css" | cut -d' ' -f1)
cat > "$proj/design.manifest.json" <<'JSON'
{
  "designProjectId": "abc",
  "reconcileRule": "canonical-wins",
  "palette": { "localPath": "theme/inputs.css", "script": "theme/palette.ts", "designPath": "Palette.dc.html", "thumbnailPath": "thumbnail.html", "status": "approved", "lastImplementedHash": "old" },
  "components": [
    { "name": "PrimaryButton", "localPath": "src/button.tsx", "storyId": "ui-button--default", "designPath": "components/ui/Button/Button.html", "proposalPath": "proposals/primary-button.html", "status": "approved", "lastImplementedHash": "old" }
  ],
  "screens": [
    { "name": "Home", "route": "/", "sources": ["src/home.tsx"], "viewport": "1440x900", "mockupPath": "screens/home.html", "mockupHash": "m", "proposalPath": "proposals/screens/home.html", "status": "wip", "lastImplementedHash": null }
  ]
}
JSON
cp "$proj/design.manifest.json" "$proj/original.json"

# plan writes nothing
sb plan local > /dev/null
check "plan leaves the manifest" "$(cmp -s "$proj/design.manifest.json" "$proj/original.json" && echo same)" "same"
check "plan of the current backend exits 1" "$(sb plan claude-design > /dev/null 2>&1; echo $?)" "1"
check "unknown backend exits 2" "$(sb apply figma > /dev/null 2>&1; echo $?)" "2"

# Claude Design (no backend field) -> local
sb apply local > /dev/null
check "backend" "$(get backend)" '"local"'
check "designProjectId dropped" "$(get designProjectId)" "undefined"
check "palette designPath" "$(get palette.designPath)" "null"
check "palette thumbnail dropped" "$(get palette.thumbnailPath)" "undefined"
check "palette hash is the inputs'" "$(get palette.lastImplementedHash)" "\"$inputs_hash\""
check "palette keeps its script" "$(get palette.script)" '"theme/palette.ts"'
check "component reference" "$(get components.0.designPath)" '"design/components/primary-button.html"'
check "component proposal" "$(get components.0.proposalPath)" '"design/proposals/primary-button.html"'
check "component back to wip" "$(get components.0.status)" '"wip"'
check "component hash reset" "$(get components.0.lastImplementedHash)" "null"
check "component keeps its story" "$(get components.0.storyId)" '"ui-button--default"'
check "screen mockup" "$(get screens.0.mockupPath)" '"design/screens/home.html"'
check "screen proposal" "$(get screens.0.proposalPath)" '"design/proposals/screens/home.html"'
check "screen mockupHash dropped" "$(get screens.0.mockupHash)" "undefined"
check "screen keeps its sources" "$(get screens.0.sources)" '["src/home.tsx"]'
check "other fields kept" "$(get reconcileRule)" '"canonical-wins"'
check "local again exits 1" "$(sb apply local > /dev/null 2>&1; echo $?)" "1"

# local -> Claude Design
node -e "const f=process.argv[1],m=JSON.parse(require('fs').readFileSync(f,'utf8'));m.studio={port:3010};require('fs').writeFileSync(f,JSON.stringify(m))" "$proj/design.manifest.json"
sb apply claude-design > /dev/null
check "back: backend" "$(get backend)" '"claude-design"'
check "back: studio dropped" "$(get studio)" "undefined"
check "back: palette card" "$(get palette.designPath)" '"Palette.dc.html"'
check "back: thumbnail" "$(get palette.thumbnailPath)" '"thumbnail.html"'
check "back: palette hash waits for the card" "$(get palette.lastImplementedHash)" "null"
check "back: component waits for its card" "$(get components.0.designPath)" "null"
check "back: no proposal until the card" "$(get components.0.proposalPath)" "null"
check "back: screen waits for its mockup" "$(get screens.0.mockupPath)" "null"
check "back: no temp file left" "$(ls "$proj" | grep -c tmp)" "0"

exit $fail
