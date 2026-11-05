# Screenshots for the PR description

Goal: 1–3 images giving a general overview of the change, not exhaustive coverage. Every failure here removes the "Screen capture(s)" section; it never blocks the PR.

## 0. Locate the frontend package (monorepos)

Do not look for `.storybook/` or `dev`/`storybook` scripts at the repo root only. Take the directory of each changed frontend file and walk up to the nearest `package.json`: that is the package to work in. Look for `.storybook/` and the scripts there (it is often `apps/<name>/` or `packages/<name>/`). Run its scripts from the root with the workspace tool (`pnpm --filter <name> run storybook`, `npm -w <dir> run ...`, `yarn workspace <name> ...`), never with `cd`. Root scripts that only call `turbo`/`nx` are not the dev server. If several packages changed, pick targets across them, still at most 3 shots. Read the port from the server output or the script (`-p 6006`), not from a default.

## 1. Pick at most 3 targets

Storybook is a shortcut, not a requirement. No Storybook in the project is the normal case, and it means "use the running app", never "skip". Do not drop the section until you have tried the app page and either it failed or the user declined.

| Situation | Target |
|---|---|
| `.storybook/` exists and a changed component has a story (sibling `<Name>.stories.*`, or listed in Storybook's `index.json`) | The story: the default or primary variant, one shot per component. |
| No Storybook, or the changed component has no story | The page that shows the change in the running app (see "Finding the page" below). |
| Only shared or internal changes (hooks, utils, tokens) | The page or story that visibly uses them, if one is obvious. Otherwise skip, and say so in one line. |

Never skip silently: whenever you give up on a target, tell the user why in one line.

Show the planned shots (one line each, with the URL) and ask: "Capture these screenshots? [Y/n]". Default **Y**. The user may drop or swap targets.

### Finding the page

1. **Start the app** with the project's script (`dev`, `start`, `serve`: read `package.json` scripts, or the README) in the background, and read the URL it prints. Do not assume a port.
2. **Find the route** from the diff: file-based routers (`pages/`, `app/`, `routes/`, `src/views/`) give it from the path; otherwise search the router config for the changed component and follow its imports upward to the page that renders it.
3. **Ask when unsure.** Route not derivable, route needs an id (`/orders/:id`), or needs data you do not have: ask the user for the URL path to capture. One question, then proceed.
4. **Login wall.** If the shot comes back as a login page, do not give up at once: ask whether a dev login, a seeded user, or an auth bypass exists, and use what the user gives. Never type credentials you were not given, never read `.env*`. If nothing works, drop the section and say it was blocked by authentication.

## 2. Capture

`scripts/capture.sh` uses the project's Playwright (`node_modules/.bin/playwright`) if present, else headless Chrome/Chromium from `PATH` or `$CHROME_BIN`. Never install either.

- Exit `2` (no tool): tell the user screenshots were skipped, and that Playwright in the project or Chrome on `PATH` enables them. Drop the section.
- Exit `3` (capture failed) or a server that will not start: read `sandbox.md` (this folder), apply it, report what is missing, drop the section.
- **A server that is not running is the normal case, never a reason to skip.** Check whether the port answers; if not, start it yourself in the background with the project's script (`storybook`, or `dev`/`start`) and wait until it answers. Do not ask the user to open it. Stop only the servers you started, afterwards, even on failure.
- If Storybook will not start (missing dependencies, build error), fall back to the app page for the same component before giving up, and tell the user why.
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
2. Worktree in `$TMPDIR`. Branch exists on the remote: `git worktree add "$TMPDIR/pr-assets" -B pr-assets origin/pr-assets`. Otherwise: `git worktree add --orphan -b pr-assets "$TMPDIR/pr-assets"` (git 2.42+; if older, tell the user and drop the section).
3. Copy the PNGs to `$TMPDIR/pr-assets/<branch-slug>/` (slug = current branch with `/` → `-`), named `1-<what>.png`, `2-<what>.png`. Overwrite same-named files.
4. `git -C "$TMPDIR/pr-assets" add .`, then `git -C "$TMPDIR/pr-assets" commit -m 'chore: add screenshots for <branch>'`.
5. `git push origin pr-assets` from the project root, never `git -C` before `push` (project guardrails).
6. `git rev-parse pr-assets` for the SHA; `gh repo view --json nameWithOwner --jq .nameWithOwner` for `{owner}/{repo}`.
7. `git worktree remove "$TMPDIR/pr-assets"` and delete the temp PNGs.

If the push is rejected for permissions, report it and drop the section; do not retry on another branch.

## 4. Fill "Screen capture(s)"

One entry per image: an English caption, then the SHA-pinned image link:

```markdown
- Order summary card, empty state
  ![Order summary card](https://github.com/{owner}/{repo}/blob/<sha>/<branch-slug>/1-order-summary.png?raw=true)
```

The `?raw=true` blob form renders in private repos for logged-in viewers; raw.githubusercontent.com URLs do not.
