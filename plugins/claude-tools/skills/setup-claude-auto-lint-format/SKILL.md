---
name: setup-claude-auto-lint-format
description: "Installs a PostToolUse hook that runs the project's linter and formatter on every file Claude Code or one of its subagents writes or edits, and speaks up only when a problem is found (so Claude fixes it), staying silent otherwise: no interruption, no extra tokens. Detects the project's tools (ruff, eslint, prettier, biome, ...) and writes the per-project config. Use when the user wants automatic linting/formatting after Claude's edits, or invokes /setup-claude-auto-lint-format."
disable-model-invocation: true
---

# Setup Claude Auto Lint Format

After each `Write`, `Edit` or `MultiEdit`, run the project's formatter and linter on the file. Clean: no output, Claude is not woken up. A problem: the output goes back to Claude, who fixes it.

| File | Role |
| ---- | ---- |
| `.claude/hooks/auto-lint-format.mjs` | The hook, from this skill's `scripts/auto-lint-format.mjs` |
| `.claude/hooks/auto-lint-format.json` | Which commands run on which files |
| `.claude/settings.json` | Registers the hook (`PostToolUse`, `Write\|Edit\|MultiEdit`) |
| `.claude/rules/auto-lint-format.md` | Optional. Tells Claude not to run the linter/formatter on covered files itself (from `assets/auto-lint-format.md`) |

Shared and committed by default (the lint setup is a team convention); use `.claude/settings.local.json` if the user asks for a personal setup. Hooks fire inside subagents too, so their edits are covered.

How it behaves: all commands pass → exit 0, no output. A command fails → exit 2 with its output on stderr, which PostToolUse shows to Claude (the edit already happened, nothing is blocked). A command that cannot run (not installed, not executable) → exit 1, shown to the user only, since Claude cannot fix it. Internal errors, timeouts (30 s by default, per-rule `timeout` up to 120 s), files outside the project, deleted files and `node_modules` are ignored silently.

Config shape (`{file}` becomes the quoted absolute path; `match` globs are tested on the project-relative path, a glob without `/` on the file name; `cwd` is relative to the project root and `timeout` is in seconds per command, both optional):

```json
{
  "ignore": ["**/generated/**"],
  "rules": [
    { "match": ["*.py"], "commands": ["ruff format {file}", "ruff check {file}"] },
    { "match": ["*.ts", "*.tsx"], "cwd": "apps/web", "timeout": 60, "commands": ["just format-file {file}", "just lint-file {file}"] }
  ]
}
```

Every command of every matching rule runs in order, so put a rewriting formatter before the linter: it fixes the style silently and the linter only reports what remains.

## Workflow

1. **Prerequisites.** `node --version` >= 18; stop and say so otherwise. Work from the git root (`git rev-parse --show-toplevel`).

2. **Detect the tools.** Look at what the project already uses; never invent a tool it does not have.
   - Python: `pyproject.toml` / `ruff.toml` (`ruff`), `black`, `isort`, `flake8`, `mypy` (skip type checkers: whole-project and slow).
   - JS/TS: `package.json` devDependencies and config files for `eslint`, `prettier`, `biome` (`biome.json`); the package manager from the lockfile (`pnpm exec`, `npx`, `yarn`, `bunx`). In a monorepo, find the package that owns each tool and set `cwd` to it.
   - Others: `gofmt`/`golangci-lint`, `cargo fmt`/`cargo clippy` (whole-crate: ask before including), `rubocop`, `shfmt`/`shellcheck`, `terraform fmt`, `markdownlint`.
   - Also read `.pre-commit-config.yaml`, `lefthook.yml`, `.husky/`, the justfile / package scripts / Makefile for lint and format entries, and any `.claude/rules` about linting: they show the intended commands and flags.
   - Prefer commands that take a file and run in about a second. Prefer the repo's own invocation (`pnpm exec eslint {file}`) over a global binary. A project script that only works on the whole project does not fit: skip it and say so.
   - If the repo has the `setup-claude-just-usage` hook, it only filters Claude's Bash calls; this hook runs outside it, so the raw tool is fine here.
   - **Justfile.** If a level has a justfile (`git ls-files` for `justfile`, `Justfile`, `.justfile`; `just --list`), note which recipes already cover lint/format. Recipes that act on the whole project (`just lint`) do not fit a per-file hook; step 3 proposes per-file ones.
   - **Extra checks.** Note what else exists beyond lint/format and could run on a file: type checkers (`pyright`, `mypy`, `tsc`, `vue-tsc`), `shellcheck`, `actionlint`, `hadolint`, a related-tests runner (`vitest related`, `jest --findRelatedTests`, `pytest <test file>`). For each, record whether it can be scoped to one file and roughly how long it takes (run it once and time it). Whole-project checkers (`tsc --noEmit`, `mypy .`) report errors in files Claude did not touch and are slow: flag them as such.

3. **Propose the rules.** One rule per language/package: `match` globs, `cwd`, and commands in the order formatter then linter. Use the tool's **fix/write** flag for formatters (`ruff format`, `prettier --write`, `biome format --write`) and **check, no fix** for linters (`ruff check`, `eslint`, `biome lint`), unless the user wants the linter to autofix too (`--fix`). Add `ignore` globs for generated or vendored code (build output, `*.min.js`, migrations, lockfiles).
   - **With a justfile, propose per-file recipes** in that level's justfile and have the rule call them (`"commands": ["just format-file {file}", "just lint-file {file}"]`, `cwd` the justfile's directory). One place then owns the flags, and humans get the same commands. Show the recipes before adding them, append them next to the existing lint/format recipes in the justfile's style, and prefix the body with `@` so just does not echo the line into the findings. Adapt to the tools found:

     ```just
     # Format one file in place (used by the Claude auto-lint-format hook)
     format-file file:
         @ruff format {{file}}

     # Lint one file, no fixes (used by the Claude auto-lint-format hook)
     lint-file file:
         @ruff check {{file}}
     ```

     A language with several tools in one repo (Python and TypeScript) gets one recipe per language (`lint-py-file`, `lint-ts-file`) or a recipe that picks by extension. If a suitable per-file recipe already exists, reuse it and add nothing. If the user declines the recipes, fall back to the tools' own commands. If the level has the `just-usage` rule (`.claude/rules/use-just-commands.md`), tell the user to re-run `/setup-claude-just-usage` so its table lists the new recipes.
   - **Extra checks** that can be scoped to a file and finish in a few seconds (a file-scoped type check, `shellcheck`) go after the linter, as additional commands of the same rule or as their own recipe (`check-file`). Slow ones get a `"timeout"` (seconds, default 30, max 120) on the rule. Do not add a whole-project check unless the user asks for it in step 4.
   Run each proposed command once by hand on a real tracked file (`<command with {file} replaced>`) and fix the proposal if it errors for a reason other than a finding (wrong flags, missing config, wrong `cwd`).

4. **Ask** in one `AskUserQuestion` call, showing the rules compactly:
   - "Install these rules?": yes (recommended), or adjust (user edits; apply and show again).
   - "Formatter mode": fix silently (recommended: Claude hears nothing about style it did not have to fix) or check only (formatter also reports, Claude fixes by hand; more usage).
   - Only if step 2 found extra checks: "Run more than lint and format after each edit?" (multi-select), one option per check with its scope and measured time (e.g. "pyright on the file, ~2 s", "tsc --noEmit, whole project, ~15 s, may report other files' errors"). Default none beyond the file-scoped fast ones; say that every check adds time to each edit and that findings cost Claude tokens to fix.
   - Only if a justfile was found and no per-file recipe exists: "Add per-file recipes to the justfile?": yes (recommended) or no (call the tools directly).
   - "Add a rule telling Claude not to run the linter and formatter itself?": yes (recommended: the hook already does it, and Claude otherwise repeats it, costing tokens) or no (Claude may still double-check before committing).
   - If `.claude/settings.json` is untracked or gitignored: "Where to register the hook?": `settings.json` (recommended if tracked) or `settings.local.json`.

5. **Write the files.**
   - Copy `scripts/auto-lint-format.mjs` to `<root>/.claude/hooks/auto-lint-format.mjs`. If a copy exists and differs, show the diff and ask first.
   - `<root>/.claude/hooks/auto-lint-format.json` as above, 2-space indentation. If it exists, merge by rule `match`: update commands, keep rules the user added.
   - If the user said yes to the rule: `<root>/.claude/rules/auto-lint-format.md` from `assets/auto-lint-format.md`. Fill in the real tools and extensions from the config, and list under "Not covered" only what applies here (languages with no rule, the whole-project checks the project has: type checking, tests, a full lint recipe). Drop the template comment and any empty placeholder. If the repo has `.claude/rules/use-just-commands.md`, word the first sentence as "no need to run" rather than "never run" so it does not contradict "always use just". If the file exists, show what changes and ask first.
   - `<root>/.claude/settings.json` (`{}` if absent): merge, never replace; keep other keys and hooks, 2-space indentation. Skip if an entry with the same `command` exists.

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
   - `bash scripts/test-auto-lint-format.sh <root>/.claude/hooks/auto-lint-format.mjs` from this skill's directory (always `bash`). Report failures verbatim.
   - Against the real project, with `CLAUDE_PROJECT_DIR=<root>`: pipe `{"tool_name":"Edit","cwd":"<root>","tool_input":{"file_path":"<a tracked file per rule>"}}` to the hook. A clean file must give exit 0 and no output. To see a failure, create a probe file inside the project (e.g. `<dir>/zz_lint_probe.<ext>`, so the rule's globs and `cwd` apply) containing an obvious error (an unused import, a missing semicolon), run the hook, expect exit 2 with the linter's message, then delete the probe. Never touch a user's own file for this.
   - If the rule was written, check that its extensions and tools match the config, and that it has no leftover placeholder (`<`).

7. **Report** the rules, the files written (tracked or not), and the limits below. Hooks load at session start: restart Claude Code.

## Limits: tell the user

- Only `Write`, `Edit` and `MultiEdit` are covered. Files changed through Bash (`sed -i`, a generator, `git checkout`) and `NotebookEdit` are not.
- The check is per file. Whole-project problems (type errors, import cycles, a rule that needs other files) are not seen: use a type checker or CI for those.
- A formatter in fix mode rewrites the file after Claude wrote it. Claude Code is told the file changed, but if a formatter fights a hand-written style, tune the formatter config rather than the hook.
- Every edit costs one run of each command (a command past its timeout is dropped silently, not reported): keep commands fast. Extra checks such as type checking or tests add to every edit, and whole-project ones report errors in files Claude did not touch.
- Per-file recipes added to a justfile are written once; they follow the tool setup of today like the rest of the config.
- The rule is advice, not enforcement: Claude can still run the linter. It lists the file types and tools of today; re-run the skill when they change.
- Rules reflect the tools found today. Re-run the skill after the lint setup changes; it merges.
- If the user's session also has the guardrails hook, `.claude/settings.json` edits ask for confirmation: expect a prompt.
