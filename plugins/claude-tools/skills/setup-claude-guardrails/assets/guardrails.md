# Guardrails

A PreToolUse hook, deny rules and usually a sandbox are active. After a denied call, change approach instead of retrying; if that's impossible, tell the user what is missing.

- Tools: if one is missing (e.g. `Glob`), use `find`/`ls` via Bash or `Grep`. `Write` fails on an existing file you haven't read: `rm -f` it first.
- The hook scans the full command text; a `/` or `~/` in a string counts as a path. Message text without `$` or backticks is skipped: `git commit -m '…'` or `-F - <<'EOF'`, and `gh`/`glab` `--title`, `--body`, `--notes`, `--description`. Put other path-heavy text (scripts, JSON) in a file made with `Write`.
- Run programs by name from `PATH`, not from `~/.local/bin` or `/Applications`. No `cd` outside the project. Temp files go in `$TMPDIR`.
- `gh`, `glab`, `git push|pull|fetch` and `open` run outside the sandbox only when every command in the call is one of them, joined by `&&`: no `cd`, other commands, pipes, backticks, `$(...)`, heredocs or redirections, even inside quotes. So commit in one call, then `git push -u origin HEAD && gh pr create --title '…' --body '…'` in another (`'\''` for an apostrophe). A body with backticks, `$` or code goes in a file made with `Write`, passed with `--body-file`. Outside the sandbox `$TMPDIR` differs: pass the real `/tmp/claude-<uid>/...` path. If `open`/`osascript` still fails, tell the user to run it with `!`.
- `git push`, `gh` or `glab` failing with `proxy requires authentication` or `Could not read from remote repository` means the call stayed in the sandbox: look for one of the above in it, rebuild the call (`--body-file`) and retry once.
- The sandbox can't write `.git/config`. Anything that sets upstream tracking fails with `could not lock config file .git/config: Operation not permitted`, and `git checkout -B` can leave a half-done checkout (check `git status`). Use `git switch <branch>` or `git switch -c <branch>` without `-t`/`--track`; `git push -u` is fine, it runs outside the sandbox.
- A guardrail that keeps costing you steps, or whose message or rule is unclear: finish the task, then tell the user and suggest improving it (`/setup-claude-guardrails` ships the rule and hook). Don't work around it.
- Bash can't read most of `~/.claude`, including large tool outputs saved under `~/.claude/projects`: use `Read` with `offset`/`limit`.
- Stay in the project and its `additionalDirectories`; ask the user for anything else. Never read or edit `.env*` (except `.example|.sample|.template|.dist`), `~/.claude.json` or `.credentials.json`, and don't dodge the check.
- An `ask` on settings or hook files is intentional: explain and wait.
