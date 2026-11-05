---
name: commit
description: "Commits the working changes: runs the project checks, creates a feature branch when on main/dev, and makes one semantic commit. Use when the user asks to commit, or when generate-pr-description finds uncommitted changes or no feature branch."
---

# Commit

Turns uncommitted work into one clean semantic commit on a feature branch. It never pushes and never opens a PR; `generate-pr-description` does that afterwards.

**Language:** commit messages in English, whatever the user's language.

## Workflow

One command per call; never `cd`.

1. **Look at the state.** `git status --short` and `git branch --show-current`. Nothing to commit: say so and stop.

2. **Choose the files.** Stage explicit paths, never `git add -A` or `git add .`. Leave out and name to the user: `.env*`, credentials, build output, generated reports and PDFs, editor files, and `pr-description.md`. If a path looks like it belongs to unrelated work, ask.

3. **Run the checks.** Detect them from `package.json` scripts, `Makefile`, `pyproject.toml`, `CLAUDE.md`/`AGENTS.md`, and `.github/workflows` (what CI runs is the reference).

   | Check | Default |
   |---|---|
   | lint, format check, typecheck | Run |
   | tests | Ask first: "Run the tests too? [y/N]" (default **N**) |
   | build, e2e, anything long | Skip, unless the user asks |

   - Skip a check this conversation already shows passing on the same changes.
   - Use the project's package manager (by lockfile): `pnpm run lint`, `npm run lint`, `yarn lint`. Never `npx`, never install anything.
   - A check fails: show the output and stop. Do not commit, do not fix unrelated code. Fixing the failure in the changed files is fine if it is small; then re-run that check.
   - No checks found: say so in one line and continue.

4. **Branch.** If the current branch is `main`, `master`, `dev`, `develop` or the remote default (`git symbolic-ref --short refs/remotes/origin/HEAD`), create `<type>/<slug>` with `git switch -c <name>` (never `-t`/`--track`; it carries the changes along). `<slug>` is 2–5 kebab-case words from the change, 40 characters at most, prefixed with a ticket key if the user gave one (`feat/PROJ-123-team-assignment`). Already on a feature branch: stay on it.

5. **Message.** `<type>(<scope>): <short description>`, under 72 characters, imperative, no trailing period.

   | Type | Use for |
   |---|---|
   | `feat` | new feature |
   | `fix` | bug fix |
   | `docs` | documentation only |
   | `style` | formatting, no logic change |
   | `refactor` | restructuring, same behavior |
   | `perf` | performance |
   | `test` | tests only |
   | `chore` | deps, config, maintenance |

   Scope is the package, plugin or folder most of the change lives in; omit it if unclear. Add a short body only when the *why* is not obvious from the title. **No `Co-Authored-By` or any other Claude attribution line.**

6. **Confirm.** Show the files to stage, the branch (new or current) and the message. Mention in one line that the changes could be split into several commits if they clearly mix types, but default to one. Ask "Commit? [Y/n]" (default **Y**).

7. **Commit.** `git add <paths>`, then `git commit -m '<message>'` (a second `-m` for the body). Never `--no-verify`. If a hook fails, fix what it reports and make a **new** commit; do not amend.

8. **Report** the branch, the short hash and the title. Say it is not pushed.

## Will not do

- Push, open or update a PR, or create tags.
- Amend, rebase, force anything, or touch commits that already exist.
- Fix failures in code the user did not change.
