# Screenshots inside a sandbox

Read this when `scripts/capture.sh` exits `3`, or the dev server or Storybook will not start, in a project that runs commands in an OS sandbox (Claude Code's Bash sandbox, Docker, CI). Fix what is listed, tell the user what is missing, and drop the "Screen capture(s)" section. Do not widen the sandbox yourself.

| Symptom | Cause | Fix |
|---|---|---|
| Server fails with `EPERM` / "Operation not permitted" on listen | Local port binding is off | User sets `sandbox.network.allowLocalBinding: true`, or runs the server themselves with `!` and gives you the URL |
| Chrome exits immediately, no PNG, "Operation not permitted" or Mach port errors | Chrome's own sandbox cannot nest inside Seatbelt or a container | `capture.sh` already retries with `--no-sandbox` for `localhost` URLs. Never use `--no-sandbox` on a remote URL |
| Chrome fails writing its profile | Default profile dir is under `~/Library` or `~/.config`, which is not writable | `capture.sh` uses `--user-data-dir` in `$TMPDIR`. Keep it there |
| Playwright says the browser executable is missing or unreadable | Browsers live in `~/Library/Caches/ms-playwright` or `~/.cache/ms-playwright`, outside the readable paths | Falls through to Chrome. Or the user runs the capture themselves with `!` |
| `google-chrome` not found though Chrome is installed (macOS) | The binary is inside the `.app` bundle and not on `PATH` | The user sets `CHROME_BIN` to the bundle's `Contents/MacOS/Google Chrome` path, or symlinks it onto `PATH` |
| Blank or half-rendered shot | Page needs longer than the wait | Raise `--wait-for-timeout` (Playwright) or `--virtual-time-budget` (Chrome) in the script; do not publish the blank shot |
| `curl` / `index.json` unreachable though the server runs | Network filter blocks loopback | Same as the port-binding row, or the user runs the capture with `!` |

Package installs (`playwright install`, `npm i`) never fit the sandbox. Ask the user to run them with `!`.

## Manual fallback

When nothing works, give the user the URL to open (Storybook: `http://localhost:<port>/iframe.html?id=<story-id>&viewMode=story`) and ask them to drag screenshots into the PR on GitHub. Drop the "Screen capture(s)" section.
