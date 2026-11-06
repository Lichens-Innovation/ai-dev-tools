# generate-release-report

Generates a customer-facing release report as an A4 PDF from the PRs that are in `dev` but not yet in `main`, with the screenshots those PRs carry.

## What it does

- Finds the unreleased PRs (merge, squash, rebase or fast-forward) and reads their titles and bodies.
- Rewrites them as an announcement: an intro, then per product a "What's new" list where each feature carries the screenshot from its own PR, and an "Improvements & fixes" list. Internal PRs (chores, CI, tests, refactors) are left out.
- Renders the PDF with headless Chrome or Chromium, or the project's Playwright.

French by default; ask for English to get an English report.

## Use it

```
/generate-release-report version 1.5.0
/generate-release-report version 1.5.0 in English
/generate-release-report attach 1.5.0
```

The PDF is written at the project root for you to send. With a version, the skill also offers to attach it to the matching GitHub release (after you confirm, and warning if the repo is public). If the release is not published yet, run `attach` once it is.

Screenshots come from the "Screen capture(s)" section written by `create-pr`.

## Requirements

- `gh` authenticated, and `git` access to `origin`.
- Chrome or Chromium on `PATH` (or `CHROME_BIN`), or Playwright installed in the project.

## Files

- `SKILL.md` — the workflow.
- `references/writing.md` — how PRs become features and fixes, tone, labels.
- `references/sandbox.md` — fixing PDF rendering inside a sandbox.
- `assets/template.html` — the report structure, filled in per run.
- `assets/report.css` — the report styling; change `--accent` to rebrand.
- `scripts/render-pdf.sh` — HTML to PDF.
