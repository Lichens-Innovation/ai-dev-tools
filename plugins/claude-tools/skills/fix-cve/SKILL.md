---
name: fix-cve
description: "Works through a weekly dependency report issue: fixes the easy CVE and pnpm override items, reviews the rest with the user one by one, and records the ones to ignore. Use when the user runs /fix-cve, asks to fix the weekly dependency report, or to clear its pnpm audit findings."
argument-hint: "[report issue URL]"
---

# Fix CVE

Turns one **Weekly dependency report** issue (made by `.github/scripts/dependency-report.cjs`, the renovate-runner template) into one branch of fixes. Easy items are fixed without asking; the rest go to the user one at a time; what the user decides to ignore goes in `.github/dependency-report-ignore.yml`. Ends with a commit and hands over to `/git:create-pr`.

One command per call, never `cd`. Commands below run from the repo root.

## 1. Read the report

- With a URL: `gh issue view <url> --json number,title,body,url`.
- Without one: `gh issue list --state open --search '"Weekly dependency report" in:title' --json number,title,url`, keep the exact title match. None open: say "nothing to fix" and stop.
- The report is a snapshot from its last run. Re-check it against the repo now: `node .github/scripts/dependency-report.cjs --no-prs` (overrides and audit, current state). Items gone since the report are already fixed: drop them.

Sections and what each item is:

| Section | Item |
| --- | --- |
| Security PRs rejected by the Claude CVE gate | A Renovate PR; Claude's review (in `<details>`) says what to change |
| Security PRs without a gate verdict | A Renovate PR the gate never judged (didn't run, or failed) |
| pnpm overrides to remove | An override key, status `removable`, `unused` or `check by hand`, maybe `(ignore expired …)` |
| pnpm audit findings | An advisory: package, installed versions, `Fixed in`, one dependency path |
| Ignore list to clean up | A bad or stale entry in `.github/dependency-report-ignore.yml` |
| Ignored | Skip: already decided |

## 2. Prepare the branch

- `git status --short`: uncommitted changes → ask the user to commit or stash first, and stop.
- Switch to the default branch, update it (`git pull` alone in its call), then `git switch -c fix/deps-<YYYY-MM-DD>` (never `-t`).

## 3. Classify every item

For each audit finding, find where it comes from: `pnpm why -r <package>`, plus `"dev": true|false` per finding in `pnpm audit --json`.

| Item | Fix | Ask the user? |
| --- | --- | --- |
| Override `removable` or `unused` | Delete the key from `pnpm-workspace.yaml` (or `pnpm.overrides` in `package.json`) | No |
| Override `check by hand`, or `ignore expired` on anything | Look at why it was added (`git log -S '<key>' -- pnpm-workspace.yaml`) | Yes |
| Finding on a **direct** dependency, fixed version in the same major | Bump it in each workspace `package.json` that declares it, or in the `catalog:` if it uses one | No |
| Finding on a **transitive** dependency, fixed version in the same major as installed | Override `"<pkg>@<<fixed>": ^<fixed>` in `pnpm-workspace.yaml` `overrides`, scoped to the vulnerable range so other majors stay untouched | No |
| Finding that only dev tooling pulls in (`dev: true`: lint, test, build tools) | As above, even across a major; verification decides | No, unless verification fails |
| Finding whose fix is a new major in code the app runs (katex 0.16 → 0.18 under mermaid) | Prefer bumping the parent to a release that already depends on the fix (`pnpm view <parent> dependencies.<pkg>`); else an override across the major | Yes |
| Rejected security PR | Apply the change Claude's review asks for (often: the same bump in another workspace, or in the catalog/overrides instead) | Yes |
| PR without a gate verdict | Show `gh pr checks <n>`; handle its advisory like an audit finding | Yes |
| Ignore list: entry matching nothing | Delete it | No |
| Ignore list: entry missing `reason`/`until` | Fill it in from the user's answer | Yes |

Show the classification as a short table (item, plan, auto or ask) before changing anything.

## 4. Apply the easy fixes in one batch

- Edit `package.json` / `pnpm-workspace.yaml` with Edit, never `sed`.
- A fixed version published in the last few days may be blocked by `minimumReleaseAge`: add `<pkg>@<version>` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, as the file already does for others.
- An override pinning a package the workspace also declares directly does not move the direct copy (`pnpm why` still shows the old version): bump the `package.json` instead.
- Ask the user to run `! pnpm install` (installs don't work in the sandbox). Wait for them.

## 5. Verify

Run, in this order, and read every result:

1. `pnpm audit --json`: each fixed advisory is gone, no new one appeared.
2. `pnpm why -r <package>` for each fixed package: a single patched version left.
3. `node .github/scripts/dependency-report.cjs --no-prs`: nothing you fixed is still listed and no override became `unused`.
4. The project's lint, typecheck, build and tests (from `package.json` scripts, `turbo`, `CLAUDE.md`).

- A test that fails only on a sandbox limit (`EMFILE` on `fs.watch`, a port bind refused) is not a regression: ask the user to run that test with `!`.
- A fix that breaks a check: revert that one change, run `! pnpm install` again, and move the item to step 6 with the failure as context.

## 6. Go through the other items with the user, one at a time

For each, first gather what the user needs to decide: what changes (versions, major or not, the parent chain), the changelog or release notes for a major (`pnpm view <pkg> repository.url`, then its releases), where the app uses it (grep the imports of the package or its parent in the app's `src/`), and so the concrete manual checks ("open a Mermaid diagram with math in design-studio and check it renders").

Then ask with AskUserQuestion, one item per question:

- **Fix now**: apply it, `! pnpm install`, re-run step 5, and add its manual checks to the list.
- **Ignore**: ask for the reason (why it isn't exploitable here, or what blocks the fix) and write the entry, `until` = today + 90 days unless the user says otherwise.
- **Skip this week**: change nothing; it stays in next week's report.

The ignore file, created with this header if missing:

```yaml
# Items the weekly dependency report lists as "Ignored" until their date.
# Format: renovate-runner docs/dependency-report.md
advisories:
  - id: GHSA-238p-pmpm-9mq7 # GHSA, CVE or npm advisory number, as in the report
    reason: Mermaid only renders our own math, never user input
    until: 2027-02-12
overrides:
  - key: "postcss" # the override key exactly as written
    reason: Exact pin; newer versions break the design-studio build
    until: 2027-02-12
```

Never add an entry the user did not choose, and never write a vague reason ("later", "low"): ask again.

## 7. Commit and hand over

- Run `node .github/scripts/dependency-report.cjs --no-prs` one last time: what is left should be only the skipped items.
- Commit with the `git:commit` skill (title like `fix(deps): weekly dependency report <YYYY-MM-DD>`; body: one line per fixed item, ignored item and skipped item). If that skill is not installed, commit the touched files yourself with that message.
- Tell the user to run `/git:create-pr`, and give them the manual-check list to verify before merging (and to paste into the PR).
- Say which items were skipped: they come back in the next report. After the merge, the user can run the report workflow by hand (`gh workflow run dependency-report.yml`) to refresh the issue; it closes itself when nothing is left.

## Will not do

- Close the report issue (the next report run does it), merge anything, or push to Renovate's branches.
- Close Renovate PRs: once the fix is on the default branch, Renovate closes its own PR on its next run.
- Ignore an item without the user's explicit choice, or with no reason and expiry date.
- Run `pnpm update` or refresh the whole lockfile: only the reported items change.
- Edit `dependency-report.cjs` or the workflow: those are copies of the renovate-runner template.
