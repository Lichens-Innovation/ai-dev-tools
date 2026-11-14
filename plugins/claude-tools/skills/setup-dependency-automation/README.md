# setup-dependency-automation

Opts a pnpm repo of the Lichens-Innovation org in to the dependency automation that ai-dev-tools runs. Run with `/setup-dependency-automation` in the repo, or with the repo's path.

| Piece | What it does | Docs (Lichens-Innovation/renovate-runner) |
| --- | --- | --- |
| Claude CVE gate | Claude reviews each Renovate security PR; Renovate merges it once Claude approves and CI passes | `docs/claude-cve-gate.md` |
| `automerge-routine` | Renovate merges pin PRs and non-major devDependency updates once CI passes | `docs/automerge-routine.md` |
| Weekly dependency report | One issue listing what needs you, worked through with `/fix-cve` | `docs/dependency-report.md` |

It audits the repo first (pnpm lockfile, PR CI that lints, typechecks, builds and tests, no required approval, the secret, the copied files and whether they drifted from their source, the presets, the Node major) and shows a table. Then:

1. **Workflows PR:** the gate workflow, the report workflow and script, and a `@types/node` cap matching the Node major the repo runs.
2. **You:** add the `CLAUDE_CODE_OAUTH_TOKEN` secret (`claude setup-token`, then `gh secret set`) and merge the PR.
3. **Presets PR** (run the skill again after the merge): `claude-cve-gate` and `automerge-routine` in `renovate.json`.

## Files

| File | Role |
| --- | --- |
| `SKILL.md` | Audit table, the two PRs and their order |

## Writes, in the repo

- `.github/workflows/claude-cve-gate.yml`, `.github/workflows/dependency-report.yml`, `.github/scripts/dependency-report.cjs`: copies, with your login as `REVIEWER`.
- `renovate.json`: the `@types/node` cap, then the two presets.
- `.github/workflows/ci.yml`, only if the repo has no PR CI and you accept one.

On GitHub: opens the two PRs and runs the report workflow once. It never sets secrets, never changes rulesets and never merges.

## Design choices

- **Workflows before presets.** The `claude-cve-gate` preset turns on automerge for security PRs; without the gate's check on the default branch, they would merge on CI alone.
- **Copies, not the reusable workflow.** renovate-runner is private, and calling its workflow depends on an Actions setting only its admins can check. The copy is compared with its source on every run.
- **No auto-merge without tests.** `automerge-routine` is left out when no PR check tests the code, or a rule requires an approval.
- **Your repos only.** Admin permission is required, and a repo others commit to needs your confirmation first.

## Known limits

- pnpm repos in Lichens-Innovation only.
- Re-running is how it continues after the workflows PR merges.
