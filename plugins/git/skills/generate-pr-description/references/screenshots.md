# Screenshots for the PR description

Goal: 1–3 images giving a general overview of the change, not exhaustive coverage. Every failure here degrades to `- 🚫` in "Screen capture(s)"; it never blocks the PR.

## 1. Pick at most 3 targets, Storybook first

| Situation | Target |
|---|---|
| `.storybook/` exists and a changed component has a story (sibling `<Name>.stories.*`, or listed in Storybook's `index.json`) | The story: the default or primary variant, one shot per component. |
| Changed page or route with no story | The running app page. The route must be derivable from the diff (route files, page file path); otherwise ask the user for the URL path or skip. |
| Only shared or internal changes (hooks, utils, tokens) | Skip, unless they visibly change a story or page already picked. |

Show the planned shots (one line each) and ask: "Capture these screenshots? [Y/n]". Default **Y**. The user may drop or swap targets.

## 2. Capture

`scripts/capture.sh` uses the project's Playwright (`node_modules/.bin/playwright`) if present, else headless Chrome/Chromium from `PATH` or `$CHROME_BIN`. Never install either.

- Exit `2` (no tool): tell the user screenshots were skipped, and that Playwright in the project or Chrome on `PATH` enables them. Fall back to 🚫.
- Exit `3` (capture failed) or a server that will not start: read `sandbox.md` (this folder), apply it, report what is missing, fall back to 🚫.
- Start the dev server in the background with the project's script (`storybook`, or `dev`/`start`) and wait until it answers. Always stop it afterwards, even on failure.
- Storybook: read `http://localhost:<port>/index.json` (port as printed by the server), find the entry whose `importPath` matches the story file and use its `id`. URL: `http://localhost:<port>/iframe.html?id=<story-id>&viewMode=story`.
- One call per shot, PNGs in `$TMPDIR`, never in the project tree:
  ```bash
  bash <skill-dir>/scripts/capture.sh "<url>" "$TMPDIR/pr-shot-1.png"
  ```
- `Read` each PNG and drop it if blank, an error overlay or a login page. A story missing a decorator or provider counts as bad: say so, do not fix the story.
- After state only. Before/after pairs are out of scope.

## 3. Publish to the `pr-assets` branch

GitHub has no API to upload images into a PR body. Push them to a dedicated orphan branch that is never merged and embed links pinned to a commit SHA. Never commit the PNGs to the PR branch. One command per call:

1. `git fetch origin pr-assets` (a "couldn't find remote ref" error is expected on first use).
2. Worktree in `$TMPDIR`. Branch exists on the remote: `git worktree add "$TMPDIR/pr-assets" -B pr-assets origin/pr-assets`. Otherwise: `git worktree add --orphan -b pr-assets "$TMPDIR/pr-assets"` (git 2.42+; if older, tell the user and fall back to 🚫).
3. Copy the PNGs to `$TMPDIR/pr-assets/<branch-slug>/` (slug = current branch with `/` → `-`), named `1-<what>.png`, `2-<what>.png`. Overwrite same-named files.
4. `git -C "$TMPDIR/pr-assets" add .`, then `git -C "$TMPDIR/pr-assets" commit -m 'chore: add screenshots for <branch>'`.
5. `git push origin pr-assets` from the project root, never `git -C` before `push` (project guardrails).
6. `git rev-parse pr-assets` for the SHA; `gh repo view --json nameWithOwner --jq .nameWithOwner` for `{owner}/{repo}`.
7. `git worktree remove "$TMPDIR/pr-assets"` and delete the temp PNGs.

If the push is rejected for permissions, report it and fall back to 🚫; do not retry on another branch.

## 4. Fill "Screen capture(s)"

One entry per image: an English caption, then the SHA-pinned image link:

```markdown
- Order summary card, empty state
  ![Order summary card](https://github.com/{owner}/{repo}/blob/<sha>/<branch-slug>/1-order-summary.png?raw=true)
```

The `?raw=true` blob form renders in private repos for logged-in viewers; raw.githubusercontent.com URLs do not.
