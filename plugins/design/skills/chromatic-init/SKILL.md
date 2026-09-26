---
name: chromatic-init
description: "Adds Chromatic visual testing to a Storybook project: installs the chromatic package, wires the CHROMATIC_PROJECT_TOKEN, adds a publish script, runs the baseline build, and sets up CI publishing - the publish/approval gate of the design loop. Used by design-init, or directly when the user wants to set up Chromatic, visual regression testing, or a Storybook review workflow. Use when the user asks to add Chromatic, set up visual regression, or publish Storybook for review."
disable-model-invocation: true
---

# Chromatic Init

Wires **Chromatic** — the team-facing visual regression / approval gate at the end of the design
loop (contract §1, step 4). Runs after Storybook exists (`storybook-init`). Usually invoked by
`design-init`.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) — Chromatic is
the PUBLISH stage; `design-loop` calls it once a component's render has converged and tests pass.

## Targets

Chromatic is set up **once per Storybook target** (contract §2): one Chromatic project, one
token, one publish script per target. A single-Storybook repo has one target at the root using
`CHROMATIC_PROJECT_TOKEN` — steps 1–7 as written. With several targets (a monorepo), run steps
1–7 once per target, inside the target's `dir`, and name each token env var after the target
(`CHROMATIC_PROJECT_TOKEN_<KEY>`). Separate projects keep each target's baselines and review
queue independent.

## Prerequisites

- **Storybook 6.5+** already installed and building (`storybook-init` first).
- **Node 18/20/21+**.
- A Chromatic account + **project token** — created at https://www.chromatic.com/start by linking
  a GitHub/GitLab/Bitbucket repo (or email). The token identifies the Chromatic project.
- `git` available (Chromatic associates commits with PRs/MRs).

## Workflow

1. **Detect what exists.** Check for the `chromatic` dev dependency, a `chromatic` script in
   `package.json`, and whether `CHROMATIC_PROJECT_TOKEN` is set. Only add what's missing.

2. **Install the package.**

   ```bash
   npm install --save-dev chromatic
   # or: yarn add --dev chromatic / pnpm add --save-dev chromatic
   ```

3. **Get + store the project token.** Prompt the user for their Chromatic project token — do
   **not** hard-code it. Recommend the `CHROMATIC_PROJECT_TOKEN` env var (local `.env` that is
   gitignored, and a CI secret). Never commit the token.

4. **Add the publish script.** Add to the target's `package.json` so the token is read from the
   env var:

   ```json
   { "scripts": { "chromatic": "chromatic" } }
   ```

5. **Run the baseline build.** Establish the first set of snapshots:

   ```bash
   npx chromatic --project-token <token>   # first run; thereafter: CHROMATIC_PROJECT_TOKEN + npm run chromatic
   ```

   Confirm the build succeeds and the Storybook is published; report the build URL.

6. **CI integration.** Set the token as a CI secret and run `npm run chromatic` in the pipeline
   (ensure `git` is available and history is fetched, as Chromatic needs it to associate commits
   with PRs/MRs). With several targets, add one job per target, working in its `dir`, and limit
   each to changes that affect it (the target and the workspace packages it consumes) when the CI
   supports path filters. If the repo already has a CI config, add a job/step; otherwise note it
   as a follow-up rather than inventing pipeline files.

7. **Report.**
   - `chromatic` package + script added; where the token is read from; baseline build URL.
   - Record `chromaticTokenEnv` on the target in `design.manifest.json#storybooks` (not needed for
     a single target using `CHROMATIC_PROJECT_TOKEN`).
   - Confirm this satisfies the PUBLISH precondition in contract §6.

## Notes

- Keep the token out of version control — env var / secret only.
- The first `chromatic` run has no baseline to diff against; it just establishes one. Diffs appear
  on subsequent runs — which is exactly the `design-loop` publish step.
