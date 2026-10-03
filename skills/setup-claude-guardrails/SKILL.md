---
name: setup-claude-guardrails
description: "Installs guardrails in this project's .claude/ (and its git worktrees) that keep Claude Code from reading, writing or running commands on paths outside a scoped directory (the project, or a chosen parent like ~/Documents/gits), and block env files (.env, .env.local, ...) except .env*.example. Combines permission deny rules, blockReadsOutsideWorkingDirectories, an optional Bash sandbox and a PreToolUse hook. Use when the user wants to sandbox Claude to the repo, protect secrets from Claude, add safety hooks, or invokes /setup-claude-guardrails."
disable-model-invocation: true
---

# Setup Claude Guardrails

Install layered guardrails into `.claude/settings.local.json`. They are personal: nothing is committed (`settings.local.json` is ignored by Claude Code, the hook and rule via `.git/info/exclude`). Use `.claude/settings.json` only if the user asks to share them with the team.

| Layer | Enforced by | Covers |
| ----- | ----------- | ------ |
| `blockReadsOutsideWorkingDirectories` | Claude Code | `Read`, `Grep`, `Glob`, `LSP` outside the project + `additionalDirectories` |
| `deny` `Read(...)` / `Edit(...)` rules | Claude Code | env files and Claude Code's credentials, for every file tool (also fed into the sandbox) |
| `sandbox` (optional) | the OS (Seatbelt / bubblewrap) | what Bash commands and their children can read and write |
| `PreToolUse` hook `scripts/guardrails.mjs` | heuristic on tool input | out-of-scope writes and Bash paths, env files (wildcards, case, symlinks), and asks before edits to the guardrails |

The native layers are the real enforcement; the hook catches mistakes where nothing else would (e.g. `bypassPermissions`).

## Checkouts and worktrees

Everything is installed per checkout; each has its own untracked `.claude/`. `.git/info/exclude` is in the git common dir, shared by all.

- **Main checkout:** the parent of `git rev-parse --path-format=absolute --git-common-dir`. Install here first.
- **Claude Code worktrees** (`<main>/.claude/worktrees/<name>`, from `claude --worktree`, subagent `isolation: worktree`, desktop parallel sessions): a session that creates one keeps the main checkout's settings. For sessions opened inside one later, `.worktreeinclude` (step 6) copies the guardrail files into each new one.
- **Other linked worktrees** (`git worktree list --porcelain`): install into each; re-run after adding one.

## Files per checkout

- `.claude/hooks/guardrails.mjs`, from this skill's `scripts/guardrails.mjs`
- `.claude/rules/guardrails.md`, from `assets/guardrails.md`: tells Claude how to work with the hook (loads every session)
- `.claude/settings.local.json`: permissions, optional sandbox, hook registration
- shared `.git/info/exclude`: the hook and rule paths
- `<main>/.worktreeinclude`: the hook, the rule and `settings.local.json`

## Workflow

1. **Check for an existing install** (read-only, before asking anything). Resolve the main checkout and linked worktrees, and say which one the session is in. In each, check:
   - the hook and rule exist and are identical to this skill's copies;
   - settings have the hook entry with the same `command`, all 18 `deny` entries from step 5 plus the 8 per extra root, and `blockReadsOutsideWorkingDirectories`; with the sandbox, also `failIfUnavailable` and the sandbox temp dir in `additionalDirectories`, and the `ask` entries from step 5's table for each exclusion;
   - `git check-ignore -q` passes for the hook, the rule and `settings.local.json`;
   - once, in the main checkout: `.worktreeinclude` lists all three.

   **All in place:** report the setup (roots from `additionalDirectories` other than the temp dir, sandbox on/off, git hosting and `open` exclusions, hook up to date, which checkouts). Ask one question: keep it as is (recommended; stop, no tests) or reconfigure (step 2, current values as defaults). **Partial:** list the gaps and fill only those, current values as defaults. **None:** continue.

2. **Ask** in one `AskUserQuestion` call:
   - "Which directories may Claude access?": project only (recommended), or project + others (e.g. `~/Documents/gits`). If none are named, ask for the paths before writing.
   - "Enable the Bash sandbox?": Yes, strict (recommended: OS-enforced; network needs per-domain approval, no unsandboxed fallback), or No (hook heuristics only).
   - Sandbox only: "Run git hosting commands outside the sandbox?": Yes (`gh`, `glab`, `git push`/`pull`/`fetch` use your Keychain, SSH agent and network; risky subcommands prompt; repo git hooks outside `.git/hooks`, such as husky's, run unsandboxed too), or No (they fail in the sandbox; run them with `!`). No recommendation: it trades isolation for convenience.
   - Sandbox only: "Run `open` outside the sandbox?": Yes (recommended on macOS: the sandbox blocks `open`, so skills like `/claude-light` can't open a page; apps and URLs still prompt), or No (run `! open <path>` yourself).
   - Linked worktrees only: "Install in which checkouts?": all (recommended), or the current one.

3. **Prerequisites.**
   - `node --version` >= 18, else stop: the hook would fail closed on every call.
   - `claude --version` >= 2.1.257 for `blockReadsOutsideWorkingDirectories`; if older, skip that key and say to upgrade. If it fails with `operation not permitted` (the session's sandbox, before step 5's exclusion applies), ask the user to run `! claude --version`.
   - Linux/WSL2 with the sandbox: tell the user to run `/sandbox` afterwards to check bubblewrap. Native Windows: no sandbox.

4. **Copy** the hook to `.claude/hooks/guardrails.mjs` and the rule to `.claude/rules/guardrails.md` in each chosen checkout. If a copy exists and differs, show the diff and ask first.

   In a git repo, append both paths to `$(git rev-parse --git-common-dir)/info/exclude` unless listed. Then in each checkout run `git check-ignore -q` on them and on `.claude/settings.local.json`, and add any that isn't ignored. If a path is tracked (`git ls-files --error-unmatch`), ignoring it does nothing: ask whether to `git rm --cached` it.

5. **Merge `.claude/settings.local.json`** in each chosen checkout (`{}` if absent). Never replace: keep other keys, append to arrays without duplicates, 2-space indentation.

   ```json
   {
     "permissions": {
       "blockReadsOutsideWorkingDirectories": true,
       "additionalDirectories": ["<extra roots, as given, ~ allowed>"],
       "deny": [
         "Read(.env)", "Read(.env.*)", "Read(*.env)",
         "Read(!.env*.example)", "Read(!.env*.sample)", "Read(!.env*.template)", "Read(!.env*.dist)",
         "Edit(.env)", "Edit(.env.*)", "Edit(*.env)",
         "Edit(!.env*.example)", "Edit(!.env*.sample)", "Edit(!.env*.template)", "Edit(!.env*.dist)",
         "Read(~/.claude/.credentials.json)", "Edit(~/.claude/.credentials.json)",
         "Read(~/.claude.json)", "Edit(~/.claude.json)"
       ]
     },
     "sandbox": { "enabled": true, "allowUnsandboxedCommands": false, "failIfUnavailable": true },
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Read|Write|Edit|MultiEdit|NotebookEdit|Glob|Grep|LSP|Bash|Monitor",
           "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guardrails.mjs\"" }]
         }
       ]
     }
   }
   ```

   Also merge, depending on the answers:

   | When | `permissions.ask` | `sandbox.excludedCommands` |
   | ---- | ----------------- | -------------------------- |
   | Git hosting outside the sandbox | `Bash(gh api *)`, `Bash(gh auth *)`, `Bash(gh secret *)`, `Bash(gh repo delete *)`, `Bash(gh alias *)`, `Bash(gh extension *)`, `Bash(gh ext *)`, `Bash(glab api *)`, `Bash(glab auth *)`, `Bash(glab variable *)`, `Bash(glab repo delete *)`, `Bash(glab alias *)` (aliases and extensions run shell commands) | `gh *`, `glab *`, `git push`, `git push *`, `git pull`, `git pull *`, `git fetch`, `git fetch *` |
   | Sandbox on (always, read-only: the sandbox blocks the `claude` binary, breaking step 3) | | `claude --version`, `claude -v` (exact forms only, so no unsandboxed agent session) |
   | `open` outside the sandbox | `Bash(open -a *)`, `Bash(open -b *)`, `Bash(open *://*)` | `open`, `open *`, `xdg-open`, `xdg-open *` |

   Excluded commands still go through permission rules and the hook; `allowUnsandboxedCommands: false` doesn't stop them. A call leaves the sandbox only when every command in it matches (`git push && gh pr create ...` does), never with `cd`, `$(...)`, redirections or heredocs, `xargs` or `eval`. `open` on a page, document, image or plain directory doesn't prompt; the hook asks for anything else.

   - With the sandbox, add its temp dir to `additionalDirectories` so `Read` can open what Bash writes to `$TMPDIR` (`blockReadsOutsideWorkingDirectories` refuses it otherwise): `realpath` of `${CLAUDE_CODE_TMPDIR:-/tmp}/claude-$(id -u)` (macOS: `/private/tmp/claude-501`). Sandboxed Bash can already read and write it.
   - `failIfUnavailable` makes Claude Code exit at startup when the sandbox can't start, instead of running Bash unsandboxed.
   - Omit `additionalDirectories` for project-only without the sandbox, and `sandbox` if declined. For several checkouts, prefer absolute or `~` roots (relative ones resolve per checkout).
   - Keep the `deny` order: a `!` negation only carves exceptions out of earlier rules in the same file. Append the block contiguously to an existing list.
   - **Env files in extra roots:** the relative rules above only match under the session's directory, so a sibling repo's `.env` would be readable by sandboxed Bash (`grep -r KEY ../other`). For each extra root (not the temp dir), append `Read(<root>/**/<name>)` for each name in `.env`, `*.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development`, `.env.staging`, `.env.test`. Write `<root>` as `~/...` under the home directory, else `//<absolute path>`; never relative or single `/` (it anchors at the settings file). No `.env.*`: a `!` negation can't carve out of `~/`/`//` rules, so it would block `.env.example` too. A `Read` deny also blocks Edit and Write on the path and feeds the sandbox's `denyRead`.
   - Skip the hook entry if one with the same `command` exists.
   - Once installed, the hook asks before edits to settings files and itself, so expect prompts on a re-run.

6. **`.worktreeinclude`** in the main checkout root (gitignore syntax; Claude Code copies files that match it and are gitignored into new worktrees): append the three paths unless listed.
   - If it doesn't exist, create it and add `.worktreeinclude` (unanchored: the hook reads a leading `/` as absolute) to the shared exclude.
   - If it is tracked, it is shared: show the lines and ask first. If declined, skip and say new worktrees won't get a copy.

7. **Verify.** Run `bash scripts/test-guardrails.sh <main>/.claude/hooks/guardrails.mjs` from this skill's directory (always `bash`, never `sh`: on macOS `sh` is bash in POSIX mode and the `claude config` checks fail). It checks ~100 allow/deny/ask cases in a throwaway project under `$TMPDIR`. Report failures verbatim.
   - Exit 2 with `could not create a scratch ...` or `temp dir ... is not usable`: stop and report. Never point `TMPDIR` at a real directory: the script writes fake secrets there and deletes it.
   - `rm:` errors on paths outside `$TMPDIR`: stop immediately, tell the user, run nothing else.

8. **Report** the files changed per checkout (none tracked), the roots, sandbox on/off, and the limitations below. A fresh clone or a later `git worktree add` needs a re-run. Hooks and the sandbox load at session start: restart Claude Code. With the sandbox, suggest `/sandbox` → Config to review the effective lists.

## Hook behavior

- **scope:** allows the project (with `.claude/worktrees/`), `additionalDirectories` from project and user settings, temp dirs, devices, and `~/.claude` (or `$CLAUDE_CONFIG_DIR`). Follows symlinks and checks absolute or `..` Glob patterns. In Bash it checks absolute, `~`, `$HOME` and `..` paths, bare `cd`/`pushd`, and commands run from an out-of-scope directory unless they start with `cd <in-scope dir>`. Programs from the system bin dirs and `/opt/homebrew/bin` are allowed in command position; their arguments are still checked. Absolute paths whose top-level directory doesn't exist (`/api/users`) are skipped unless `/` is writable.
- **messages:** text a command only stores is skipped when it has no `$` or backticks: `git commit|tag|merge|stash|notes -m`, a heredoc read by them (quoted delimiter, or no expansion in it, and not piped), and `gh`/`glab` `--title`, `--body`, `--notes`, `--description`. Commands with `$(...)`, backticks or unbalanced quotes are scanned whole. File flags (`-F`, `--body-file`, `git commit -t`) are always checked.
- **env:** blocks `.env`, `.env.*`, `*.env` (case-insensitive) except `.example|.sample|.template|.dist`, including Bash wildcards, quote-split names, symlinks and Grep `glob` filters (not Glob patterns: they only list names). `process.env` and `import.meta.env` count only if such a file exists. Also blocks `.credentials.json` and `.claude.json` anywhere.
- **self:** asks (not denies) before writes, Bash included, to any checkout's settings files or hook and to `~/.claude/settings.json` (which can set `disableAllHooks`).
- **escape:** asks before `git` with `--upload-pack`, `--receive-pack`, `--exec` or a `GIT_SSH*`/`GIT_CONFIG*`/`GIT_EXEC_PATH`/`GIT_ASKPASS` prefix, and before `open`/`xdg-open` of a `.app`, an executable file, or anything that isn't a page, document, image or directory. Excluded from the sandbox, these would start a program Claude could have written.
- Malformed input or an internal error exits 2 and blocks the call (fail closed).

## Limitations: tell the user

- Without the sandbox, Bash checks are a heuristic on command text: runtime paths (`$(...)`, variables, `eval`, scripts) and recursive reads (`grep -r KEY .`) get past them. With it, the OS enforces the deny rules and read block on every command.
- Directories added with `/add-dir` for the session only are invisible to the hook until they're in a settings file's `additionalDirectories`.
- Outside message text, a quoted string naming a real path outside scope (`grep "/etc/hosts" README.md`) and programs outside the system bin dirs (`~/.local/bin/...`) are denied. Use the program name from `PATH`, rephrase, or run it yourself.
- Env vars already in the shell are visible to `env`; the guardrails protect files. The sandbox's `credentials.envVars` can scrub them.
- In extra roots, only the common env names are denied natively; other `.env.*` files there (`.env.prod`) are blocked by the hook only, so a recursive read in Bash can reach them.
- Hooks don't apply to MCP tools.
- With git hosting excluded, `gh`/`glab` act with your full account and `git push` reaches any remote. Only the listed `ask` rules prompt; `gh pr merge`, `git push --force` and the like run under your normal permission mode. Git hooks run outside the sandbox too: the sandbox protects `.git/hooks`, but not a `core.hooksPath` folder in the repo (husky's `.husky/`), which Claude can edit before a push or pull.
- With `open` excluded, pages, documents, images and directories open without a prompt in their default app, outside the sandbox.
- With the sandbox, Bash can only read the `~/.claude` subfolders Claude Code opens (plugins, skills, agents, rules, commands) and write none of it. Use Read/Edit for files like `~/.claude/settings.json`.
- A linked worktree outside the main checkout (`../feature`) is its own project: the main checkout isn't in its scope. `git` itself still works there.
