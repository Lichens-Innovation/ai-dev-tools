#!/usr/bin/env bash
# Tests capture.mjs against a throwaway Storybook/app served from this script. Run with: bash test-capture.sh
# Playwright resolves from the working directory: set PLAYWRIGHT_DIR to a folder whose node_modules has it
# (default: the current directory). Without Playwright the browser tests are skipped.
set -u
script="$(cd "$(dirname "$0")" && pwd)/capture.mjs"
pwdir="${PLAYWRIGHT_DIR:-$PWD}"
proj="$(mktemp -d "${TMPDIR:-/tmp}/capture.XXXXXX")"
trap 'rm -rf "$proj"; [ -n "${server:-}" ] && kill "$server" 2>/dev/null' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fail=1; fi; }
field() { node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(process.argv[2].split('.').reduce((o,k)=>o?.[k],v))" "$1" "$2"; }

if ! (cd "$pwdir" && node -e "require('playwright')" 2>/dev/null); then
  echo "skip capture tests: Playwright not found from $pwdir (set PLAYWRIGHT_DIR)"; exit 0
fi

cat > "$proj/server.js" <<'JS'
const http = require('http');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const page = (inner) => `<!doctype html><html lang="en" class="theme"><head><title>Fake</title><link rel="stylesheet" href="/app.css"><style>.inline{color:red}</style></head>
<body class="sb-show-main">${inner}</body></html>`;
const routes = {
  '/iframe.html': () => ['text/html', page(`<div id="storybook-root"></div><div id="storybook-docs" style="display:none">docs</div>
<script>
  document.getElementById('storybook-root').innerHTML = '<button class="btn inline" onclick="alert(1)">Save <img src="/logo.png" alt="logo"></button>';
  var portal = document.createElement('div'); portal.id = 'portal'; portal.textContent = 'Dialog'; document.body.appendChild(portal);
</script>`)],
  '/empty.html': () => ['text/html', page('<div id="storybook-root"></div>')],
  '/screen': () => ['text/html', page('<main class="btn">Dashboard for ada@example.com</main><iframe src="https://example.com/x"></iframe><a href="/next">next</a>')],
  '/app.css': () => ['text/css', ':root{--primary:#00f}.btn{background:url(/bg.png) no-repeat}@font-face{font-family:F;src:url(/f.woff2) format("woff2")}'],
  '/logo.png': () => ['image/png', png], '/bg.png': () => ['image/png', png],
  '/f.woff2': () => ['font/woff2', Buffer.from('wOF2fake')],
};
http.createServer((req, res) => {
  const r = routes[req.url.split('?')[0]];
  if (!r) { res.statusCode = 404; return res.end('no'); }
  const [type, body] = r(); res.setHeader('content-type', type); res.end(body);
}).listen(0, '127.0.0.1', function () { console.log(this.address().port); });
JS
node "$proj/server.js" > "$proj/port" &
server=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$proj/port" ] && break; sleep 0.3; done
base="http://127.0.0.1:$(cat "$proj/port")"

mkdir -p "$proj/src"
printf 'export const Button = 1;\n' > "$proj/src/button.tsx"
printf 'screen\n' > "$proj/src/home.tsx"
cat > "$proj/design.manifest.json" <<JSON
{ "backend": "local",
  "components": [{ "name": "Button", "localPath": "src/button.tsx", "storyId": "ui-button--default", "designPath": "design/components/button.html", "proposalPath": "design/proposals/button.html", "status": "wip", "lastImplementedHash": null }],
  "screens": [{ "name": "Home", "route": "/", "sources": ["src/home.tsx"], "mockupPath": "design/screens/home.html", "proposalPath": "design/proposals/screens/home.html", "status": "wip", "lastImplementedHash": null }] }
JSON
cap() { (cd "$pwdir" && node "$script" "$@" --manifest "$proj/design.manifest.json"); }
page="$proj/design/components/button.html"

cap component Button --storybook-url "$base" --story-id ui-button--default >"$proj/out.json" 2>"$proj/err.txt"; check "component capture exits 0" "$?" "0"
check "reference written" "$([ -f "$page" ] && echo yes)" "yes"
check "story markup captured" "$(grep -c 'class="btn inline"' "$page")" "1"
check "portalled node captured" "$(grep -c 'id="portal"' "$page")" "1"
check "scripts stripped" "$(grep -ci '<script\|onclick' "$page")" "0"
check "storybook docs container dropped" "$(grep -c storybook-docs "$page")" "0"
check "html and body attributes kept" "$(grep -c '<html lang="en" class="theme" data-theme="light">' "$page")" "1"
check "body class kept" "$(grep -c '<body class="sb-show-main">' "$page")" "1"
check "image rewritten to assets/" "$(grep -c 'src="../assets/[0-9a-f]\{16\}\.png"' "$page")" "1"
check "page links project.css" "$(grep -c 'href="../assets/project.css"' "$page")" "1"
css="$proj/design/assets/project.css"
check "css has the app rules" "$(grep -c -- '--primary' "$css")" "1"
check "css has the inline style rules" "$(grep -c 'color: red' "$css")" "1"
check "css image rewritten" "$(grep -c 'url("[0-9a-f]\{16\}\.png")' "$css")" "1"
check "css font rewritten" "$(grep -c 'url("[0-9a-f]\{16\}\.woff2")' "$css")" "1"
check "no absolute url left in the css" "$(grep -c '127.0.0.1\|url(/' "$css")" "0"
check "assets saved, identical bytes once" "$(ls "$proj/design/assets" | grep -c '\.png$\|\.woff2$')" "2"
check "index row" "$(field "$proj/design/index.json" pages.0.storyId)" "ui-button--default"
check "index referenceHash is the file's" "$(field "$proj/design/index.json" pages.0.referenceHash)" "$(shasum -a 256 < "$page" | cut -d' ' -f1)"
check "index sourceHash is the sources'" "$(field "$proj/design/index.json" pages.0.sourceHash)" "$(shasum -a 256 < "$proj/src/button.tsx" | cut -d' ' -f1)"
check "index proposal path" "$(field "$proj/design/index.json" pages.0.proposal)" "proposals/button.html"
check "no warning for a component" "$(grep -c WARNING "$proj/err.txt")" "0"

# Only loads from design/assets: the check the studio applies to a page.
check "page loads only assets" "$(grep -o '\(src\|href\)="[^"]*"' "$page" | grep -vc '"\.\./assets/\|"#')" "0"

# Recapture after a code change: updated reference, same single css block per sheet.
printf 'export const Button = 2;\n' > "$proj/src/button.tsx"
cap component Button --storybook-url "$base" --story-id ui-button--default >/dev/null 2>&1; check "recapture exits 0" "$?" "0"
check "recapture updates the source hash" "$(field "$proj/design/index.json" pages.0.sourceHash)" "$(shasum -a 256 < "$proj/src/button.tsx" | cut -d' ' -f1)"
check "recapture keeps one css block per sheet" "$(grep -c 'design-capture sheet' "$css")" "2"

# Refuses an edited reference, unless forced.
printf '<!-- hand edit -->\n' >> "$page"
cap component Button --storybook-url "$base" --story-id ui-button--default >/dev/null 2>"$proj/err.txt"; check "edited reference: exits 3" "$?" "3"
check "edited reference: left alone" "$(grep -c 'hand edit' "$page")" "1"
check "edited reference: says why" "$(grep -c 'edited since it was captured' "$proj/err.txt")" "1"
cap component Button --storybook-url "$base" --story-id ui-button--default --force >/dev/null 2>&1; check "--force overwrites" "$?" "0"
check "--force restores the capture" "$(grep -c 'hand edit' "$page")" "0"

# A screen: warning, mockupHash on the manifest row, iframe dropped.
cap screen Home --url "$base/screen" --viewport 1280x800 >"$proj/out.json" 2>"$proj/err.txt"; check "screen capture exits 0" "$?" "0"
check "screen: real-data warning" "$(grep -c 'real dev data' "$proj/err.txt")" "1"
check "screen: points to the sample-data rule" "$(grep -c 'local-studio.md#sample-data' "$proj/err.txt")" "1"
shome="$proj/design/screens/home.html"
check "screen: mockupHash recorded" "$(field "$proj/design.manifest.json" screens.0.mockupHash)" "$(shasum -a 256 < "$shome" | cut -d' ' -f1)"
check "screen: sourceHash recorded" "$(field "$proj/design.manifest.json" screens.0.sourceHash)" "$(shasum -a 256 < "$proj/src/home.tsx" | cut -d' ' -f1)"
check "screen: frame dropped" "$(grep -c '<iframe' "$shome")" "0"
check "screen: links kept" "$(grep -c 'href="/next"' "$shome")" "1"
check "screen: index route" "$(field "$proj/design/index.json" pages.1.route)" "/"
check "screen: both pages share the css" "$(grep -c 'design-capture sheet' "$css")" "2"
check "screen: owners listed" "$(grep -c 'owners=component:button,screen:home' "$css")" "2"
printf '<!-- edited -->' >> "$shome"
cap screen Home --url "$base/screen" >/dev/null 2>&1; check "edited screen: exits 3" "$?" "3"

# Failures.
(cd "$pwdir" && node "$script" component Ghost --storybook-url "$base" --story-id x --manifest "$proj/design.manifest.json" >/dev/null 2>&1); check "unknown row exits 2" "$?" "2"
(cd "$pwdir" && node "$script" screen Home --manifest "$proj/design.manifest.json" >/dev/null 2>&1); check "missing --url exits 2" "$?" "2"
exit $fail
