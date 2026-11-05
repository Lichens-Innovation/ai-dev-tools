# generate-release-report

Generates a customer-facing release report as an A4 PDF from the PRs that are in `dev` but not yet in `main`, with the screenshots those PRs carry.

## What it does

- Finds the unreleased PRs (merge, squash, rebase or fast-forward) and reads their titles and bodies.
- Rewrites them as an announcement: an intro, then per product a "What's new" list, a screenshot preview (max 3 per section) and an "Improvements & fixes" list. Internal PRs (chores, CI, tests, refactors) are left out.
- Renders the PDF with headless Chrome or Chromium, or the project's Playwright.

French by default; ask for English to get an English report.

## Use it

```
/generate-release-report version 1.5.0
/generate-release-report version 1.5.0 in English
```

Screenshots come from the "Screen capture(s)" section written by `generate-pr-description`.

## Requirements

- `gh` authenticated, and `git` access to `origin`.
- Chrome or Chromium on `PATH` (or `CHROME_BIN`), or Playwright installed in the project.

## Files

- `SKILL.md` — the workflow.
- `references/writing.md` — how PRs become features and fixes, tone, labels.
- `references/sandbox.md` — fixing PDF rendering inside a sandbox.
- `assets/template.html` — the report layout; change `--accent` to rebrand.
- `scripts/render-pdf.sh` — HTML to PDF.
