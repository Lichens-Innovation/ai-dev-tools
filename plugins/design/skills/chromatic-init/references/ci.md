# Chromatic in CI

Read only when the user chose CI publishing in step 6. Without it, the design loop still
publishes manually (`design-loop` step 9) — CI publishing only adds a build per push.

## Before editing the pipeline

- **Quota.** Every CI publish costs snapshots: stories × browsers × viewports, per target, per
  push. Tell the user the per-build count (stories today × configured browsers/modes) so the
  choice is informed. On a small plan, prefer triggers that fire less (push to `main` only) over
  every PR push.
- **Existing CI only.** Add a step or job to the repo's existing pipeline. With no CI config,
  report it as a follow-up — don't invent pipeline files.
- **Secrets.** One CI secret per target, named as its `chromaticTokenEnv`
  (`CHROMATIC_PROJECT_TOKEN` for a single target). The user adds them; never write a token into
  the pipeline file.

## What the publish step needs

1. **Full git history** — Chromatic walks it to find the baseline build for the commit. On
   GitHub Actions: `actions/checkout` with `fetch-depth: 0`.
2. **Reuse an existing Storybook build.** If a job already runs `build-storybook`, publish that
   output with `chromatic --storybook-build-dir <dir>/storybook-static` instead of rebuilding.
   Otherwise let `chromatic` build it (`--build-script-name build-storybook`).
3. **Don't fail on visual changes** — `--exit-zero-on-changes`. Changes are accepted or rejected
   in Chromatic's own UI Tests check; failing CI on them would block every intentional change.
   Real errors (build failure, bad token) still fail the step.
4. **Skip, don't fail, without a token** — fork PRs and the window before the secret exists have
   none. Secrets can't be read in an `if:`, so probe once into a step output.
5. **Map the token.** The CLI reads only `CHROMATIC_PROJECT_TOKEN`; set it from the target's
   secret in the step's `env`.

## GitHub Actions shape (one target)

Add to the job that builds (or can build) the target's Storybook:

```yaml
- name: Checkout
  uses: actions/checkout@v6
  with:
    fetch-depth: 0

# ... install, build-storybook ...

- name: Check Chromatic token
  id: chromatic-token
  env:
    TOKEN: ${{ secrets.CHROMATIC_PROJECT_TOKEN_WEB }}
  run: echo "present=$([ -n "$TOKEN" ] && echo true || echo false)" >> "$GITHUB_OUTPUT"

- name: Publish Storybook to Chromatic
  if: steps.chromatic-token.outputs.present == 'true'
  env:
    CHROMATIC_PROJECT_TOKEN: ${{ secrets.CHROMATIC_PROJECT_TOKEN_WEB }}
  working-directory: apps/frontend
  run: npx chromatic --storybook-build-dir storybook-static --exit-zero-on-changes
```

In a pnpm workspace, `pnpm --filter <pkg> exec chromatic ...` replaces `working-directory` +
`npx`.

## Several targets

- One publish per target, each in its `dir` with its own secret — separate Chromatic projects
  keep baselines and review queues apart.
- Put each publish in the job that already builds that target when there is one. Add a new job
  only for a target no job builds yet, gated by a path filter covering the target **and** the
  workspace packages it consumes (`packages/**`, the lockfile, the CI files themselves).
- If the pipeline has an aggregate "all green" job, add any new job to its `needs`.

## Report

Which jobs publish, which secrets the user must add, the trigger, and the estimated snapshots
per build. Suggest making Chromatic's **UI Tests** check required on the default branch if the
team wants visual approval to gate merges.
