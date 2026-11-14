# fix-cve

Works through the **Weekly dependency report** issue that the opt-in dependency-report workflow keeps in a pnpm repo (template and docs: `docs/dependency-report.md` in Lichens-Innovation/renovate-runner). Run with `/fix-cve <issue URL>`, or `/fix-cve` alone to find the open report in the current repo.

It fixes the easy items in one batch (removable overrides, same-major bumps, dev tooling, stale ignore entries), then goes through the others with you one at a time:

- **Renovate PRs waiting for you** (runtime updates, majors, lock file maintenance, and auto-merge PRs whose checks fail): what changes, the release notes that matter for your code, the checks, and the manual checks to do. You pick merge, fix first (locally, on the fix branch), close, or skip.
- **Everything else** (major jumps in app code, PRs the Claude CVE gate rejected or never judged, overrides to check by hand): fix now, ignore with a reason and an expiry date, or skip until next week.

It ends with one commit and the list of manual checks to do before merging; you open the PR with `/git:create-pr`.

It pairs with the `automerge-routine` Renovate preset: what passes CI merges by itself, and what needs you comes through this skill.

## Files

| File | Role |
| ---- | ---- |
| `SKILL.md` | Report sections, classification table, fix and verification steps |

## Writes, in the repo

- `package.json` files, `pnpm-workspace.yaml` (`overrides`, `minimumReleaseAgeExclude`), and `pnpm-lock.yaml` through your `pnpm install`.
- `.github/dependency-report-ignore.yml`: what you chose to ignore, read by the next report.

On GitHub: merges or closes the Renovate PRs you choose (`gh pr merge`, `gh pr close`).

## Design choices

- **The report is re-checked, not trusted.** It is up to a week old; the skill re-runs the report script locally (`--no-prs`) before and after fixing.
- **Auto vs ask.** Same-major and dev-only fixes are verified by audit, lint, build and tests, so they don't need you. A new major in code the app runs, or a judgement Claude's gate already questioned, does.
- **Overrides are scoped** to the vulnerable range (`pkg@<fixed`), so they can be removed by the report once no parent needs them.
- **Ignores expire.** Every entry has a reason and an `until` date (90 days by default); after it, the item is reported again.
- **One PR, one answer.** It merges or closes a Renovate PR only after you picked that option for that PR, never several on one answer. Closing tells Renovate to skip that version, so it says so before closing.
- **You run `pnpm install`.** Installs don't fit the guardrails sandbox, so the skill asks for `! pnpm install`.

## Known limits

- pnpm repos only, with the dependency-report script copied to `.github/scripts/`. In a repo without it, `fix-cve` lists what is missing and suggests `/setup-dependency-automation`.
- It does not open the PR: `git:create-pr` can't be called from another skill.
