#!/usr/bin/env bash
# Tests design-channel.mjs over stdio against a fake studio. Run with: bash test-channel.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
node "$here/test-channel.mjs" "$here/design-channel.mjs"
