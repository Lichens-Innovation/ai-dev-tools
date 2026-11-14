---
name: setup-dependency-automation
description: "Audits a pnpm repo and opts it in to the Lichens dependency automation: Claude CVE gate, weekly dependency report and automerge-routine. Use when the user runs /setup-dependency-automation, asks to make a repo handle Renovate PRs like ai-dev-tools, or fix-cve finds a repo that isn't set up."
argument-hint: "[repo path]"
---

# Setup Dependency Automation

Takes one pnpm repo of the Lichens-Innovation org to the setup ai-dev-tools runs:
- Renovate security PRs reviewed by the **Claude CVE gate** and merged when it approves;
- pin and non-major devDependency PRs merged by Renovate once CI is green (**`automerge-routine`**);
- everything else listed in the **Weekly dependency report** issue, which `/fix-cve` works through.

It audits first, then makes two PRs in a fixed order. **Workflows first, presets second, after the first PR is merged:** a `claude-cve-gate` preset without the gate workflow on the default branch lets security PRs merge on CI alone.

The docs it follows are in Lichens-Innovation/renovate-runner: `docs/claude-cve-gate.md`, `docs/automerge-routine.md` and `docs/dependency-report.md`. Read them from the clone made in step 1 when something here is unclear.

One command per call, never `cd`. The target repo is the argument's path, or else the current directory: use `git -C <repo>` and paths under it. In commands, `O/R` is the target's `owner/name` and `<default>` its default branch.

## 1. Who and where

- `gh repo view <O/R> --json nameWithOwner,visibility,viewerPermission,defaultBranchRef`.
  - **Owner:** must be `Lichens-Innovation`. Otherwise, say this setup is for the org's repos, and stop.
  - **Permission:** `viewerPermission` must be `ADMIN`, which the secret and the rulesets check need. Otherwise, stop: the setup is for the repo's admins to decide.
  - **Repo owner:** these settings change how the repo merges. If others commit to the repo (`git -C <repo> shortlog -sn --since=3.months origin/<default>`), ask the user to confirm the repo is theirs to opt in before writing anything.
- Shallow-clone the two sources into the sandbox temp dir (the real `/tmp/claude-<uid>/` path, since `gh` runs outside the sandbox). If a clone is already there, delete it with `rm -rf` first:
  - `gh repo clone Lichens-Innovation/renovate-runner /tmp/claude-<uid>/src/renovate-runner -- --depth 1`
  - `gh repo clone Lichens-Innovation/ai-dev-tools /tmp/claude-<uid>/src/ai-dev-tools -- --depth 1`
  - Don't copy from the user's own clones next to the repo: they may be behind `main`.

## 2. Audit

Check each row and show the table (item, state, what the skill will do) before writing anything.

| Item | How to check | Present when |
| --- | --- | --- |
| pnpm | `pnpm-lock.yaml` at the root | Committed. Without it, stop: everything here assumes pnpm. |
| PR CI | `.github/workflows/*.yml` with `on: pull_request` (its `branches` includes `<default>`, or no filter) | It installs with `--frozen-lockfile`, then runs lint, a typecheck (a `build` running `tsc` counts), build and tests. Read the scripts it calls in `package.json`/`turbo.json` to confirm. |
| No required approval | `gh api repos/<O/R>/rules/branches/<default>` (all active rulesets, the org's too) and `gh api repos/<O/R>/branches/<default>/protection` (404 = none) | No `pull_request` rule or protection with `required_approving_review_count` > 0. Required status checks are fine. Note `required_linear_history`: merge commits are refused, so PRs merge with squash or rebase (Renovate picks an allowed method itself). |
| Secret | `gh secret list --repo <O/R>` | `CLAUDE_CODE_OAUTH_TOKEN` is listed |
| Gate workflow | `.github/workflows/claude-cve-gate.yml` | Exists. It is up to date when it matches the ai-dev-tools copy apart from the header comment, `REVIEWER` and `node-version`. |
| Report | `.github/workflows/dependency-report.yml` and `.github/scripts/dependency-report.cjs` | Both exist. They are up to date when they match `templates/dependency-report/` apart from the header comment, `REVIEWER` and the action versions. |
| Presets | `renovate.json` (or `.github/renovate.json`) `extends` | `local>Lichens-Innovation/renovate-runner:claude-cve-gate` and `:automerge-routine` |
| Node major | `.nvmrc`, `engines.node`, `FROM node:<n>` in Dockerfiles, `node-version` in the CI workflow | One major. If they disagree, ask the user which one production runs (the Dockerfile usually wins). |
| `@types/node` cap | A `packageRules` entry for `@types/node` with `allowedVersions: "<N+1>"` in `renovate.json` | Present, or `@types/node` isn't a dependency (`grep -rl '"@types/node"' --include=package.json <repo>`, leaving out `node_modules`) |

Comparing copies: `diff <source> <repo copy>`, then judge the hunks. A hunk outside the expected lines makes the copy **outdated**: say what differs, and refresh the copy in the workflows PR, keeping the repo's `REVIEWER` and Node major.

What blocks what:
- **No PR CI that tests, or a required approval:** no `automerge-routine`.
  - Missing CI: offer to write one, modeled on ai-dev-tools' `.github/workflows/ci.yml` and using the repo's own scripts, as part of the workflows PR.
  - A required approval: say it blocks every Renovate merge, and leave the ruleset to the user.
- **No secret:** the gate fails on every security PR. The user adds it before the presets PR (step 4).
- **Everything present and up to date:** say so and stop.

## 3. PR 1: workflows

Make a branch from an up-to-date `<default>`: ask the user to run `! git -C <repo> pull` if `git -C <repo> status -sb` shows the branch behind. Then `git -C <repo> switch -c chore/dependency-automation` (never `-t`). If the working tree has changes, ask the user to commit or stash first.

1. **Gate workflow.** Copy `/tmp/claude-<uid>/src/ai-dev-tools/.github/workflows/claude-cve-gate.yml` (a standalone copy; renovate-runner's original is a reusable `workflow_call` workflow) to `<repo>/.github/workflows/claude-cve-gate.yml`, then edit:
   - **Header comment:** "Copy of Lichens-Innovation/renovate-runner/.github/workflows/claude-cve-gate.yml (docs: docs/claude-cve-gate.md in that repo). Keep it in step with the original; `/setup-dependency-automation` flags drift." Drop the line about the repo being public.
   - **`REVIEWER`:** the user's GitHub login (`gh api user --jq .login`).
   - **Node:** `node-version-file: .nvmrc` in place of `node-version` when the repo has an `.nvmrc`, so the gate follows a later Node bump; else `node-version:` the repo's Node major from the audit.
   - Don't call the reusable workflow, even from a private repo. That only works if renovate-runner's Actions access setting allows it, and only its admins can check that setting.
2. **Report.** Copy `templates/dependency-report/dependency-report.yml` to `.github/workflows/` and `dependency-report.cjs` to `.github/scripts/`, from the renovate-runner clone. Set `REVIEWER` to the same login, and the actions to the versions the repo's CI uses (or newer).
3. **`@types/node` cap,** if the audit says it is missing. Add it to `renovate.json` `packageRules`; this rule is safe before the gate:

   ```json
   {
     "description": "Keep @types/node on the Node major we run (node:22 in the Dockerfiles).",
     "matchPackageNames": ["@types/node"],
     "allowedVersions": "<23"
   }
   ```

   A cap below what the lockfile already has makes Renovate propose a downgrade. Check with `pnpm why -r @types/node` and tell the user if it does.
4. **CI,** only if the user accepted writing one in step 2.

Commit and open the PR with the `git:commit` and `git:create-pr` skills (title like `chore: opt in to the Claude CVE gate and the weekly dependency report`). If they aren't installed, commit with `git -C <repo> commit -m '…'` and give the user `! git -C <repo> push -u origin HEAD` and the `gh pr create` command. The PR body says that the presets PR follows once this one is merged.

## 4. Before the presets PR

- **Secret,** if missing. The user runs `! claude setup-token`, then `! gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <O/R>` and pastes the token. Never ask for the token in the chat, and never set it yourself.
- **Workflows PR merged:** check with `gh api repos/<O/R>/contents/.github/workflows/claude-cve-gate.yml?ref=<default> --jq .sha`. If it is not merged yet, stop here and tell the user to run `/setup-dependency-automation` again after the merge: the audit picks up from this step.
- **First report:** `gh workflow run dependency-report.yml --repo <O/R>`. It opens the report issue if anything needs fixing.

## 5. PR 2: presets

On a new branch from the updated `<default>` (`chore/renovate-presets`), add to `extends` in `renovate.json`, after the base preset:

```json
"local>Lichens-Innovation/renovate-runner:claude-cve-gate",
"local>Lichens-Innovation/renovate-runner:automerge-routine"
```

- Leave out `automerge-routine` when step 2 found no PR CI that tests, or a required approval. Say why.
- Keep the repo's other `extends` and `packageRules` as they are.

Commit and open the PR as in step 3, with a short body: what each preset changes (from the docs), and that Renovate applies them on its next weekly run (Tuesday 03:00 UTC).

## 6. Report

- PRs opened, with their URLs and the order to merge them.
- What the user still has to do: the secret, merging, maybe a required-approval rule to lift.
- Anything skipped, and why: no CI, no permission, a Node major the user hasn't chosen yet.
- From now on: auto-merge PRs merge themselves once CI passes; the rest arrives in the Thursday report issue, for `/fix-cve`.

## Will not do

- Set or read secrets, or change rulesets, branch protection or Actions settings.
- Merge its own PRs, or push to anyone else's branch.
- Touch a repo outside Lichens-Innovation, one where the user isn't admin, or another member's repo without the user's confirmation.
- Extend the presets before the gate workflow is on the default branch.
- Edit renovate-runner, or the org-wide `default.json`: the setup is opt-in, per repo.
