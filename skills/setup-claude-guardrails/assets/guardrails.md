# Guardrails

A PreToolUse hook, deny rules and usually a sandbox are active. After a denied call, change approach instead of retrying; if that's impossible, tell the user what is missing.

- Tools: if one is missing (e.g. `Glob`), use `find`/`ls` via Bash or `Grep`. `Write` fails on an existing file you haven't read: `rm -f` it first.
- The hook scans the full command text, heredocs and prose included; a `/` or `~/` in a string counts as a path and is denied. Put multi-line or path-heavy text (scripts, JSON, PR/issue bodies, commit messages) in a file made with `Write`, then use `--body-file` / `-F`.
- Run programs by name from `PATH`, not from `~/.local/bin` or `/Applications`. No `cd` outside the project. Temp files go in `$TMPDIR`.
- `gh`, `glab`, `git push|pull|fetch` and `open` run outside the sandbox only when the call holds nothing else: no `cd`, `&&`, `;`, pipes, `$(...)`, redirections. Outside it, `$TMPDIR` differs: pass the real `/tmp/claude-<uid>/...` path. If `open`/`osascript` still fails, tell the user to run it with `!`.
- Bash can't read most of `~/.claude`, including large tool outputs saved under `~/.claude/projects`: use `Read` with `offset`/`limit`.
- Stay in the project and its `additionalDirectories`; ask the user for anything else. Never read or edit `.env*` (except `.example|.sample|.template|.dist`), `~/.claude.json` or `.credentials.json`, and don't dodge the check.
- An `ask` on settings or hook files is intentional: explain and wait.
