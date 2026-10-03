# setup-claude-guardrails

Installs personal (untracked) guardrails into a project's `.claude/`: permission deny rules, `blockReadsOutsideWorkingDirectories`, an optional OS sandbox for Bash, and a `PreToolUse` hook. Run with `/setup-claude-guardrails`. Not loaded into Claude's context: only `SKILL.md` (when invoked) and the rule are.

## Goal

Keep Claude away from sensitive data, on the user's computer and in the repository:

1. Don't read or edit anything outside the defined directories (the project, its worktrees and `additionalDirectories`).
2. Don't read or edit env files and secrets inside them.

Everything else should stay easy. A guardrail that makes Claude take extra steps without protecting either goal is friction to remove, not safety. Judge every change against these two goals.

## Files

| File | Role |
| ---- | ---- |
| `SKILL.md` | Install workflow (read only when the skill runs) |
| `scripts/guardrails.mjs` | The hook, copied to `.claude/hooks/guardrails.mjs` |
| `assets/guardrails.md` | Rule copied to `.claude/rules/guardrails.md`; loads every session, so keep it short |
| `scripts/test-guardrails.sh` | Regression tests (~100 cases); run after every hook change, and against the previous hook to confirm new cases fail on it |

## Blocked

- **Outside scope:** file tools and Bash paths (absolute, `~`, `$HOME`, `..`, bare `cd`) outside the project, worktrees, `additionalDirectories`, temp dirs and `~/.claude`. With the sandbox, the OS also enforces it for every Bash command.
- **Env files:** `.env`, `.env.*`, `*.env` in any case, through wildcards, quote tricks, symlinks, `git show HEAD:.env` and Grep `glob` filters.
- **Claude Code secrets:** `.credentials.json` and `~/.claude.json` (OAuth tokens, MCP API keys).
- **Programs outside the system bin dirs** (`~/.local/bin/...`): run them by name from `PATH`.
- **Calls that can't leave the sandbox:** an excluded command (`gh`, `git push`, `open`) mixed with a backtick, `$(...)`, heredoc, pipe or other command. Denied up front, with the fix in the message, instead of failing later on the proxy.
- **Ask, don't block:** edits to any checkout's `.claude/settings*.json`, the hook itself and `~/.claude/settings.json` (it can turn hooks off).
- **Fail closed:** malformed input or a hook error blocks the call.

## Allowed on purpose

- **`~/.claude`:** Claude Code's own config, plans and saved tool output. Its secrets stay blocked.
- **`.env*.example|.sample|.template|.dist`:** named explicitly, not through a wildcard.
- **Message text:** commit messages and PR titles/bodies with no `$` or backticks (`git commit -m`, `git commit -F - <<'EOF'`, `gh`/`glab` `--title`/`--body`/`--notes`/`--description`). They only get stored, so paths and `.env` in them are words, not file access. File flags (`-F`, `--body-file`, `git commit -t`) are still checked.
- **Paths that can't exist:** `/api/users` in a grep pattern (top-level dir missing, and `/` not writable).
- **`process.env` / `import.meta.env`** in a pattern, unless a file by that name exists.
- **Git hosting and `open` outside the sandbox** (optional): `gh`, `glab`, `git push|pull|fetch`, `open` use the Keychain, SSH agent and network. Risky subcommands (`gh api`, `gh auth`, `open -a`, ...) ask. A call leaves the sandbox only if every command in it is excluded: `git push && gh pr create --body '…'` works; a heredoc, pipe, `cd` or `$(...)` keeps it inside.

## Teaching Claude from mistakes

The rule is always in context and still gets missed, so repeated mistakes are fixed where they happen, in this order:

1. **Prevent:** the `PreToolUse` hook denies the known bad shape with the fix in the message (the model reads denial text closely).
2. **Explain after a failure:** the `PostToolUseFailure` hook matches known sandbox error text and adds the cause and fix as context. It also tells Claude it may suggest improving the guardrail if it keeps costing steps or is unclear: that is the feedback loop for this skill.
3. **Rule:** `assets/guardrails.md` carries the symptom (the error text), not only the do's and don'ts.

Add a new `FAILURE_HINTS` entry (and a case in `test-guardrails.sh`) when a mistake repeats.

## Decided against (keep in mind for future reviews)

- **Re-injecting the whole rule on every denial or failure:** noise. The hint carries only the relevant fix.

- **Commit, push and PR in one call:** `git commit` would run outside the sandbox, and so would the repo's git hooks (husky, lint-staged). Two calls is the floor.
- **Skipping the hook's Bash path checks when the sandbox is on:** the sandbox still lets Bash read `/etc`, `/usr` and `/var/folders`, which holds other apps' temp files.
- **Scanning less of env-file wildcards** (`grep ".env*"`): the shell expands them after the hook runs.
- **Dropping the "ask" on commands that mention settings files:** it protects the guardrails themselves.

## Known limits

Without the sandbox, the Bash checks are a heuristic on command text: `$(...)`, variables, `eval`, scripts and recursive greps get past them. Hooks don't apply to MCP tools. Directories added with `/add-dir` for one session only are invisible to the hook. See `SKILL.md` → Limitations.
