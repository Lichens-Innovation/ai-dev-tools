#!/usr/bin/env bash
# Screenshot a URL to a PNG: project Playwright first, then headless Chrome/Chromium.
# Usage: bash capture.sh <url> <out.png> [width,height]
# Env:   CHROME_BIN  explicit Chrome/Chromium binary (else looked up on PATH)
# Exit:  0 ok | 2 no capture tool available | 3 tool found but capture failed
set -u

url=${1:?usage: capture.sh <url> <out.png> [width,height]}
out=${2:?usage: capture.sh <url> <out.png> [width,height]}
size=${3:-1280,800}
w=${size%,*}
h=${size#*,}

ok() { [ -s "$out" ]; }

tried=0

if [ -x node_modules/.bin/playwright ]; then
  tried=1
  node_modules/.bin/playwright screenshot --viewport-size="$size" --wait-for-timeout=1500 "$url" "$out" 2>&1 && ok && exit 0
  echo "capture: playwright failed, trying Chrome/Chromium" >&2
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
  echo "capture: no project Playwright and no Chrome/Chromium on PATH (set CHROME_BIN)" >&2
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
