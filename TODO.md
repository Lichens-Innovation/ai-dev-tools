# Todo

Do item 8 and 9. Review other plans from `docs/plans` to see if they still hold true.

Do the task from `docs/plans/core-absorption.md`

One thing worth carrying into the new session: the sandbox fix in apps/maestro/CLAUDE.md has to be re-applied after any install that re-extracts Electron, since pnpm doesn't preserve the setuid bit. If dev suddenly dies with the SUID error again, that's why — not a regression.
