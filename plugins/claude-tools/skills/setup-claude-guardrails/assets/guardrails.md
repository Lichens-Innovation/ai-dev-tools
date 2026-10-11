# Guardrails

A PreToolUse hook, deny rules and usually a sandbox are active. After a denied call, change approach instead of retrying; if that's impossible, tell the user what is missing.

- Tools: if one is missing (e.g. `Glob`), use `find`/`ls` via Bash or `Grep`. `Write` fails on an existing file you haven't read: `rm -f` it first.
- The hook scans the full command text; a `/` or `~/` in a string counts as a path. Message text without `$` or backticks is skipped (`git commit -m '…'`, `-F - <<'EOF'`, `gh`/`glab` `--title|--body|--notes|--description`). Put other path-heavy text (scripts, JSON) in a file made with `Write`.
- Run programs by name from `PATH`, not from `~/.local/bin` or `/Applications`. No `cd` outside the project. Temp files go in `$TMPDIR`.
- Run project tools from the local install, never `npx`: `node_modules/.bin/<tool>` (from the package's own directory in a workspace) or `node <script>`. `npx` can contact the npm registry (typically its update check) and downloads a missing package. If unavoidable: `NPM_CONFIG_UPDATE_NOTIFIER=false npx --no-install`.
- A command leaves the sandbox (`gh`, `glab`, `git push|pull|fetch`, `open`) or skips the prompt (an allow rule like `node *script.cjs*`) only when every command in the call matches. Any `cd`, `;`, pipe, `2>&1`, redirection, heredoc, backtick, `$(...)` or other command, even inside quotes, blocks the lot. One command per call (independent ones in parallel); use `--root` or `-C <dir>` instead of `cd`. Only excluded commands may be joined, with `&&`.
- Commit in one call, then `git push -u origin HEAD && gh pr create --title '…' --body '…'` in another (`'\''` for an apostrophe). A body with backticks, `$` or code goes in a file made with `Write`, passed with `--body-file`; outside the sandbox `$TMPDIR` differs, so pass the real `/tmp/claude-<uid>/...` path. If `open`/`osascript` still fails, tell the user to run it with `!`.
- `git push`, `gh` or `glab` failing with `proxy requires authentication` or `Could not read from remote repository` means the call stayed in the sandbox: rebuild it as above and retry once.
- The sandbox can't write `.git/config`: upstream tracking fails with `could not lock config file .git/config: Operation not permitted`, and `git checkout -B` can leave a half-done checkout (check `git status`). Use `git switch [-c] <branch>` without `-t`/`--track`; `git push -u` is fine.
- A guardrail that keeps costing you steps, or whose message or rule is unclear: finish the task, then tell the user and suggest improving it (`/setup-claude-guardrails` ships the rule and hook). Don't work around it.
- Bash can't read most of `~/.claude`, including large tool outputs under `~/.claude/projects`: use `Read` with `offset`/`limit`.
- Stay in the project and its `additionalDirectories`; ask the user for anything else. Never read or edit `.env*` (except `.example|.sample|.template|.dist`), `~/.claude.json` or `.credentials.json`, and don't dodge the check.
- An `ask` on settings or hook files is intentional: explain and wait.
