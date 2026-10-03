# Auto lint and format

<!-- Template: fill from .claude/hooks/auto-lint-format.json. Keep it to about 6 lines: it loads every session. -->

A hook runs the formatter and linter (<tools, e.g. `ruff`, `eslint`, `prettier`>) after every `Write`, `Edit` or `MultiEdit` on <extensions, e.g. `*.py`, `*.ts`, `*.tsx`>, and fixes style in place. Don't run them yourself on those files: no message from the hook means the file is clean, and it reports only what you must fix, so there is no need to run them again to confirm.

- Not covered, so run them yourself when relevant: files changed through Bash, <file types with no rule>, <extra checks the hook does not run, e.g. whole-project type checking, tests, a full `just lint` before finishing>.
- Run them when the user asks.
