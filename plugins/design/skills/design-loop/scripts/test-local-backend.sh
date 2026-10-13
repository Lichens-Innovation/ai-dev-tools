#!/usr/bin/env bash
# Tests local-backend.mjs on a throwaway project. Run with: bash test-local-backend.sh
set -u
script="$(cd "$(dirname "$0")" && pwd)/local-backend.mjs"
proj="$(mktemp -d "${TMPDIR:-/tmp}/local-backend.XXXXXX")"
trap 'rm -rf "$proj"; [ -n "${server:-}" ] && kill "$server" 2>/dev/null' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fail=1; fi; }
lb() { node "$script" "$@" --manifest "$proj/design.manifest.json" --out "$proj/out"; }
field() { node -e "const v=JSON.parse(process.argv[1]);console.log(process.argv[2].split('.').reduce((o,k)=>o?.[k],v))" "$1" "$2"; }
sha() { shasum -a 256 | cut -d' ' -f1; }

mkdir -p "$proj/src/button" "$proj/src/screens" "$proj/design/components" "$proj/design/proposals/screens" "$proj/design/screens" "$proj/theme"
printf 'export const Button = 1;\n' > "$proj/src/button/index.tsx"
printf 'export default {};\n' > "$proj/src/button/button.stories.tsx"
printf 'export default { title: "Card" };\n' > "$proj/src/button/card.stories.tsx"
printf 'screen\n' > "$proj/src/screens/home.tsx"
printf ':root{--bg:#fff}\n' > "$proj/theme/inputs.css"
printf '<p>button</p>\n' > "$proj/design/components/button.html"
printf '<p>button, bigger</p>\n' > "$proj/design/proposals/button.html"
printf '<p>home</p>\n' > "$proj/design/screens/home.html"
ref_hash=$(sha < "$proj/design/components/button.html")
mock_hash=$(sha < "$proj/design/screens/home.html")
src_hash=$(cat "$proj/src/button/index.tsx" "$proj/src/button/button.stories.tsx" | sha)
cat > "$proj/design.manifest.json" <<JSON
{
  "backend": "local",
  "palette": { "localPath": "theme/inputs.css", "designPath": null, "status": "wip", "lastImplementedHash": null },
  "components": [
    { "name": "Button", "localPath": "src/button/index.tsx", "storyId": "ui-button--default", "designPath": "design/components/button.html", "proposalPath": "design/proposals/button.html", "status": "approved", "lastImplementedHash": null }
  ],
  "screens": [
    { "name": "Home", "route": "/", "sources": ["src/screens/home.tsx"], "mockupPath": "design/screens/home.html", "mockupHash": "$mock_hash", "proposalPath": "design/proposals/screens/home.html", "status": "wip", "lastImplementedHash": null }
  ]
}
JSON
cat > "$proj/design/index.json" <<JSON
{ "pages": [
  { "kind": "component", "name": "button", "reference": "components/button.html", "proposal": "proposals/button.html", "sourceHash": "$src_hash", "referenceHash": "$ref_hash" },
  { "kind": "screen", "name": "home", "reference": "screens/home.html", "proposal": "proposals/screens/home.html", "sourceHash": "stale", "referenceHash": "$mock_hash" }
] }
JSON

out=$(lb list); check "list: proposal exists" "$(field "$out" items.1.exists)" "true"
check "list: proposal hash" "$(field "$out" items.1.hash)" "$(sha < "$proj/design/proposals/button.html")"
check "list: missing screen proposal" "$(field "$out" items.2.exists)" "false"
check "list: palette hash is its inputs file" "$(field "$out" items.0.hash)" "$(sha < "$proj/theme/inputs.css")"
check "list: backend" "$(field "$out" backend)" "local"

out=$(lb fetch Button); check "fetch: hash is the proposal's" "$(field "$out" hash)" "$(sha < "$proj/design/proposals/button.html")"
check "fetch: target bytes copied" "$(cmp "$proj/out/Button.target.html" "$proj/design/proposals/button.html" && echo same)" "same"
check "fetch: reference copied" "$(field "$out" reference)" "$proj/out/Button.reference.html"
lb fetch Home >/dev/null 2>&1; check "fetch: no proposal exits 2" "$?" "2"
lb fetch palette >/dev/null 2>&1; check "fetch: palette exits 2" "$?" "2"
printf '<p>home, new</p>\n' > "$proj/design/proposals/screens/home.html"
out=$(lb fetch Home); check "fetch screen: mockup copied" "$(field "$out" reference)" "$proj/out/Home.mockup.html"
check "fetch screen: mockup matches its hash" "$(field "$out" mockupMatches)" "true"

check "render-url" "$(lb render-url Button)" "http://localhost:3009/render/proposals/button.html"
check "render-url screen, own url" "$(lb render-url Home --studio-url http://localhost:4000/)" "http://localhost:4000/render/proposals/screens/home.html"

check "source-hash: sources and the story next to it" "$(lb source-hash Button)" "$src_hash"
check "source-hash: another component's story is left out" "$(cat "$proj/src/button/index.tsx" "$proj/src/button/card.stories.tsx" | sha | grep -c "$(lb source-hash Button)")" "0"

lb check >/dev/null; check "check: a stale screen exits 1" "$?" "1"
out=$(lb check); check "check: button is current" "$(field "$out" items.0.state)" "current"
check "check: screen is stale" "$(field "$out" items.1.state)" "stale"
printf 'export const Button = 2;\n' > "$proj/src/button/index.tsx"
out=$(lb check); check "check: changed source makes the component stale" "$(field "$out" items.0.state)" "stale"
printf 'export default { title: 2 };\n' > "$proj/src/button/button.stories.tsx"
printf 'export const Button = 1;\n' > "$proj/src/button/index.tsx"
out=$(lb check); check "check: changed story makes it stale" "$(field "$out" items.0.state)" "stale"
printf 'export default {};\n' > "$proj/src/button/button.stories.tsx"
printf '<p>edited by hand</p>\n' > "$proj/design/components/button.html"
out=$(lb check); check "check: an edited reference is reported" "$(field "$out" items.0.state)" "edited"
rm "$proj/design/components/button.html"
out=$(lb check); check "check: a missing reference is not captured" "$(field "$out" items.0.state)" "not-captured"

# A path that leaves design/ is refused.
sed -i 's|design/proposals/button.html|../outside.html|' "$proj/design.manifest.json"
lb list >/dev/null 2>&1; check "paths outside design/ exit 2" "$?" "2"

# status: against a tiny server that answers /render/index.json
node -e "require('http').createServer((q,r)=>{r.statusCode=q.url==='/render/index.json'?200:404;r.end('{}')}).listen(0,'127.0.0.1',function(){console.log(this.address().port)})" > "$proj/port" &
server=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$proj/port" ] && break; sleep 0.3; done
port=$(cat "$proj/port")
out=$(lb status --studio-url "http://127.0.0.1:$port"); check "status: studio up" "$(field "$out" up)" "true"
kill $server; sleep 0.3
lb status --studio-url "http://127.0.0.1:$port" >/dev/null; check "status: studio down exits 1" "$?" "1"
exit $fail
