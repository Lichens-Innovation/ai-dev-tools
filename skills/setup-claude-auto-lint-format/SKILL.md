---
name: setup-claude-auto-lint-format
description: "Installs a PostToolUse hook that runs the project's linter and formatter on every file Claude Code or one of its subagents writes or edits, and speaks up only when a problem is found (so Claude fixes it): no interruption, no extra tokens when clean. Detects the project's tools (ruff, eslint, prettier, biome, ...) and writes the per-project config. Use when the user wants automatic linting/formatting after Claude's edits, or invokes /setup-claude-auto-lint-format."
disable-model-invocation: true
---

# Setup Claude Auto Lint Format

After each `Write`, `Edit` or `MultiEdit` (subagents included), run the project's formatter and linter on the file. Clean: no output. A problem: the output goes back to Claude, who fixes it.

| File | Role |
| ---- | ---- |
| `.claude/hooks/auto-lint-format.mjs` | The hook, from `scripts/auto-lint-format.mjs` |
| `.claude/hooks/auto-lint-format.json` | Which commands run on which files |
| `.claude/settings.json` | Registers the hook (`PostToolUse`, `Write\|Edit\|MultiEdit`) |
| `.claude/rules/auto-lint-format.md` | Optional: tells Claude not to run these tools itself (from `assets/auto-lint-format.md`) |

Committed by default (a team convention); `.claude/settings.local.json` if the user wants it personal.

Hook behavior: all commands pass → exit 0, no output. One fails → exit 2, its output on stderr, which PostToolUse shows to Claude (nothing is blocked). A command that cannot run (not installed) → exit 1, shown to the user only. Internal errors, timeouts (30 s, or the rule's `timeout` up to 120), files outside the project, deleted files and `node_modules` are ignored silently.

Config (`{file}` = quoted absolute path; `match` globs test the project-relative path, or the file name if the glob has no `/`; `cwd` is relative to the root; `timeout` is seconds per command; both optional):

```json
{
  "ignore": ["**/generated/**"],
  "rules": [
    { "match": ["*.py"], "commands": ["ruff format {file}", "ruff check {file}"] },
    { "match": ["*.ts", "*.tsx"], "cwd": "apps/web", "timeout": 60, "commands": ["just format-file {file}", "just lint-file {file}"] }
  ]
}
```

Every command of every matching rule runs in order: put a rewriting formatter before the linter, so only what remains is reported.

## Workflow

1. **Prerequisites.** `node --version` >= 18, else stop. Work from the git root (`git rev-parse --show-toplevel`).

2. **Detect.** Use only what the project already has.
   - Python: `ruff`, `black`, `isort`, `flake8`. JS/TS: `eslint`, `prettier`, `biome`, with the package manager from the lockfile (`pnpm exec`, `npx`, ...); in a monorepo, `cwd` is the package that owns the tool. Others: `gofmt`, `rubocop`, `shfmt`, `terraform fmt`, `markdownlint`, ...
   - Read `.pre-commit-config.yaml`, `lefthook.yml`, `.husky/`, package scripts, Makefile, justfile and `.claude/rules` for the intended commands and flags.
   - Want commands that take one file and run in about a second, via the repo's own invocation. Whole-project scripts do not fit: skip and say so. This hook runs outside Claude's Bash tool, so a just-usage hook does not block the raw tools here.
   - **Justfile** (`git ls-files` for `justfile`, `Justfile`, `.justfile`; `just --list`): note recipes already covering lint/format and whether they take a file.
   - **Extra checks** that could run on a file: type checkers (`pyright`, `mypy`, `tsc`), `shellcheck`, `actionlint`, `hadolint`, related tests (`vitest related`, `jest --findRelatedTests`). Run each once and record whether it scopes to one file and how long it takes. Whole-project ones (`tsc --noEmit`, `mypy .`, `cargo clippy`) are slow and report other files' errors: flag them.

3. **Propose.** One rule per language/package: `match`, `cwd`, formatter then linter. Formatters use the fix flag (`ruff format`, `prettier --write`), linters check only (`ruff check`, `eslint`), unless the user wants `--fix`. Add `ignore` globs for generated or vendored code.
   - **With a justfile, propose per-file recipes** the rule calls (`just format-file {file}`, `cwd` the justfile's directory), so the repo owns the flags. Show them, append them next to the existing lint recipes in its style, `@` prefix so just does not echo the line into the findings:

     ```just
     # Format one file in place (used by the Claude auto-lint-format hook)
     format-file file:
         @ruff format {{file}}

     # Lint one file, no fixes (used by the Claude auto-lint-format hook)
     lint-file file:
         @ruff check {{file}}
     ```

     Several languages: one recipe per language (`lint-py-file`) or one picking by extension. A suitable recipe exists: reuse it. If the level has `.claude/rules/use-just-commands.md`, tell the user to re-run `/setup-claude-just-usage` to list the new recipes. If the user declines, call the tools directly.
   - **Extra checks** that are file-scoped and take a few seconds go after the linter (same rule, or a `check-file` recipe); slow ones get a `timeout`. No whole-project check unless the user picks it in step 4.
   - Run each command once by hand on a real tracked file; fix the proposal if it fails for a reason other than a finding (flags, config, `cwd`).

4. **Ask** in one `AskUserQuestion` call, with the rules shown compactly:
   - "Install these rules?": yes (recommended) or adjust (apply, show again).
   - "Formatter mode": fix silently (recommended) or check only (formatter also reports; more usage).
   - Only if extra checks were found: "Run more than lint and format after each edit?" (multi-select), each with scope and measured time (e.g. "pyright on the file, ~2 s", "tsc --noEmit, whole project, ~15 s, reports other files' errors"). Default: none beyond the fast file-scoped ones. Each check adds time to every edit and its findings cost tokens.
   - Only if a justfile exists without per-file recipes: "Add per-file recipes?": yes (recommended) or no.
   - "Add a rule telling Claude not to run the linter and formatter itself?": yes (recommended: avoids duplicate runs) or no.
   - If `.claude/settings.json` is untracked or gitignored: register in `settings.json` (recommended if tracked) or `settings.local.json`.

5. **Write.**
   - Copy `scripts/auto-lint-format.mjs` to `<root>/.claude/hooks/auto-lint-format.mjs`; if it exists and differs, show the diff and ask.
   - `<root>/.claude/hooks/auto-lint-format.json`, 2-space indentation; if it exists, merge by rule `match`, keep the user's rules.
   - If the rule was chosen: `<root>/.claude/rules/auto-lint-format.md` from `assets/auto-lint-format.md`, with the real tools and extensions, and under "Not covered" only what applies here. Drop the comment and empty placeholders. If `.claude/rules/use-just-commands.md` exists, keep the wording "Don't run them on those files" (not "never") so it does not clash with "always use just". If the file exists, show the change and ask.
   - `<root>/.claude/settings.json` (`{}` if absent): merge, never replace; skip if the same `command` is there.

     ```json
     {
       "hooks": {
         "PostToolUse": [
           {
             "matcher": "Write|Edit|MultiEdit",
             "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/auto-lint-format.mjs\"" }]
           }
         ]
       }
     }
     ```

6. **Verify.**
   - `bash scripts/test-auto-lint-format.sh <root>/.claude/hooks/auto-lint-format.mjs` from this skill's directory (always `bash`); report failures verbatim.
   - With `CLAUDE_PROJECT_DIR=<root>`, pipe `{"tool_name":"Edit","cwd":"<root>","tool_input":{"file_path":"<a tracked file per rule>"}}` to the hook: exit 0, no output. Then create a probe file in the project (`<dir>/zz_lint_probe.<ext>`) with an obvious error, expect exit 2 with the linter's message, and delete it. Never alter a user's file.
   - If the rule was written: its extensions and tools match the config, no `<` placeholder is left.

7. **Report** the rules, the files written (tracked or not) and the limits. Hooks load at session start: restart Claude Code.

## Limits: tell the user

- Only `Write`, `Edit`, `MultiEdit` are seen: not Bash edits (`sed -i`, generators) or `NotebookEdit`.
- Checks are per file: whole-project problems (types, import cycles) need a type checker or CI.
- A fixing formatter rewrites the file after Claude wrote it; if it fights a hand-written style, tune its config.
- Every edit runs every command; one past its timeout is dropped silently. Keep them fast.
- The rule is advice, not enforcement. Rules, recipes and the rule file reflect today's tools: re-run the skill after the lint setup changes; it merges.
- With the guardrails hook active, `.claude/settings.json` edits ask for confirmation.
