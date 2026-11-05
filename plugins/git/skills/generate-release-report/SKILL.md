---
name: generate-release-report
description: "Generates a customer-facing release report PDF (what's new, screenshots, fixes) from the PRs in dev not yet in main. Use when the user asks for a release report, release notes PDF, or release announcement."
disable-model-invocation: true
---

# Generate Release Report

Builds an A4 PDF of what the next release contains, from the PRs in `dev` but not yet in `main` and the screenshots they carry (see `generate-pr-description`). A customer announcement, not a changelog. A release is always `dev` → `main` (merge or fast-forward); other branches are out of scope, say so and stop.

**Language:** French by default, English when the user asks ("in English", "en anglais").

## Workflow

One command per call; `git fetch`, `git push` and `gh` need the network, so keep them alone in their call.

1. **Unreleased commits:** `git fetch origin main dev`, then `git log --format='%H%x09%s' origin/main..origin/dev`. Empty: nothing to release, stop.

2. **Map commits to PRs.** Take `#<n>` from subjects (`Merge pull request #12`, squash `… (#12)`). For commits without one (rebase merge, fast-forward): `gh api repos/{owner}/{repo}/commits/<sha>/pulls --jq '.[].number'`, at most 30 commits, beyond that ask the user to narrow the range. Still unmapped = direct push: use the subject only.

3. **Load each PR** (parallel): `gh pr view <n> --json number,title,body,url,labels`. Use only this and the screenshots; never read code.

4. **Ask once, in one message, for what the request lacks:** the product name as customers know it (often not the repo name; suggest `gh repo view --json name --jq .name` as default) and the version (empty = date only). Date is today.

5. **Write the content** following `references/writing.md`, then show a plan (title line with product, version, language; each section with feature titles, fix count and planned screenshots; count of internal PRs omitted) and ask "Generate the PDF? [Y/n]" (default **Y**).

6. **Fetch screenshots** (skip if no PR body has any). A PR screenshot links `https://github.com/{owner}/{repo}/blob/<sha>/<path>?raw=true`. Run `git fetch origin pr-assets`, `mkdir -p "$TMPDIR/release-report"`, then per image `git show <sha>:<path> > "$TMPDIR/release-report/<n>-<name>.png"` (reading from git avoids private-repo download auth). Skip images hosted elsewhere (`user-attachments`, other sites) and tell the user how many. Drop empty files.

7. **Build the HTML.** `cp <skill-dir>/assets/report.css "$TMPDIR/release-report/"`, then `Write` `$TMPDIR/release-report/report.html` from `assets/template.html`: fill every `{{TOKEN}}`, expand or omit the `REPEAT`/`OMIT` blocks, use bare PNG file names as `src`, strip the comments, leave no `{{…}}`. Never `sed` or `perl`.

8. **Render:** `bash <skill-dir>/scripts/render-pdf.sh "$TMPDIR/release-report/report.html" release-report-<version-or-date>.pdf` (written at the project root).
   - Exit `2`: no Chrome or Playwright. Tell the user to put Chrome on `PATH` or set `CHROME_BIN`, give the HTML path, stop.
   - Exit `3`: read `references/sandbox.md`, apply it, report what is missing.
   - Never install anything.

9. **Check:** `Read` the PDF (`pages: "1-3"`). Right language, images show, no `{{…}}` or comment text, no empty section, nothing cut off. If not, fix the HTML and re-render once.

10. **Clean up:** `rm -rf "$TMPDIR/release-report"`. Report the PDF path, page count and what was skipped (internal PRs, unreachable images). Do not commit it; suggest `release-report-*.pdf` in `.gitignore`.

Out of scope: publishing or emailing the report, tags, GitHub releases, merging `dev`, and anything customer-facing that names PRs, authors or ticket keys.
