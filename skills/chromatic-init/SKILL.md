---
name: chromatic-init
description: "Adds Chromatic visual testing to a Storybook project. Used by design-init, or directly when the user wants to set up Chromatic, visual regression testing, or a Storybook review workflow."
---

# Chromatic Init

Wires **Chromatic**, the visual regression / approval gate at the end of the design loop. Runs
after `storybook-init`; usually invoked by `design-init`.

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md): Chromatic is
the PUBLISH stage, which `design-loop` calls once a component's render has converged and tests pass.

Set up **once per Storybook target** (contract §2): one Chromatic project, token and publish
script each, so baselines and review queues stay independent. A single-Storybook repo uses
`CHROMATIC_PROJECT_TOKEN`. With several targets, run steps 1–7 per target inside its `dir`, with
the token env var named `CHROMATIC_PROJECT_TOKEN_<KEY>`.

Prerequisites: Storybook 6.5+ installed and building; Node 18+; `git`; a Chromatic account and
**project token** (https://www.chromatic.com/start, linking a GitHub/GitLab/Bitbucket repo).

## Workflow

1. **Detect what exists.** Check for the `chromatic` dev dependency, a `chromatic` script in
   `package.json`, and whether `CHROMATIC_PROJECT_TOKEN` is set. Only add what's missing.

2. **Install the package.**

   ```bash
   npm install --save-dev chromatic
   # or: yarn add --dev chromatic / pnpm add --save-dev chromatic
   ```

3. **Get + store the project token.** Prompt the user for their Chromatic project token — do
   **not** hard-code it, and ask the user to put it in the gitignored `.env` themselves rather than
   paste it into the conversation. Never commit the token. The CLI reads only
   `CHROMATIC_PROJECT_TOKEN`, so with per-target names (`CHROMATIC_PROJECT_TOKEN_<KEY>`) add a
   wrapper — a task-runner recipe or root script — that maps the target's variable onto it.

4. **Add the publish script.** Add to the target's `package.json` so the token is read from the
   env var:

   ```json
   { "scripts": { "chromatic": "chromatic" } }
   ```

5. **Run the baseline build.** Establish the first set of snapshots:

   ```bash
   npx chromatic --project-token <token>   # first run; thereafter: CHROMATIC_PROJECT_TOKEN + npm run chromatic
   ```

   Confirm the build succeeds and report the build URL. Chromatic's setup page only waits for a
   first build, however it arrives. In a monorepo, run it in the target's `dir` or through the
   repo's wrapper, not at the root (no Storybook there). Prefer the env var over typing the token
   on the command line (shell history).

6. **Ask about CI publishing.** Publishing is already covered without CI: `design-loop` publishes
   each target manually once a component converges. CI publishing adds a build — and its
   snapshots — on every triggering push, which can exhaust a free or small Chromatic plan. Ask
   the user whether to publish from CI, stating that trade-off.
   - **Yes** → read [`references/ci.md`](references/ci.md) and follow it.
   - **No** → leave the pipeline alone (building Storybook in CI without publishing is still a
     free breakage check, but that's `storybook-init`'s concern).

7. **Report.**
   - `chromatic` package + script added; where the token is read from; baseline build URL.
   - The CI decision, and for "yes", what `references/ci.md` asks to report.
   - Record `chromaticTokenEnv` on the target in `design.manifest.json#storybooks` (not needed for
     a single target using `CHROMATIC_PROJECT_TOKEN`).
   - Confirm this satisfies the PUBLISH precondition in contract §6.

## Notes

- A wrapper that reads the token from `.env` should tolerate `export `, spaces around `=`, quotes
  and CRLF — a strict `^NAME=` match reports "not set" on a correctly filled file.
- The first run only establishes a baseline; diffs appear on later runs (the `design-loop` publish step).
