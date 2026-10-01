---
name: setup-claude-guardrails
description: "Installs guardrails in the current project's .claude/ (and its git worktrees) that (1) keep Claude Code from reading, writing, or running commands on paths outside a scoped directory (the project, or a chosen parent like ~/Documents/gits) and (2) block access to environment files (.env, .env.local, ...) except .env*.example. Combines native settings (permission deny rules, blockReadsOutsideWorkingDirectories, optional Bash sandbox) with a PreToolUse hook. Use when the user wants to sandbox Claude to the repo, protect secrets from Claude, add safety hooks, or invokes /setup-claude-guardrails."
disable-model-invocation: true
---

# Setup Claude Guardrails

Install layered guardrails into the current project's `.claude/settings.local.json`. They are personal preferences, so nothing is committed: Claude Code keeps `settings.local.json` out of git, and the hook script is excluded via `.git/info/exclude`. Use the committed `.claude/settings.json` only if the user explicitly asks to share the guardrails with the team.

| Layer | Enforced by | Covers |
| ----- | ----------- | ------ |
| `permissions.blockReadsOutsideWorkingDirectories` | Claude Code | `Read`, `Grep`, `Glob`, `LSP` outside the project + `additionalDirectories` |
| `permissions.deny` `Read(...)` / `Edit(...)` rules | Claude Code | env files and Claude Code's credentials, for every file tool (and fed into the sandbox) |
| `sandbox` (optional) | the OS (Seatbelt / bubblewrap) | what Bash commands and their child processes can actually read and write |
| `PreToolUse` hook `scripts/guardrails.mjs` | heuristic on tool input | denies out-of-scope writes and Bash paths, env files incl. wildcards / case / symlinks, and asks before anything edits the guardrails |

The native layers are the real enforcement; the hook is a heuristic that catches mistakes in modes where nothing else would (e.g. `bypassPermissions`, out-of-scope writes).

## Checkouts and worktrees

Everything below is installed per **checkout** — the main checkout and each linked git worktree has its own untracked `.claude/`.

- **Main checkout**: the parent of `git rev-parse --path-format=absolute --git-common-dir`. Install here first.
- **Claude Code worktrees** (`claude --worktree`, subagent `isolation: worktree`, desktop parallel sessions) live in `<main>/.claude/worktrees/<name>`. A session that *creates* one keeps `CLAUDE_PROJECT_DIR` and the settings of the main checkout, so the main install covers it. For a session later opened directly inside one, `.worktreeinclude` (step 6) copies the guardrail files into every new one.
- **Other linked worktrees** (`git worktree add`, listed by `git worktree list --porcelain`) get no copy: install into each one, and re-run the skill after adding a new one.

`.git/info/exclude` lives in the git common dir, so it is shared by every checkout.

## Target files (per checkout)

- `.claude/hooks/guardrails.mjs` — copied from this skill's `scripts/guardrails.mjs`
- `.claude/settings.local.json` — permissions, optional sandbox, hook registration
- `.git/info/exclude` (shared) — gets a `.claude/hooks/guardrails.mjs` line, so the script stays untracked without touching the shared `.gitignore`
- `<main>/.worktreeinclude` — lists both files so Claude Code copies them into new worktrees

## Workflow

1. **Find the checkouts and check for an existing install** before asking anything. Read-only. If the project is a git repo, resolve the main checkout and list the linked worktrees (see above); say which checkout the session is in. In each checkout, inspect:
   - `.claude/hooks/guardrails.mjs` exists and is identical to this skill's `scripts/guardrails.mjs`
   - `.claude/settings.local.json` (or `settings.json`) has the hook entry with the same `command`, all 18 `deny` entries from step 5, and `blockReadsOutsideWorkingDirectories`
   - `git check-ignore -q` succeeds for `.claude/hooks/guardrails.mjs` and `.claude/settings.local.json`
   - and once, in the main checkout: `.worktreeinclude` lists both files

   If **everything is in place**, report the current setup (allowed roots from `additionalDirectories`, sandbox on/off, hook up to date, which checkouts have it) and ask one question: keep it as is (recommended — stop here, don't run the tests), or reconfigure (continue to step 2 with the current values as defaults). If it's **partially installed** (e.g. the hook is outdated, a deny entry is missing, a worktree lacks it), list what's missing, then continue but only fill the gaps, using the current values as defaults. If nothing is installed, continue.

2. **Ask the questions** in one `AskUserQuestion` call:
   - "Which directories may Claude access?" — project directory only (recommended), or project + other directories (e.g. `~/Documents/gits`). If the user picks the second without naming any, ask for the paths before writing settings.
   - "Enable the Bash sandbox?" — Yes, strict (recommended: OS-enforced, closes the Bash gaps; network access then needs per-domain approval and commands can't fall back to unsandboxed), or No (hook heuristics only for Bash).
   - Only when linked worktrees exist: "Install in which checkouts?" — the main checkout and every worktree (recommended), or only the current checkout.

3. **Check prerequisites.**
   - `node --version` must be >= 18. If not, stop: the hook would fail closed on every tool call.
   - `claude --version` must be >= 2.1.257 for `blockReadsOutsideWorkingDirectories`. If older, skip that key and tell the user to upgrade.
   - On Linux/WSL2 with the sandbox chosen, tell the user to run `/sandbox` afterwards to check bubblewrap is installed. Native Windows can't use the sandbox — skip it there.

4. **Copy the hook** into each chosen checkout. Create `.claude/hooks/` and copy `scripts/guardrails.mjs` from this skill's directory to `.claude/hooks/guardrails.mjs`. If one exists and differs, show the diff and ask before overwriting.

   Keep it out of git: if the project is a git repo, append `.claude/hooks/guardrails.mjs` to `$(git rev-parse --git-common-dir)/info/exclude` unless already listed (once — the file is shared). Then, in each checkout, run `git check-ignore -q .claude/hooks/guardrails.mjs` and `git check-ignore -q .claude/settings.local.json`. If either is not ignored, add that path to the exclude file too. If either path is already tracked (`git ls-files --error-unmatch <path>` succeeds), ignoring it has no effect: tell the user and ask whether to `git rm --cached` it.

5. **Merge `.claude/settings.local.json`** in each chosen checkout. Read it (treat as `{}` if absent) and merge — never replace. Preserve all other keys, append to arrays without duplicating entries, write with 2-space indentation:

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
     "sandbox": { "enabled": true, "allowUnsandboxedCommands": false },
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

   - Omit `additionalDirectories` for project-only, and `sandbox` if the user declined it. Relative `additionalDirectories` resolve against each checkout, so prefer absolute or `~` paths when installing into several.
   - Keep the `deny` entries in this order: a `!` negation only carves exceptions out of rules listed before it in the same file. If the file already has a `deny` list, append the block as one contiguous group.
   - Skip the hook entry if one with the same `command` already exists.
   - Once the hook is installed it asks before any edit to a checkout's `.claude/settings*.json`, the hook itself, or `~/.claude/settings.json` — on a re-run, expect those prompts.

6. **Update `.worktreeinclude`** in the main checkout's root (gitignore syntax; Claude Code copies files that match it *and* are gitignored into each worktree it creates). Append `.claude/settings.local.json` and `.claude/hooks/guardrails.mjs` unless already listed.
   - If the file doesn't exist, create it and add `.worktreeinclude` to the shared `info/exclude` (unanchored: the hook reads a leading `/` as an absolute path), so it stays personal.
   - If it is tracked (`git ls-files --error-unmatch .worktreeinclude`), it is shared with the team: show the two lines and ask before editing it. If the user declines, skip this step and say new Claude Code worktrees won't get a copy.

7. **Verify.** Run this skill's `scripts/test-guardrails.sh <main>/.claude/hooks/guardrails.mjs` (the copies in the worktrees are identical). It builds a throwaway project under `$TMPDIR` and checks ~80 allow/deny/ask cases. Report any failure verbatim instead of claiming success.
   - If it exits 2 with `could not create a scratch ...` or `temp dir ... is not usable`, stop and report it. Never work around it by pointing `TMPDIR` at the project or any other real directory: the script writes fake secrets into the scratch dir and deletes it afterwards.
   - If a run prints `rm:` errors on paths outside `$TMPDIR`, stop right away and tell the user. Don't run anything else in the project.

8. **Report.** List the files changed per checkout (and that none of them are tracked by git), the allowed roots, whether the sandbox is on, and the limitations below. Note that a fresh clone, or a worktree made later with `git worktree add`, won't have the guardrails; re-run the skill there. Tell the user hooks and the sandbox load at session start, so they must restart Claude Code; if the sandbox is on, suggest `/sandbox` → Config to review the effective read/write lists.

## Hook behavior

- **scope** — allowed: the project (`$CLAUDE_PROJECT_DIR`, which includes its `.claude/worktrees/`), `permissions.additionalDirectories` from the project's `settings.local.json` / `settings.json` and the user's `~/.claude/settings.json` (relative entries resolve against the project), the temp dirs (`/tmp`, `$TMPDIR`), `/dev/null`-style devices, and Claude Code's own `~/.claude` (or `$CLAUDE_CONFIG_DIR`) for every tool, reads and writes alike. Symlinks are followed. Glob patterns with absolute or `..` prefixes are checked. In Bash: absolute, `~`, `$HOME` and `..` paths, bare `cd`/`pushd`, and any command run from an out-of-scope working directory unless it starts with `cd <in-scope dir>`. A program run by absolute path from `/usr/bin`, `/usr/local/bin`, `/bin`, `/sbin`, `/usr/libexec` or `/opt/homebrew/bin` (`/usr/bin/python3 x.py`) is allowed in command position; its arguments are still checked.
- **env** — blocks names matching `.env`, `.env.*`, `*.env` (case-insensitive) except `.env*.example|.sample|.template|.dist`; Bash wildcards that could expand to one (`.env*`, `.e?v`, `.e[n]v`); quote-split names (`.e''nv`); symlinks pointing at one; Grep `glob` filters. Glob patterns are not checked (they only list names). Also blocks `.credentials.json` (Claude Code's OAuth tokens on Linux/Windows) and `.claude.json` (MCP server configs, which can hold API keys in `env` / `headers`) wherever they sit, so they stay blocked even if the home folder is added to `additionalDirectories`.
- **self** — `ask` (not deny) on writes to any checkout's `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/guardrails.mjs` (the project's and its worktrees') and the user's `~/.claude/settings.json` (which can set `disableAllHooks`), including Bash commands naming them, so the user can still approve legitimate changes.
- Malformed input or any internal error exits 2, which blocks the call (fail closed).

## Limitations — state these to the user

- Without the sandbox, the Bash checks are a **heuristic** on command text: paths built at runtime (`$(...)`, variables, `eval`, scripts that open files internally) and recursive reads like `grep -r KEY .` get past them. A model trying to evade them could. With the sandbox on, the OS enforces the `Read`/`Edit` deny rules and the read block on every Bash command.
- Directories added with `/add-dir` for the current session only aren't visible to the hook; they're still denied for writes and Bash until they're in a settings file's `additionalDirectories` (the deny message names both files).
- Absolute paths inside quoted strings (`grep "/api/users"`) and programs outside the system bin dirs (`/Applications/...`, `~/.local/bin/...`) are treated as out-of-scope paths and denied. Rephrase the command (use the program's name from `PATH`) or run it yourself.
- Env vars already loaded into the shell (direnv, `export`) are visible to `env` / `printenv`; the guardrails protect files, not the environment. The sandbox's `credentials.envVars` setting can scrub them.
- Hooks don't apply to MCP tools; their file access is up to each server.
- The hook allows `~/.claude`, but with the sandbox on, the OS still limits Bash there: it can read only the subfolders Claude Code opens (plugins, skills, agents, rules, commands) and can't write anywhere in `~/.claude`. Use the Read/Edit tools for other files, such as `~/.claude/settings.json`.
- A linked worktree outside the main checkout (`git worktree add ../feature`) is its own project: the main checkout isn't in its scope. `git` itself still works there (it doesn't name the shared `.git` paths on the command line, and the sandbox allows its writes).
