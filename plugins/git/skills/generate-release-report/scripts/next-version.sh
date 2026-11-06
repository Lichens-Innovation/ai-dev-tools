#!/usr/bin/env bash
# Emulate the version semantic-release would compute (default @semantic-release/commit-analyzer rules).
# Usage: bash next-version.sh [-C <dir>] [base-ref] [head-ref]     (defaults: origin/main origin/dev)
# It simulates merging head into base: commits reachable from base or head, since the last release tag on base.
# Rules: BREAKING CHANGE footer or "!" after the type = major | feat = minor | fix, perf, revert = patch.
#        Every other type (docs, chore, refactor, build, ci, test, style) and non-conventional subjects release nothing.
#        No previous tag: first release is 1.0.0.
# Output (key=value, one per line): tag, prefix (tag format before the version, e.g. v), last, bump, next, feat, fix, breaking, warn (zero or more).
# It never contacts the network and never runs semantic-release. It reads .releaserc* from base only to
# honour tagFormat and to warn when custom rules make the result unreliable.
set -u

dir=.
if [ "${1:-}" = "-C" ]; then dir=${2:?-C needs a directory}; shift 2; fi
base=${1:-origin/main}
head=${2:-origin/dev}
g() { git -C "$dir" "$@"; }

for r in "$base" "$head"; do
  g rev-parse --verify --quiet "$r^{commit}" >/dev/null || { echo "next-version: unknown ref '$r' (git fetch origin main dev?)" >&2; exit 3; }
done

cfg=
for f in .releaserc.json .releaserc .releaserc.yml .releaserc.yaml; do
  cfg=$(g show "$base:$f" 2>/dev/null) && [ -n "$cfg" ] && break
  cfg=
done
if [ -z "$cfg" ]; then
  cfg=$(g show "$base:package.json" 2>/dev/null | grep -A40 '"release"' || true)
fi

warns=()
if [ -z "$cfg" ]; then
  warns+=("no semantic-release config found on $base: default rules and tag format v\${version} assumed")
fi

fmt=$(printf '%s\n' "$cfg" | grep -o '"tagFormat"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/^[^:]*:[[:space:]]*"//; s/"$//')
[ -z "$fmt" ] && fmt='v${version}'
prefix=${fmt%%\$\{version\}*}

if printf '%s\n' "$cfg" | grep -q 'releaseRules'; then
  warns+=("custom releaseRules in the config: this result may differ from semantic-release")
fi
preset=$(printf '%s\n' "$cfg" | grep -o '"preset"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/^[^:]*:[[:space:]]*"//; s/"$//')
case "$preset" in
  ""|conventionalcommits|angular) ;;
  *) warns+=("preset '$preset' is not angular/conventionalcommits: rules may differ") ;;
esac

tag=$(g describe --tags --abbrev=0 --match "${prefix}[0-9]*" "$base" 2>/dev/null || true)
last=
[ -n "$tag" ] && last=${tag#"$prefix"}

range=("$base" "$head")
[ -n "$tag" ] && range+=("^$tag")

n_feat=0; n_fix=0; n_break=0; n_patch_only=0
nl=$'\n'
while IFS= read -r -d $'\x1e' msg; do
  msg=${msg#"$nl"}
  [ -z "$msg" ] && continue
  header=${msg%%"$nl"*}
  type=
  bang=
  if [[ $header =~ ^([A-Za-z]+)(\([^\)]*\))?(!)?:[[:space:]] ]]; then
    type=$(printf '%s' "${BASH_REMATCH[1]}" | tr 'A-Z' 'a-z')
    bang=${BASH_REMATCH[3]}
  fi
  if [ -n "$bang" ] || [[ $msg =~ (^|$nl)BREAKING[\ -]CHANGE: ]]; then
    n_break=$((n_break + 1))
    continue
  fi
  case "$type" in
    feat) n_feat=$((n_feat + 1)) ;;
    fix|perf|revert) n_fix=$((n_fix + 1)) ;;
  esac
done < <(g log --format='%B%x1e' "${range[@]}")

if [ "$n_break" -gt 0 ]; then bump=major
elif [ "$n_feat" -gt 0 ]; then bump=minor
elif [ "$n_fix" -gt 0 ]; then bump=patch
else bump=none
fi

next=
if [ "$bump" != none ]; then
  if [ -z "$last" ]; then
    next=1.0.0
  else
    core=${last%%-*}
    IFS=. read -r ma mi pa <<EOF
$core
EOF
    case "$bump" in
      major) next="$((ma + 1)).0.0" ;;
      minor) next="$ma.$((mi + 1)).0" ;;
      patch) next="$ma.$mi.$((pa + 1))" ;;
    esac
  fi
fi

echo "tag=$tag"
echo "prefix=$prefix"
echo "last=$last"
echo "bump=$bump"
echo "next=$next"
echo "feat=$n_feat"
echo "fix=$n_fix"
echo "breaking=$n_break"
i=0
while [ "$i" -lt "${#warns[@]}" ]; do echo "warn=${warns[$i]}"; i=$((i + 1)); done
exit 0
