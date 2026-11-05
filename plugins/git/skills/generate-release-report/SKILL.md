---
name: generate-release-report
description: "Generates a customer-facing release report PDF (what's new, screenshots, fixes) from the PRs in dev not yet in main. Use when the user asks for a release report, release notes PDF, or release announcement."
disable-model-invocation: true
---

# Generate Release Report

Builds a polished A4 PDF describing what the next release contains, from the PRs that are in `dev` but not yet in `main`, and the screenshots those PRs carry (see `generate-pr-description`). It is a customer announcement, not a changelog.

**Language:** French by default. Use English when the user asks for it (e.g. "in English", "en anglais").

**Assumption:** a release is always `dev` → `main`, by PR merge or fast-forward. Other branch names are out of scope; say so and stop.

## Workflow

1. **Find what is unreleased** (one command per call; the first needs the network)
   - `git fetch origin main dev`
   - `git log --format='%H%x09%s' origin/main..origin/dev`
   - Empty: tell the user there is nothing to release and stop.

2. **Map commits to PRs**
   - Take `#<n>` from subjects: `Merge pull request #12 …` (merge commits) and `… (#12)` (squash). Collect unique numbers.
   - For each commit with no number (rebase merge or fast-forward), run `gh api repos/{owner}/{repo}/commits/<sha>/pulls --jq '.[].number'`. Do this for at most 30 commits; beyond that, ask the user to narrow the range.
   - Commits that still map to no PR are direct pushes: use their subject as a one-line source, nothing more.

3. **Load each PR** (parallel calls): `gh pr view <n> --json number,title,body,url,labels`. Use only this data and the screenshots. Never read code to enrich it.

4. **Settings**
   - **Product name:** the repo name from `gh repo view --json name --jq .name` unless the user gave one.
   - **Version:** from the request. If absent, ask once ("Release version, e.g. `1.5.0`? Leave empty for date only.").
   - **Date:** today.

5. **Write the content**: read `references/writing.md` and follow it (which PRs become features or fixes, sections, tone, labels, what never to include). Then show a plan and ask "Generate the PDF? [Y/n]" (default **Y**):
   - title line (product, version, language)
   - sections, each with its features (titles only), the count of fixes, and the screenshots planned
   - PRs omitted as internal, as a count

6. **Fetch the screenshots** (skip if no PR body has any)
   - A PR screenshot links `https://github.com/{owner}/{repo}/blob/<sha>/<path>?raw=true`. Parse `<sha>` and `<path>`.
   - `git fetch origin pr-assets`, then for each image: `mkdir -p "$TMPDIR/release-report"` and `git show <sha>:<path> > "$TMPDIR/release-report/<n>-<name>.png"`. Reading blobs from git avoids the auth problems of downloading private-repo URLs.
   - Images hosted elsewhere (GitHub `user-attachments`, other sites) cannot be fetched reliably: skip them and tell the user how many.
   - Check each file is a non-empty PNG; drop bad ones.

7. **Write the HTML.** Copy `assets/template.html` to `$TMPDIR/release-report/report.html` with `Write`, filling every `{{TOKEN}}` and expanding or omitting the marked `REPEAT`/`OMIT` blocks. `src` values are bare file names of the PNGs beside it. Remove all HTML comments you used and leave no `{{…}}` behind. Use only `Write`/`Edit`; never `sed` or `perl`.

8. **Render the PDF**: `bash <skill-dir>/scripts/render-pdf.sh "$TMPDIR/release-report/report.html" release-report-<version-or-date>.pdf` (output at the project root).
   - Exit `2`: no Chrome or Playwright. Tell the user to put Chrome on `PATH` or set `CHROME_BIN`, give the HTML path, and stop.
   - Exit `3`: read `references/sandbox.md`, apply it, report what is missing.
   - Never install anything yourself.

9. **Check the result.** `Read` the PDF (`pages: "1-3"`) and verify: text is in the right language, images show, no `{{…}}` or comment text, no empty section, nothing cut off. Fix the HTML and re-render once if something is wrong.

10. **Clean up and report.** `rm -rf "$TMPDIR/release-report"`. Give the PDF's path, page count, and what was skipped (internal PRs, unreachable images). Do not commit or attach the PDF; suggest adding `release-report-*.pdf` to `.gitignore` if it is not.

## Will not do

- Publish, email or upload the report.
- Create tags or GitHub releases, or merge `dev` into `main`.
- Include PR numbers, authors or ticket keys (customer-facing only).
