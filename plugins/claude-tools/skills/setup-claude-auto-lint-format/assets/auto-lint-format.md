# Auto lint and format

<!-- Template: fill from .claude/hooks/auto-lint-format.json. Keep it this short: it loads every session. -->

A hook runs <tools, e.g. `ruff`, `eslint`, `prettier`> after every Write/Edit/MultiEdit on <extensions, e.g. `*.py`, `*.ts`> and fixes style in place. Don't run them on those files: no hook message means the file is clean.

Not covered, run them yourself: files changed through Bash, <file types with no rule>, <whole-project checks, e.g. type checking, tests, a full `just lint` before finishing>.
