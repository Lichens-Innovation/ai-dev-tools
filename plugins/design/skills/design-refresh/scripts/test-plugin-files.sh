#!/usr/bin/env bash
# Tests plugin-files.mjs against the plugin's own files. Run with: bash test-plugin-files.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/plugin-files.mjs"
plugin="$(cd "$here/../../.." && pwd)"
templates="$plugin/skills/design-palette/templates"
palette="$plugin/skills/design-palette/scripts/palette.ts"
work="$(mktemp -d "${TMPDIR:-/tmp}/plugin-files.XXXXXX")"
trap 'rm -rf "$work"' EXIT
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fail=1; fi; }
has() { if grep -q -- "$2" "$3"; then echo "ok   $1"; else echo "FAIL $1 ('$2' not in $3)"; fail=1; fi; }
version="$(node -p "require('$plugin/.claude-plugin/plugin.json').version")"
cd "$work" || exit 1
pf() { node "$script" "$@" > out.json 2> err.txt; }
field() { node -p "JSON.stringify(require('./out.json')$1)" | tr -d '"'; }

# check: version states and the repo's palette.ts.
printf '{\n  "designProjectId": "p",\n  "reconcileRule": "canonical-wins",\n  "palette": { "script": "palette.ts" }\n}\n' > design.manifest.json
cp "$palette" palette.ts
pf check; check "unstamped exits 1" "$?" "1"; check "unstamped" "$(field .version)" "unstamped"
check "same palette.ts" "$(field .paletteScript.state)" "same"
pf stamp; check "stamp exits 0" "$?" "0"
check "stamped after reconcileRule" "$(node -p "Object.keys(require('./design.manifest.json')).join()")" "designProjectId,reconcileRule,pluginVersion,palette"
pf check; check "current exits 0" "$?" "0"; check "current" "$(field .version)" "current"
echo '// edited' >> palette.ts
pf check; check "edited palette.ts exits 1" "$?" "1"; check "differs" "$(field .paletteScript.state)" "differs"
cp "$palette" palette.ts
node -e "const f='design.manifest.json',m=require('./'+f);m.pluginVersion='0.0.1';require('fs').writeFileSync(f,JSON.stringify(m))"
pf check; check "behind exits 1" "$?" "1"; check "behind" "$(field .version)" "behind"
node -e "const f='design.manifest.json',m=require('./'+f);m.pluginVersion='99.0.0';require('fs').writeFileSync(f,JSON.stringify(m))"
pf check; check "ahead exits 3" "$?" "3"; check "ahead: no update" "$(field .update)" "false"
pf stamp; check "stamp refuses to downgrade" "$?" "2"
rm palette.ts; node -e "const f='design.manifest.json',m=require('./'+f);m.pluginVersion='$version';require('fs').writeFileSync(f,JSON.stringify(m))"
pf check; check "missing palette.ts" "$(field .paletteScript.state)" "missing"

# compare: a seeded card is the same code; an older navbar and card code differ.
mkdir remote
cp "$templates/design-nav.js" remote/design-nav.js
cp "$templates/palette-preview.dc.html" remote/Palette.dc.html
node "$palette" "$templates/theme.inputs.css" --to-card remote/Palette.dc.html --title Demo > /dev/null
pf compare remote; check "current files exit 0" "$?" "0"
check "seeded card is the same code" "$(field "['Palette.dc.html']")" "same"
check "no Tailwind card" "$(field "['Tailwind.html']")" "absent"
echo '// old' >> remote/design-nav.js
sed -i.bak 's|<title>|<title>Old |' remote/Palette.dc.html
pf compare remote; check "older files exit 1" "$?" "1"
check "older navbar" "$(field "['design-nav.js']")" "differs"
check "older card code" "$(field "['Palette.dc.html']")" "differs"

# card: the data survives, the code is the plugin's.
node -e "
const fs=require('fs'),f='remote/Palette.dc.html',h=fs.readFileSync(f,'utf8'),m=h.match(/data-props=\"([^\"]*)\"/);
const un=s=>s.replace(/&quot;/g,'\"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'),es=s=>s.replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const p=JSON.parse(un(m[1]));p.overrides.default={link:'info-text'};p.legacy={editor:null,default:1};fs.writeFileSync(f,h.replace(m[0],'data-props=\"'+es(JSON.stringify(p))+'\"'));"
old="$(shasum -a 256 remote/Palette.dc.html | cut -d' ' -f1)"
node -e "const f='design.manifest.json',m=require('./'+f);m.palette.lastImplementedHash='$old';require('fs').writeFileSync(f,JSON.stringify(m))"
pf card remote/Palette.dc.html new.html; check "card exits 0" "$?" "0"
check "dropped prop" "$(field .dropped.join\(\))" "legacy"
check "was the implemented card" "$(field .implemented)" "true"
check "new hash" "$(field .newHash)" "$(shasum -a 256 new.html | cut -d' ' -f1)"
mkdir fresh; cp new.html fresh/Palette.dc.html
pf compare fresh; check "new card has the plugin's code" "$(field "['Palette.dc.html']")" "same"
has "title kept" '&quot;default&quot;:&quot;Demo&quot;' new.html
has "override kept" '&quot;link&quot;:&quot;info-text&quot;' new.html
has "inputs kept" '&quot;primary&quot;:{&quot;lm&quot;:&quot;#401f3e&quot;' new.html
sed -i.bak 's|info-text|link|' remote/Palette.dc.html
pf card remote/Palette.dc.html bad.html; check "looping override fails" "$?" "2"
has "names the problem" "invalid token overrides" err.txt
check "nothing written on failure" "$(test -e bad.html && echo yes || echo no)" "no"
cp "$templates/palette-preview.dc.html" blank.html
pf card blank.html out.html; check "unseeded card fails" "$?" "2"
exit $fail
