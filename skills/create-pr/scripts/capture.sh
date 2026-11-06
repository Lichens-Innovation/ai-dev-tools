#!/usr/bin/env bash
# Screenshot a URL to a PNG: project Playwright first, then headless Chrome/Chromium.
# Usage: bash capture.sh [--storage-state <file>] <url> <out.png> [width,height]
# Env:   PLAYWRIGHT_BIN  explicit Playwright binary (else the repo root, then apps/*, packages/*)
#        CHROME_BIN      explicit Chrome/Chromium binary (else looked up on PATH)
# --storage-state: a Playwright session file (cookies + localStorage) to reuse a login.
#   Only Playwright can load it; the Chrome fallback is refused so a login page is never shot by mistake.
#   The file is never read or printed here.
# Exit:  0 ok | 2 no capture tool available | 3 tool found but capture failed
set -u

state=
if [ "${1:-}" = "--storage-state" ]; then
  state=${2:?--storage-state needs a file}
  [ -s "$state" ] || { echo "capture: storage state '$state' not found" >&2; exit 3; }
  shift 2
fi

url=${1:?usage: capture.sh [--storage-state <file>] <url> <out.png> [width,height]}
out=${2:?usage: capture.sh [--storage-state <file>] <url> <out.png> [width,height]}
size=${3:-1280,800}
w=${size%,*}
h=${size#*,}

ok() { [ -s "$out" ]; }

tried=0

pw=${PLAYWRIGHT_BIN:-}
if [ -z "$pw" ]; then
  for p in node_modules/.bin/playwright */*/node_modules/.bin/playwright; do
    if [ -x "$p" ]; then pw=$p; break; fi
  done
fi

if [ -n "$pw" ] && [ -x "$pw" ]; then
  tried=1
  args=(--viewport-size="$size" --wait-for-timeout=1500)
  [ -n "$state" ] && args+=(--load-storage="$state")
  rm -f "$out"
  "$pw" screenshot "${args[@]}" "$url" "$out" 2>&1 && ok && exit 0
  # Playwright's own browser may not be downloaded: retry with the installed Chrome.
  echo "capture: playwright failed, retrying with the installed Chrome channel" >&2
  rm -f "$out"
  "$pw" screenshot --channel=chrome "${args[@]}" "$url" "$out" 2>&1 && ok && exit 0
  echo "capture: playwright failed" >&2
fi

if [ -n "$state" ]; then
  echo "capture: a stored login needs Playwright and it failed or is missing (PLAYWRIGHT_BIN)" >&2
  [ "$tried" = 1 ] && exit 3
  exit 2
fi

chrome=${CHROME_BIN:-}
if [ -z "$chrome" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then chrome=$c; break; fi
  done
fi

if [ -n "$chrome" ] && ! command -v "$chrome" >/dev/null 2>&1; then
  echo "capture: CHROME_BIN '$chrome' is not executable" >&2
  chrome=
fi

if [ -z "$chrome" ]; then
  [ "$tried" = 1 ] && exit 3
  echo "capture: no Playwright and no Chrome/Chromium on PATH (set PLAYWRIGHT_BIN or CHROME_BIN)" >&2
  exit 2
fi

profile=$(mktemp -d "${TMPDIR:-/tmp}/pr-shot-profile.XXXXXX")
trap 'rm -rf "$profile"' EXIT

run_chrome() {
  "$chrome" --headless=new --disable-gpu --hide-scrollbars \
    --user-data-dir="$profile" --window-size="$w,$h" \
    --virtual-time-budget=5000 --screenshot="$out" "$@" "$url" >/dev/null 2>&1
}

rm -f "$out"
run_chrome && ok && exit 0

# Chrome's own sandbox cannot nest inside an OS sandbox (Seatbelt, containers).
# Retry without it, but only for pages served from this machine.
case "$url" in
  http://localhost*|http://127.0.0.1*)
    echo "capture: retrying Chrome with --no-sandbox (local URL only)" >&2
    rm -f "$out"
    run_chrome --no-sandbox && ok && exit 0
    ;;
esac

echo "capture: Chrome failed; see references/sandbox.md" >&2
exit 3
