---
name: fix-cve
description: "Works through a weekly dependency report issue: fixes the easy CVE and pnpm override items, recommends a decision for each waiting Renovate PR and other item in one table, acts on the user's answer, and records the ones to ignore. Use when the user runs /fix-cve, asks to fix the weekly dependency report, to clear its pnpm audit findings, or to review the waiting Renovate PRs."
argument-hint: "[report issue URL]"
---

# Fix CVE

Turns one **Weekly dependency report** issue (made by `.github/scripts/dependency-report.cjs`, the renovate-runner template) into decisions and one branch of fixes:
- Easy items are fixed without asking.
- For Renovate PRs and the other items, it researches each one and shows one table with a recommendation per item. The user agrees or names the rows to change; a PR is merged or closed only when its row says so and the user approved it.
- What the user decides to ignore goes in `.github/dependency-report-ignore.yml`.

It ends with a commit and hands over to `/git:create-pr`.

One command per call, never `cd`. Commands below run from the repo root.

## 1. Read the report

- With a URL: `gh issue view <url> --json number,title,body,url`.
- Without one: `gh issue list --state open --search '"Weekly dependency report" in:title' --json number,title,url`, keep the exact title match.
- None open: check the repo is set up before saying "nothing to fix":
  - `.github/workflows/dependency-report.yml` and `.github/scripts/dependency-report.cjs` exist;
  - `renovate.json` extends `local>Lichens-Innovation/renovate-runner:claude-cve-gate` and `:automerge-routine`.

  If something is missing, list it and suggest `/setup-dependency-automation`, then stop. If all of it is there, say "nothing to fix" and stop: the report closes its issue when nothing is left.
- With a report but no presets: work through it, and mention `/setup-dependency-automation` once in the summary.
- The report is a snapshot from its last run. Re-check it now:
  - Overrides and audit: `node .github/scripts/dependency-report.cjs --no-prs`. `yaml@2 not found` (or `semver@7`) means the repo doesn't install them: set `REPORT_DEPS_DIR` to an **absolute** directory whose `node_modules` has them, e.g. a `node_modules/.pnpm/yaml@2.x.y` folder of another pnpm repo (`find .. -maxdepth 4 -type d -name 'yaml@2.*' -path '*node_modules/.pnpm*'`).
  - Each listed PR: `gh pr view <n> --json state,statusCheckRollup`.
  - Items already fixed, merged or closed since the report: drop them.

Sections and what each item is:

| Section | Item |
| --- | --- |
| Security PRs rejected by the Claude CVE gate | A Renovate PR; Claude's review (in `<details>`) says what to change |
| Security PRs without a gate verdict | A Renovate PR the gate never judged (didn't run, or failed) |
| Renovate PRs waiting for you | A Renovate PR with its type (pin, non-major, major, lock file), checks, age and why: `needs your review`, `auto-merge blocked: failing check` or `auto-merge stalled` |
| pnpm overrides to remove | An override key, status `removable`, `unused` or `check by hand`, maybe `(ignore expired …)` |
| pnpm audit findings | An advisory: package, installed versions, `Fixed in`, one dependency path |
| Ignore list to clean up | A bad or stale entry in `.github/dependency-report-ignore.yml` |
| Ignored | Skip: already decided |

## 2. Prepare the branch

- `git status --short`: uncommitted changes → ask the user to commit or stash first, and stop.
- Switch to the default branch, update it (`git pull` alone in its call), then `git switch -c fix/deps-<YYYY-MM-DD>` (never `-t`).
- Only Renovate PRs to merge or close, nothing to change locally: the branch is created only once a local fix is needed.

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
| Renovate PR, any type | Step 6 recommendation | Yes |
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
4. The project's lint, typecheck, build and tests (from `package.json` scripts, `turbo`, `CLAUDE.md`, and what `.github/workflows` runs on pull requests).

- A test that fails only on a sandbox limit (`EMFILE` on `fs.watch`, a port bind refused) is not a regression: ask the user to run that test with `!`.
- A fix that breaks a check: revert that one change, run `! pnpm install` again, and move the item to step 6 with the failure as context.

## 6. Recommend a decision for every other item, then act on the user's answer

The user can't judge a bare "merge, close or skip?": the point of this step is your recommendation. Research every item, show **one table** with a recommendation for each, and let the user answer in plain text ("agree", or the rows they want changed and why). Don't ask item by item with AskUserQuestion.

### Gather, for each item

Renovate PRs:

- **What changes:** `gh pr view <n> --json title,body,files` and `gh pr diff <n>`: each package, old → new version, dev or runtime, which workspace. A pin PR: does the pinned version match the lockfile, and does it pin anything the report flags (a vulnerable version, an override this branch removes)?
- **Group or not:** a group PR (body says "This PR will be recreated if closed unmerged", or several packages under one group name) comes back after a close. See **Close** below.
- **Checks:** `gh pr checks <n>`; for a failure, `gh run view <run-id> --log-failed` and name the package that breaks it (in a group, the error usually points at one tool: a new lint rule, a stricter type).
- **Release notes** between the two versions, for runtime packages and majors: the Release Notes section of the PR body, or the package's releases (`pnpm view <pkg> repository.url`). Peer requirements matter: a plugin major that needs a new major of its host (vite, eslint, react) is a migration, not an update.
- **Fit with the project:** a `@types/*` major should match the runtime's major (`@types/node` the Node in `.nvmrc`/CI/Dockerfile, `@types/react` the installed `react`).
- **Where the app uses it:** grep the package's imports in each app's `src/`, and compare with what the release notes change.
- **Overlaps:** PRs that change the same lines (two pin PRs on one override, any PR against a line this branch deletes) conflict once one merges. Prefer the one that fits; skip the other this week, as Renovate rebases it.
- **Manual checks:** concrete ones that cover those uses ("open the chat sidebar and send a message" for a change in `react-markdown`).

Overrides and findings: what changes (versions, major or not, the parent chain), the changelog for a major, where the app uses it, and the concrete manual checks ("open a Mermaid diagram with math in design-studio and check it renders").

### Recommend

| Recommendation | When | What you do once approved |
| --- | --- | --- |
| **Merge** | Checks green and nothing in the gathering argues against it (or only the sandbox-free CI is pending: say so) | `gh pr merge <n> --merge`, or `--squash` when merge commits aren't allowed (`gh repo view --json mergeCommitAllowed,squashMergeAllowed`) or the branch rules require linear history (`gh api repos/{owner}/{repo}/rules/branches/<base>`). Add its manual checks to the list. |
| **Fix first** | Checks fail, or the update needs code changes (common for majors), and it's worth doing now | On the `fix/deps-…` branch: apply the same version changes as the PR, `! pnpm install`, fix what breaks, verify (step 5). Renovate closes its PR once the default branch has those versions. |
| **Fix, minus the culprit** | A group PR where one package breaks and isn't worth fixing now | Apply the other bumps locally and leave that one; add a Renovate rule for the culprit if it should stop coming back (below). |
| **Close** | Not wanted, and it's a single-package PR | `gh pr close <n> --comment '<reason>'`. Renovate skips that version; for a major, the whole major until the next one. |
| **Hold with a Renovate rule** | Not wanted, and it's a group PR, or the version should stay capped (types matching the runtime, a plugin waiting for its host's major) | On the `fix/deps-…` branch, add a `packageRules` entry to `renovate.json`: `{ "matchPackageNames": ["@types/node"], "allowedVersions": "<25" }` to cap, or `{ "matchPackageNames": ["@vitejs/plugin-react"], "matchUpdateTypes": ["major"], "enabled": false }` to hold a major, with a `description` saying why and when to lift it. Renovate rewrites or closes the PR on its next run after the merge. Don't close the PR: it comes back. |
| **Skip this week** | Undecided, or blocked by another PR (a conflict that resolves after a rebase) | Nothing; it stays in next week's report. |
| **Fix now** (override, finding) | A fix exists and verification can prove it | Apply it, `! pnpm install`, re-run step 5, add its manual checks. |
| **Ignore** (override, finding) | Not exploitable here, or the fix is blocked | Write the ignore entry (below) with the reason from the table, `until` = today + 90 days unless the user says otherwise. |

Show one table, in this order: security PRs, blocked auto-merges, other Renovate PRs, then overrides and findings left from step 5.

```
| Item | Recommendation | Why | Manual checks |
| --- | --- | --- | --- |
| #114 @types/react 19, @types/node 26 (group) | Hold with a Renovate rule | App runs React 18 and Node 24; closing a group PR brings it back | none |
| #116 conventional-changelog v10 | Merge | Only breaking change is Node ≥ 22; CI and release run 24 | next release writes CHANGELOG.md |
```

Under it: the merge order (PRs touching the lockfile conflict after the first merge: merge one, re-check `gh pr view <n> --json mergeable` before the next, and list the ones left for Renovate's rebase), and anything you need from the user to decide (an ignore reason you can't infer).

Then act on the user's answer: the approved rows as recommended, the changed rows as the user said. A row the user changed with no clear decision: ask about that row only.

Never push to a Renovate branch: Renovate rewrites it on its next run.

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

Never add an entry the user did not approve, and never write a vague reason ("later", "low"): ask again. Renovate PRs have no ignore entry: closing a single-package PR, or a `renovate.json` rule, is how Renovate skips a version.

## 7. Commit and hand over

- Nothing changed locally (only merges, closes and skips): skip to the summary.
- Run `node .github/scripts/dependency-report.cjs --no-prs` one last time: what is left should be only the skipped items.
- Commit with the `git:commit` skill (title like `fix(deps): weekly dependency report <YYYY-MM-DD>`; body: one line per fixed item, ignored item and skipped item). If that skill is not installed, commit the touched files yourself with that message.
- Tell the user to run `/git:create-pr`, and give them the manual-check list to verify before merging (and to paste into the PR).
- Summary: PRs merged, closed (with reason), held by a Renovate rule, fixed locally, and skipped items (they come back in the next report). The manual checks for merged PRs apply to the default branch now. After the merge, the user can run the report workflow by hand (`gh workflow run dependency-report.yml`) to refresh the issue; it closes itself when nothing is left.

## Will not do

- Close the report issue (the next report run does it), or push to Renovate's branches.
- Merge or close a Renovate PR whose row the user didn't approve, or close a group PR (it comes back: use a Renovate rule). Merge the `fix/deps-…` PR.
- Ignore an item without the user's explicit choice, or with no reason and expiry date.
- Run `pnpm update` or refresh the whole lockfile: only the reported items change.
- Edit `dependency-report.cjs` or the workflow: those are copies of the renovate-runner template.
