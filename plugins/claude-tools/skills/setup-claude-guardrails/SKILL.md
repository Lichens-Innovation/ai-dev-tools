---
name: setup-claude-guardrails
description: "Installs guardrails in the current project's .claude/ that (1) keep Claude Code from reading, writing, or running commands on paths outside a scoped directory (the project, or a chosen parent like ~/Documents/gits) and (2) block access to environment files (.env, .env.local, ...) except .env*.example. Combines native settings (permission deny rules, blockReadsOutsideWorkingDirectories, optional Bash sandbox) with a PreToolUse hook. Use when the user wants to sandbox Claude to the repo, protect secrets from Claude, add safety hooks, or invokes /setup-claude-guardrails."
disable-model-invocation: true
---

# Setup Claude Guardrails

Install layered guardrails into the current project's `.claude/settings.local.json`. They are personal preferences, so nothing is committed: Claude Code keeps `settings.local.json` out of git, and the hook script is excluded via `.git/info/exclude`. Use the committed `.claude/settings.json` only if the user explicitly asks to share the guardrails with the team.

| Layer | Enforced by | Covers |
| ----- | ----------- | ------ |
| `permissions.blockReadsOutsideWorkingDirectories` | Claude Code | `Read`, `Grep`, `Glob`, `LSP` outside the project + `additionalDirectories` |
| `permissions.deny` `Read(...)` / `Edit(...)` rules | Claude Code | env files, for every file tool (and fed into the sandbox) |
| `sandbox` (optional) | the OS (Seatbelt / bubblewrap) | what Bash commands and their child processes can actually read and write |
| `PreToolUse` hook `scripts/guardrails.mjs` | heuristic on tool input | denies out-of-scope writes and Bash paths, env files incl. wildcards / case / symlinks, and asks before anything edits the guardrails |

The native layers are the real enforcement; the hook is a heuristic that catches mistakes in modes where nothing else would (e.g. `bypassPermissions`, out-of-scope writes).

## Target files (in the current project's root)

- `.claude/hooks/guardrails.mjs` — copied from this skill's `scripts/guardrails.mjs`
- `.claude/settings.local.json` — permissions, optional sandbox, hook registration
- `.git/info/exclude` — gets a `.claude/hooks/guardrails.mjs` line, so the script stays untracked without touching the shared `.gitignore`

## Workflow

1. **Ask the two questions** in one `AskUserQuestion` call:
   - "Which directories may Claude access?" — project directory only (recommended), or project + other directories (e.g. `~/Documents/gits`, collected via "Other").
   - "Enable the Bash sandbox?" — Yes, strict (recommended: OS-enforced, closes the Bash gaps; network access then needs per-domain approval and commands can't fall back to unsandboxed), or No (hook heuristics only for Bash).

2. **Check prerequisites.**
   - `node --version` must be >= 18. If not, stop: the hook would fail closed on every tool call.
   - `claude --version` must be >= 2.1.257 for `blockReadsOutsideWorkingDirectories`. If older, skip that key and tell the user to upgrade.
   - On Linux/WSL2 with the sandbox chosen, tell the user to run `/sandbox` afterwards to check bubblewrap is installed. Native Windows can't use the sandbox — skip it there.

3. **Copy the hook.** Create `.claude/hooks/` and copy `scripts/guardrails.mjs` from this skill's directory to `.claude/hooks/guardrails.mjs`. If one exists and differs, show the diff and ask before overwriting.

   Keep it out of git: if the project is a git repo, append `.claude/hooks/guardrails.mjs` to `$(git rev-parse --git-common-dir)/info/exclude` unless already listed. Then run `git check-ignore -q .claude/hooks/guardrails.mjs` and `git check-ignore -q .claude/settings.local.json`. If either is not ignored, add that path to the exclude file too. If either path is already tracked (`git ls-files --error-unmatch <path>` succeeds), ignoring it has no effect: tell the user and ask whether to `git rm --cached` it.

4. **Merge `.claude/settings.local.json`.** Read it (treat as `{}` if absent) and merge — never replace. Preserve all other keys, append to arrays without duplicating entries, write with 2-space indentation:

   ```json
   {
     "permissions": {
       "blockReadsOutsideWorkingDirectories": true,
       "additionalDirectories": ["<extra roots, as given, ~ allowed>"],
       "deny": [
         "Read(.env)", "Read(.env.*)", "Read(*.env)",
         "Read(!.env*.example)", "Read(!.env*.sample)", "Read(!.env*.template)", "Read(!.env*.dist)",
         "Edit(.env)", "Edit(.env.*)", "Edit(*.env)",
         "Edit(!.env*.example)", "Edit(!.env*.sample)", "Edit(!.env*.template)", "Edit(!.env*.dist)"
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

   - Omit `additionalDirectories` for project-only, and `sandbox` if the user declined it.
   - Keep the `deny` entries in this order: a `!` negation only carves exceptions out of rules listed before it in the same file. If the file already has a `deny` list, append the block as one contiguous group.
   - Skip the hook entry if one with the same `command` already exists.
   - Once the hook is installed it asks before any edit to `.claude/settings*.json` or the hook itself — on a re-run, expect those prompts.

5. **Verify.** Run this skill's `scripts/test-guardrails.sh <project>/.claude/hooks/guardrails.mjs`. It builds a throwaway project and checks ~50 allow/deny/ask cases. Report any failure verbatim instead of claiming success.

6. **Report.** List the files changed (and that none of them are tracked by git), the allowed roots, whether the sandbox is on, and the limitations below. Note that a fresh clone or a new git worktree won't have the guardrails; re-run the skill there. Tell the user hooks and the sandbox load at session start, so they must restart Claude Code; if the sandbox is on, suggest `/sandbox` → Config to review the effective read/write lists.

## Hook behavior

- **scope** — allowed: the project, `permissions.additionalDirectories` from the project's `settings.local.json` / `settings.json` (relative entries resolve against the project), the temp dirs, `/dev/null`-style devices. Read tools may also read `~/.claude` (skills, plugins, plans, saved tool output); Bash may use `~/.claude/plugins` and `~/.claude/skills` (skill scripts). Symlinks are followed. Glob patterns with absolute or `..` prefixes are checked. In Bash: absolute, `~`, `$HOME` and `..` paths, bare `cd`/`pushd`, and any command run from an out-of-scope working directory unless it starts with `cd <in-scope dir>`.
- **env** — blocks names matching `.env`, `.env.*`, `*.env` (case-insensitive) except `.env*.example|.sample|.template|.dist`; Bash wildcards that could expand to one (`.env*`, `.e?v`, `.e[n]v`); quote-split names (`.e''nv`); symlinks pointing at one; Grep `glob` filters. Glob patterns are not checked (they only list names).
- **self** — `ask` (not deny) on writes to `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks/guardrails.mjs`, including Bash commands naming them, so the user can still approve legitimate changes.
- Malformed input or any internal error exits 2, which blocks the call (fail closed).

## Limitations — state these to the user

- Without the sandbox, the Bash checks are a **heuristic** on command text: paths built at runtime (`$(...)`, variables, `eval`, scripts that open files internally) and recursive reads like `grep -r KEY .` get past them. A model trying to evade them could. With the sandbox on, the OS enforces the `Read`/`Edit` deny rules and the read block on every Bash command.
- `/add-dir` and user-level `additionalDirectories` aren't visible to the hook; directories added that way are still denied for writes and Bash until they're in the project's settings.
- Absolute paths inside quoted strings (`grep "/api/users"`) and system executables (`/usr/bin/python3`) are treated as out-of-scope paths and denied. Rephrase the command or run it yourself.
- Env vars already loaded into the shell (direnv, `export`) are visible to `env` / `printenv`; the guardrails protect files, not the environment. The sandbox's `credentials.envVars` setting can scrub them.
- Hooks don't apply to MCP tools; their file access is up to each server.
