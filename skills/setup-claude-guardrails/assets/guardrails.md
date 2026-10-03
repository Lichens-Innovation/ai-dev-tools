# Guardrails

A PreToolUse hook, deny rules and usually a sandbox are active. After a denied call, change approach instead of retrying; if that's impossible, tell the user what is missing.

- Tools: if one is missing (e.g. `Glob`), use `find`/`ls` via Bash or `Grep`. `Write` fails on an existing file you haven't read: `rm -f` it first.
- The hook scans the full command text; a `/` or `~/` in a string counts as a path. Message text without `$` or backticks is skipped: `git commit -m '…'` or `-F - <<'EOF'`, and `gh`/`glab` `--title`, `--body`, `--notes`, `--description`. Put other path-heavy text (scripts, JSON) in a file made with `Write`.
- Run programs by name from `PATH`, not from `~/.local/bin` or `/Applications`. No `cd` outside the project. Temp files go in `$TMPDIR`; if `Read` refuses one, use `sed -n`.
- `gh`, `glab`, `git push|pull|fetch` and `open` run outside the sandbox only when every command in the call is one of them, joined by `&&`: no `cd`, other commands, pipes, `$(...)`, heredocs or redirections. So commit in one call, then `git push -u origin HEAD && gh pr create --title '…' --body '…'` in another (`'\''` for an apostrophe). A body with backticks or `$` (markdown code) keeps the call sandboxed: `Write` it to a file and pass `--body-file`. Outside the sandbox `$TMPDIR` differs: pass the real `/tmp/claude-<uid>/...` path. If `open`/`osascript` still fails, tell the user to run it with `!`.
- Bash can't read most of `~/.claude`, including large tool outputs saved under `~/.claude/projects`: use `Read` with `offset`/`limit`.
- Stay in the project and its `additionalDirectories`; ask the user for anything else. Never read or edit `.env*` (except `.example|.sample|.template|.dist`), `~/.claude.json` or `.credentials.json`, and don't dodge the check.
- An `ask` on settings or hook files is intentional: explain and wait.
