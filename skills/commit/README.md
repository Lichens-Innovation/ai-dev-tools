# commit

Turns uncommitted work into one semantic commit on a feature branch.

## What it does

- Picks the files to stage (never `git add -A`; skips `.env*`, build output, generated reports).
- Runs the project's lint, format and typecheck checks, and asks before running the tests. It stops on a failure and does not commit.
- Creates `<type>/<slug>` when you are on `main`, `master`, `dev`, `develop` or the remote default branch.
- Makes one commit, `type(scope): description`, with no Claude attribution line. It does not push.

`create-pr` calls it on its own when the working tree is dirty or there is no feature branch yet.

## Use it

```
/commit
/commit PROJ-123
```

## Requirements

- `git`. Checks use the project's own package manager and scripts; nothing is installed.
