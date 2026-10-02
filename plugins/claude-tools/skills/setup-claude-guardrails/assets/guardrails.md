# Guardrails

A `PreToolUse` hook (`.claude/hooks/guardrails.mjs`), permission rules and usually an OS sandbox are active in this project. Work with them instead of retrying against them.

## Tools

- Some tools may be unavailable in a session (for example `Glob`: `No such tool available`). Don't retry them: list files with `find` or `ls` through Bash, and search content with `Grep`.
- Use `Read` for file contents. Use `Write` / `Edit` for creating and changing files.
- `Write` refuses to overwrite a file you haven't read in this session (`File has not been read yet`). For scratch files in `$TMPDIR`, delete a leftover with `rm -f` first, or pick a new name.

## Bash

- The hook scans the whole command text, heredoc bodies and quoted strings included. A path-like string (`grep "/api/users"`, a JSON description mentioning `~/.claude/...`) is treated as a path and denied as out of scope.
  - Write multi-line or path-heavy content with the `Write` tool, never a heredoc or `echo`.
  - Rephrase the command so no absolute path appears in an argument that isn't a real path.
- Run programs by name from `PATH` (`node`, `python3`), not by a path under `~/.local/bin` or `/Applications`. Only the system bin dirs (`/usr/bin`, `/usr/local/bin`, `/bin`, `/sbin`, `/usr/libexec`, `/opt/homebrew/bin`) are accepted.
- Don't `cd` out of the project. Use paths relative to it, or `cd <in-scope dir> && ...`.
- Temp files go in `$TMPDIR` (run `echo $TMPDIR` to get the path), never a bare `/tmp`.
- With the sandbox on, `open` and `osascript` can fail. Say so and give the user the command to run with `!`.

## Scope and secrets

- Stay inside the project and its `additionalDirectories`. If you need something else, ask the user instead of working around it.
- Never read or edit `.env`, `.env.*` or `*.env` (`.env*.example`, `.sample`, `.template` and `.dist` are fine), `~/.claude.json` or `.credentials.json`. Don't build names to dodge the check (wildcards, quote-splitting, symlinks).

## Prompts and denials

- An `ask` on `.claude/settings*.json`, the guardrails hook or `~/.claude/settings.json` is intentional. Explain the change and wait for the user's answer.
- A `deny` is final for that approach. Read the message (it starts with `[guardrails:...]`), change the approach, and don't retry the same command. If the task can't be done within the limits, tell the user what is missing.
