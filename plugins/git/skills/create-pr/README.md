# create-pr

Creates or updates a pull request from your current work: one command from uncommitted changes to an open PR.

## What it does

- Calls the `commit` skill when there is uncommitted work or no feature branch yet.
- Targets `dev` when it exists, otherwise `main` (or the branch you name).
- Writes a semantic PR title and fills the project's PR template (or the bundled one) with a short, themed description in English. Empty sections are left out.
- Adds Jira links when you give ticket IDs and the Atlassian MCP is connected.
- When the PR changes the UI, adds 1–3 screenshots, from Storybook or the running app, hosted on a `pr-assets` branch.
- Asks before pushing the branch and posting the PR with `gh`.

## Use it

```
/create-pr
/create-pr tickets: PROJ-123, PROJ-456
```

## Requirements

- `git`, `gh` (authenticated with the `repo` scope) and `jq`.
- For screenshots: Playwright in the project, or Chrome/Chromium (`CHROME_BIN` if not on `PATH`).

## Files

- `SKILL.md` — the workflow.
- `templates/pull_request_template.md` — fallback PR template.
- `references/screenshots.md`, `references/sandbox.md` — the screenshot flow and what to do in a sandbox.
- `scripts/capture.sh` — URL to PNG, with Playwright or headless Chrome.
- `examples/checkout-flow.md` — a worked example of the change grouping.
