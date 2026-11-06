#!/usr/bin/env bash
# Render an HTML file to an A4 PDF: headless Chrome/Chromium first (honours @page margins
# and page numbers), then the project's Playwright.
# Usage: bash render-pdf.sh <report.html> <out.pdf>
# Env:   CHROME_BIN      explicit Chrome/Chromium binary (else looked up on PATH)
#        PLAYWRIGHT_BIN  explicit Playwright binary (else the repo root, then apps/*, packages/*)
# Exit:  0 ok | 2 no renderer available | 3 renderer found but PDF not produced
set -u

html=${1:?usage: render-pdf.sh <report.html> <out.pdf>}
pdf=${2:?usage: render-pdf.sh <report.html> <out.pdf>}

[ -f "$html" ] || { echo "render: $html not found" >&2; exit 3; }
case "$html" in /*) abs=$html ;; *) abs=$PWD/$html ;; esac
url="file://$abs"

ok() { [ -s "$pdf" ]; }
tried=0

chrome=${CHROME_BIN:-}
if [ -z "$chrome" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser chrome; do
    if command -v "$c" >/dev/null 2>&1; then chrome=$c; break; fi
  done
fi
if [ -n "$chrome" ] && ! command -v "$chrome" >/dev/null 2>&1; then
  echo "render: CHROME_BIN '$chrome' is not executable" >&2
  chrome=
fi

if [ -n "$chrome" ]; then
  tried=1
  profile=$(mktemp -d "${TMPDIR:-/tmp}/release-pdf-profile.XXXXXX")
  trap 'rm -rf "$profile"' EXIT
  run_chrome() {
    "$chrome" --headless=new --disable-gpu --user-data-dir="$profile" \
      --no-pdf-header-footer --print-to-pdf="$pdf" "$@" "$url" >/dev/null 2>&1
  }
  rm -f "$pdf"
  run_chrome && ok && exit 0
  # Chrome's own sandbox cannot nest inside an OS sandbox. The page is a local file we
  # generated, so retrying without it is acceptable.
  echo "render: retrying Chrome with --no-sandbox (local file only)" >&2
  rm -f "$pdf"
  run_chrome --no-sandbox && ok && exit 0
fi

pw=${PLAYWRIGHT_BIN:-}
if [ -z "$pw" ]; then
  for p in node_modules/.bin/playwright */*/node_modules/.bin/playwright; do
    if [ -x "$p" ]; then pw=$p; break; fi
  done
fi

if [ -n "$pw" ] && [ -x "$pw" ]; then
  tried=1
  rm -f "$pdf"
  "$pw" pdf --paper-format=A4 --wait-for-timeout=1000 "$url" "$pdf" 2>&1 && ok && exit 0
  # Playwright's own browser may not be downloaded: retry with the installed Chrome.
  echo "render: playwright failed, retrying with the installed Chrome channel" >&2
  rm -f "$pdf"
  "$pw" pdf --channel=chrome --paper-format=A4 --wait-for-timeout=1000 "$url" "$pdf" 2>&1 && ok && exit 0
fi

if [ "$tried" = 1 ]; then
  echo "render: PDF not produced; see references/sandbox.md" >&2
  exit 3
fi
echo "render: no Chrome/Chromium on PATH and no Playwright found (set CHROME_BIN or PLAYWRIGHT_BIN)" >&2
exit 2
