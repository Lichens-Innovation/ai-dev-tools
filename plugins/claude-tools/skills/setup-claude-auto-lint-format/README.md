# setup-claude-auto-lint-format

Runs the project's formatter and linter on every file Claude Code (or one of its subagents) writes or edits, and says nothing unless something is wrong. Run with `/setup-claude-auto-lint-format`. Not loaded into Claude's context: only `SKILL.md` (when invoked) is.

## Files

| File | Role |
| ---- | ---- |
| `SKILL.md` | Install workflow (read only when the skill runs) |
| `scripts/auto-lint-format.mjs` | The hook, copied to `.claude/hooks/auto-lint-format.mjs` |
| `assets/auto-lint-format.md` | Template for the optional `.claude/rules/auto-lint-format.md`; loads every session, so keep it short |
| `scripts/test-auto-lint-format.sh` | Regression tests (~20 cases) in a throwaway project; run after every hook change |

## Generated, per repository

- `.claude/hooks/auto-lint-format.json`: `{ "ignore": [...], "rules": [{ "match", "cwd", "commands" }] }`, detected from the project's own tools.
- Optional `.claude/rules/auto-lint-format.md`: tells Claude the hook already lints and formats the covered files, so it should not run those tools itself (silence means clean), and lists what is not covered (Bash edits, whole-project checks).
- `.claude/hooks/auto-lint-format.mjs` and the `PostToolUse` `Write|Edit|MultiEdit` entry in `.claude/settings.json`. Committed: the lint setup is a team convention.

## Design choices

- **Silent on success.** A `PostToolUse` hook that exits 0 with no output adds nothing to the conversation, so a clean edit costs no tokens and no interruption. Exit 2 with the findings on stderr is shown to Claude, who fixes them; the edit is not blocked (it already happened).
- **Formatter fixes, linter reports.** The formatter runs in write mode and rewrites the file silently; only what the linter still finds is sent back. Switchable to check-only at install time.
- **Justfile aware.** With a justfile, the skill offers per-file recipes (`format-file`, `lint-file`) and the hook calls them, so the repo owns the flags. It also offers extra file-scoped checks (type check, shellcheck, related tests) after measuring their speed, and warns about whole-project ones; slow rules get a `timeout`.
- **Config, not detection, at run time.** The skill detects the tools once and writes explicit commands; the hook just runs them, so it stays fast and predictable. Re-run the skill when the lint setup changes.
- **Setup problems go to the user.** A command that is not installed exits 1 (shown to the user only) instead of 2, so Claude is not asked to fix something it cannot.
- **Fails open.** Internal errors, timeouts, missing config, files outside the project: exit 0, silently.
- **A rule to stop duplicate runs.** Without it Claude tends to run the linter itself after editing, repeating what the hook did. The rule says "no need to run" (not "never"), so it does not contradict the just-usage rule, and leaves whole-project checks to Claude.
- **Subagents included.** Hooks run inside subagents, so one registration covers all edits.

## Known limits

Only `Write`, `Edit` and `MultiEdit` are seen (not Bash edits or notebooks), and checks are per file. See `SKILL.md` → Limits.
