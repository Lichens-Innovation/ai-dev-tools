#!/usr/bin/env bash
# Tests capture.mjs against a throwaway Storybook/app served from this script. Run with: bash test-capture.sh
# Playwright resolves from the working directory: set PLAYWRIGHT_DIR to a folder whose node_modules has it
# (default: the current directory); screen captures also need @faker-js/faker there. Without Playwright the
# browser tests are skipped; without faker the screen tests are (and the missing-faker message is checked).
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
  '/people': () => ['text/html', page(`<h1>People</h1><header class="who">Signed in as Ada Lovelace</header><ul id="list"></ul>
<script>fetch('/api/people').then(r => r.json()).then(d => { document.getElementById('list').innerHTML = d.people.map(p =>
  '<li><span class="n">' + p.name + '</span> <a class="e" href="#">' + p.email + '</a> <i class="p">' + p.phone + '</i> <b>' + p.role + '</b> <u>' + p.fileName + '</u></li>').join(''); });</script>`)],
  '/api/people': () => ['application/json', JSON.stringify({ people: [
    { id: 7, name: 'Ada Lovelace', email: 'ada@lovelace.dev', phone: '+1 (415) 555-0134', role: 'Admin', fileName: 'report.pdf' },
    { id: 8, name: 'Alan Turing', email: 'alan@bletchley.uk', phone: '020 7946 0958', role: 'Editor', fileName: 'notes.pdf' }] })],
  '/ssr': () => ['text/html', page(`<h1>Team</h1><div class="owner">Grace Hopper</div><div class="contact">grace@navy.mil / 202-555-0188</div><p class="note">Invoice 4417 sent</p><ul id="list"></ul>
<script>fetch('/api/team').then(r => r.json()).then(d => { document.getElementById('list').innerHTML = d.map(p => '<li class="m">' + p.fullName + '</li>').join(''); });</script>`)],
  '/api/team': () => ['application/json', JSON.stringify([{ fullName: 'Grace Hopper' }])],
  '/leak': () => ['text/html', page('<h1>Settings</h1><div class="contact">Call 202-555-0199 or mail bob@corp.io</div><div data-session="Bearer abcdef0123456789xyz">x</div><code class="tok">eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U</code><p>Support: help@acme.com</p>')],
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
  "screens": [
    { "name": "Home", "route": "/", "sources": ["src/home.tsx"], "mockupPath": "design/screens/home.html", "proposalPath": "design/proposals/screens/home.html", "status": "wip", "lastImplementedHash": null, "anonymize": { "allow": ["ada@example.com"] } },
    { "name": "People", "route": "/people", "sources": ["src/home.tsx"], "mockupPath": "design/screens/people.html", "proposalPath": "design/proposals/screens/people.html", "status": "wip", "lastImplementedHash": null, "anonymize": { "redact": [".who"] } },
    { "name": "Team", "route": "/ssr", "sources": ["src/home.tsx"], "mockupPath": "design/screens/team.html", "proposalPath": "design/proposals/screens/team.html", "status": "wip", "lastImplementedHash": null, "anonymize": { "redact": [".owner", ".contact", ".nothing"] } },
    { "name": "Leak", "route": "/leak", "sources": ["src/home.tsx"], "mockupPath": "design/screens/leak.html", "proposalPath": "design/proposals/screens/leak.html", "status": "wip", "lastImplementedHash": null } ] }
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

# Screens anonymise the app's data with @faker-js/faker, resolved from the working directory.
nofaker="$proj/nofaker"
if (cd "$pwdir" && node -e "require('@faker-js/faker')" 2>/dev/null); then
  mkdir -p "$nofaker/node_modules"; ln -s "$(cd "$pwdir" && node -p "require('path').dirname(require.resolve('playwright/package.json'))")" "$nofaker/node_modules/playwright"
  hasfaker=1
else
  nofaker="$pwdir"; hasfaker=0
fi
(cd "$nofaker" && node "$script" screen Home --url "$base/screen" --manifest "$proj/design.manifest.json" >/dev/null 2>"$proj/err.txt"); check "no faker: screen exits 2" "$?" "2"
check "no faker: names the install command" "$(grep -c 'npm i -D @faker-js/faker' "$proj/err.txt")" "1"
check "no faker: nothing written" "$([ -e "$proj/design/screens" ] && echo yes || echo no)" "no"
if [ "$hasfaker" = 0 ]; then echo "skip screen tests: @faker-js/faker not found from $pwdir"; exit $fail; fi

# A screen: mockupHash on the manifest row, iframe dropped.
cap screen Home --url "$base/screen" --viewport 1280x800 >"$proj/out.json" 2>"$proj/err.txt"; check "screen capture exits 0" "$?" "0"
check "screen: no real-data warning any more" "$(grep -c 'real dev data' "$proj/err.txt")" "0"
check "screen: allowed value kept" "$(grep -c 'ada@example.com' "$proj/design/screens/home.html")" "1"
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

# Layer 1: the JSON API's personal fields are faked; deterministic; the same value, the same fake.
people="$proj/design/screens/people.html"
cap screen People --url "$base/people" >/dev/null 2>"$proj/err.txt"; check "json: capture exits 0" "$?" "0"
check "json: no real name" "$(grep -c 'Ada Lovelace\|Alan Turing' "$people")" "0"
check "json: no real email" "$(grep -c 'lovelace.dev\|bletchley.uk' "$people")" "0"
check "json: no real phone" "$(grep -c '555-0134\|7946 0958' "$people")" "0"
check "json: two fake emails" "$(grep -o 'class="e" href="#">[^<@]*@[^<]*<' "$people" | wc -l | tr -d ' ')" "2"
check "json: non-personal fields survive" "$(grep -o '<b>Admin</b>\|<b>Editor</b>\|<u>report.pdf</u>' "$people" | wc -l | tr -d ' ')" "3"
check "json: UI labels survive" "$(grep -c '<h1>People</h1>' "$people")" "1"
cp "$people" "$proj/people.first"
cap screen People --url "$base/people" >/dev/null 2>&1; check "json: recapture exits 0" "$?" "0"
check "json: recapture is byte-identical" "$(cmp -s "$people" "$proj/people.first" && echo same)" "same"

# Layer 2: redact selectors, and the same fake as the JSON for the same real value.
team="$proj/design/screens/team.html"
cap screen Team --url "$base/ssr" >/dev/null 2>"$proj/err.txt"; check "redact: capture exits 0" "$?" "0"
check "redact: server-rendered data replaced" "$(grep -c 'Hopper\|navy.mil\|555-0188' "$team")" "0"
check "redact: a fake email stands in" "$(grep -c 'class="contact">[^<@ ]*@[^<]* / [^<]*<' "$team")" "1"
check "redact: text outside the selectors untouched" "$(grep -o '<h1>Team</h1>\|Invoice 4417 sent' "$team" | wc -l | tr -d ' ')" "2"
check "redact: same real value, same fake as the json" "$(grep -o 'class="owner">[^<]*' "$team" | cut -d'>' -f2)" "$(grep -o 'class="m">[^<]*' "$team" | cut -d'>' -f2)"
check "redact: warns about a selector that matches nothing" "$(grep -c '".nothing" matches nothing' "$proj/err.txt")" "1"
check "redact: the json name is faked too" "$(grep -c 'class="m">Grace Hopper' "$team")" "0"
check "json: same name in the header and the list" "$(grep -o 'class="who">[^<]*' "$people" | sed 's/.*Signed in as //')" "$(grep -o 'class="n">[^<]*' "$people" | head -1 | cut -d'>' -f2)"

# Layer 3: what is still personal fails the capture: dedicated exit code, no files, every match named.
cap screen Leak --url "$base/leak" >"$proj/out.json" 2>"$proj/err.txt"; check "final check: exits 4" "$?" "4"
check "final check: no reference" "$([ -e "$proj/design/screens/leak.html" ] && echo yes || echo no)" "no"
check "final check: manifest row untouched" "$(field "$proj/design.manifest.json" screens.3.mockupHash)" "undefined"
check "final check: no index row" "$(grep -c leak "$proj/design/index.json")" "0"
check "final check: names the email and its element" "$(grep -c 'email "bob@corp.io" in text of .*div.contact' "$proj/err.txt")" "1"
check "final check: names the phone" "$(grep -c 'phone "202-555-0199"' "$proj/err.txt")" "1"
check "final check: names the Bearer token and its attribute" "$(grep -c 'Bearer .*attribute data-session' "$proj/err.txt")" "1"
check "final check: names the JWT and its element" "$(grep -c 'JWT.* in text of .*code.tok' "$proj/err.txt")" "1"
check "final check: names the footer address" "$(grep -c 'help@acme.com' "$proj/err.txt")" "1"
node -e "
const f='$proj/design.manifest.json', m=JSON.parse(require('fs').readFileSync(f,'utf8'));
m.screens[3].anonymize={ allow: ['bob@corp.io','202-555-0199','Bearer abcdef0123456789xyz','help@acme.com','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'] };
require('fs').writeFileSync(f, JSON.stringify(m,null,2));"
cap screen Leak --url "$base/leak" >/dev/null 2>"$proj/err.txt"; check "allow: listed values pass" "$?" "0"
check "allow: reference written" "$([ -e "$proj/design/screens/leak.html" ] && echo yes)" "yes"

# The final check leaves alone what is not data about anyone, and still finds a token in a url's query.
finds() { (cd "$pwdir" && node --input-type=module -e "
import { createRequire } from 'node:module';
const { faker } = createRequire(process.cwd() + '/noop.js')('@faker-js/faker');
const { createAnonymizer } = await import(process.argv[1]);
console.log(createAnonymizer(faker).findings([{ value: process.argv[2], where: 'x' }]).map((f) => f.kind).join(',') || 'none');
" "$(dirname "$script")/anonymize.mjs" "$1"); }
check "final check: inline image is not a token" "$(finds 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA')" "none"
check "final check: bundle hash in a path is not a token" "$(finds '/static/js/main.4f2a9c1e7b3d5f6a8c9e0b1d2f3a4c5e.chunk.js')" "none"
check "final check: token in a url query is" "$(finds 'https://cdn.example.com/a.png?sig=4f2a9c1e7b3d5f6a8c9e0b1d2f3a4c5e')" "token (hex)"
check "final check: thousands are not a phone" "$(finds 'Total 12 345 678 \$')" "none"
check "final check: a phone still is" "$(finds 'Call 514 555 0188')" "phone"

# Failures.
(cd "$pwdir" && node "$script" component Ghost --storybook-url "$base" --story-id x --manifest "$proj/design.manifest.json" >/dev/null 2>&1); check "unknown row exits 2" "$?" "2"
(cd "$pwdir" && node "$script" screen Home --manifest "$proj/design.manifest.json" >/dev/null 2>&1); check "missing --url exits 2" "$?" "2"
exit $fail
