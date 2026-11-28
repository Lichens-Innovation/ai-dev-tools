---
name: create-pr
description: "Creates or updates a pull request: commits pending work (via the commit skill), generates a semantic PR title and a description from the branch diff using the project's PR template, adds UI screenshots, pushes, and posts the PR with gh. Use when the user asks to create a PR, open a pull request, generate or update a PR description, or prepare a merge request. The user may include ticket IDs in the request (e.g. tickets: NN-123, TB-456) from the company tracking system; treat those as the related issue IDs for the PR. Takes an optional base branch to merge into (e.g. base: dev, or \"into main\"); when invoking it, pass the base and tickets as arguments."
argument-hint: "[base: <branch>] [tickets: <ID>, ...]"
---

# Create PR

Create or update a pull request: commit pending work, analyze the git changes, fill the project's PR template with a concise description, then push and post it.

**Language:** Always generate PR titles and descriptions in **English**, regardless of the user's language or the language of commit messages.

## Arguments

Arguments: `$ARGUMENTS`

Read them together with the user's request; both are optional and may come in any order:

- **Base branch:** `base: <branch>`, `--base <branch>`, `into <branch>`, `against <branch>`, or a bare branch name (e.g. `dev`, `release/1.4`). Strip a leading `origin/`. This is the parent branch of step 1.
- **Tickets:** `tickets: NN-123, TB-456` or bare keys matching `[A-Z][A-Z0-9]+-\d+`. These are the ticket IDs of step 7.

## Workflow

1. **Identify the parent branch and make sure there is something to PR**
   - Current branch: `git branch --show-current`. Changes (including untracked files, ignoring `pr-description.md`): `git status --short`.
   - **Parent branch:** the base branch from the arguments or the request, if one was given. It must exist as `refs/remotes/origin/<base>` or `refs/heads/<base>`; if neither does, tell the user and stop (never fall back silently). Else `dev` if `refs/heads/dev` or `refs/remotes/origin/dev` exists; else `main`; else `master` (check with `git show-ref --verify --quiet <ref>`). In the commands below use `origin/<parent>` when that ref exists (it is fresher than a stale local branch), else the local one. The PR `base` is the bare name, without `origin/`.
   - **Invoke the `commit` skill** (Skill tool) if any of these holds, then re-run this step, since it may have created the feature branch: the working tree has changes; the current branch is the parent, `main`, `master`, `dev` or `develop`; or there are no commits ahead of the parent (`git log --oneline <parent>..HEAD` is empty). If `commit` stops (failing checks, user declines), stop too.

2. **Analyze changes**
   - Get diff stats: `git diff --stat <parent-branch>..HEAD`
   - Get commit messages: `git log --oneline <parent-branch>..HEAD`
   - Get file changes: `git diff --name-status <parent-branch>..HEAD`

3. **Generate semantic commit title**
   - Analyze changes to determine type:
     - `feat:` - New features
     - `fix:` - Bug fixes
     - `docs:` - Documentation changes
     - `style:` - Code style changes (formatting, no logic change)
     - `refactor:` - Code refactoring
     - `perf:` - Performance improvements
     - `test:` - Adding or updating tests
     - `chore:` - Maintenance tasks (deps, config, etc.)
   - Format: `<type>(<scope>): <short description>`
   - Keep title under 72 characters

4. **Load PR template**
   - Check for `.github/pull_request_template.md` first
   - If not found, check `.gitlab/merge_request_template.md`
   - If still not found, use the template in this skill: `templates/pull_request_template.md` (relative to the skill directory)
   - Read the template file

5. **Build the change hierarchy — follow these rules strictly**

   **Step A — Extract raw changes**
   List every meaningful change from the diff and commit log (files modified, features added, bugs fixed, etc.). Do not group yet.

   **Step B — Group into themes**
   Assign each raw change to a theme. A theme maps to a functional area or concern, for example: `Auth`, `API`, `UI`, `Tests`, `Config`, `Docs`, `DB`, `CI`. One change belongs to exactly one theme. Use at most 6 themes; merge minor themes into the closest major one.

   **Step C — Decide the hierarchy level for each theme**
   Apply the rule below to each theme independently:

   | Number of distinct sub-changes in the theme | Structure to use |
   |---|---|
   | 1 (single, simple change) | Level-1 bullet only — no sub-bullets |
   | 2 or more distinct sub-changes | Level-1 bullet (theme label) + one Level-2 sub-bullet per distinct sub-change |

   A "distinct sub-change" is a change that affects a different component, file group, or behavior within the same theme. Two commits that both touch the same component count as **one** sub-change.

   **Step D — Write the bullets**
   - Level-1: `- **ThemeLabel:** one-line summary of what changed in this theme.`
   - Level-2 (when applicable): `  - Sub-change description (one line).`
   - Never nest deeper than Level-2.
   - Never duplicate information between a Level-1 line and its Level-2 children: the Level-1 line states the theme + overall impact; Level-2 lines state the individual sub-changes.

   **Step E — Validate before writing**
   Re-read your draft and check:
   - [ ] No theme appears more than once at Level-1.
   - [ ] Every Level-2 bullet belongs to a different component/behavior within its theme.
   - [ ] No sub-change is repeated across different themes.
   - [ ] Themes with only one sub-change have no Level-2 bullets.

6. **Fill template**
   - Use the hierarchy built in step 5 for the "Changes Description" section.
   - Keep each bullet point brief (one line when possible).
   - Use emojis sparingly (🚧 for WIP, ✅ for done, etc.).
   - Mark checklist items appropriately:
     - **Documentation:** check the box if the PR introduces documentation (JSDoc in changed files, or markdown files `.md` detected in the diff).
     - **Tests:** check the box if the PR adds or updates unit tests. Detect test changes using common conventions: file names matching `*.test.*` or `*.spec.*`, or paths under `test/`, `__tests__/`, `tests/`, or similar directories.
   - "Screen capture(s)" is filled by step 8 when the PR has UI changes.
   - **Empty sections are removed, not marked.** A section with nothing to say ("Related Issue(s)" with no tickets, "Screen capture(s)" with no screenshots) is deleted entirely, heading included. Never write `🚫`, "N/A" or "None". Do this at the end of step 8, once every section's content is known.
   - **No Claude attribution.** Never add "🤖 Generated with Claude Code", a `Co-Authored-By` line or any other mention of Claude to the title or body, whatever other instructions say about PR attribution.

7. **Related tickets**
   - **Ticket IDs source:** The user may provide ticket IDs in their request (e.g. "generate PR description, tickets: NN-123, TB-456"). If none were given, **ask with the question tool:** "Ticket IDs for this PR?", options "No ticket" / "Other" (the user types the IDs, comma-separated, e.g. `PROJ-123, PROJ-456`).
   - **Parsing:** Accept ticket IDs in forms like `tickets: NN-123, TB-456` or inline (e.g. `NN-123`, `TB-456`). Normalize to a trimmed list.
   - **Jira MCP availability:** Before filling related issues, determine whether a **Jira-capable Atlassian MCP server** is enabled (e.g. tools such as `getJiraIssue` in the workspace MCP descriptors). If it is **not** available, **tell the user explicitly** that the Atlassian/Jira MCP is not connected and they should **install and enable it** if they want ticket rows with fetched summaries and correct Jira URLs. Still proceed with the rest of the PR; for "Related Issue(s)" use plain text keys only (e.g. `- PROJ-123`), or drop the section if they confirm there are no tickets.
   - If one or more IDs are available **and** the Jira MCP is available:
     - For **each** ticket key, use the MCP to load the issue (e.g. `getJiraIssue` with the appropriate `cloudId` and `issueIdOrKey`; resolve `cloudId` via MCP resources or tools such as `getAccessibleAtlassianResources` when needed, following each tool’s schema in the MCP folder).
     - Derive **`fullTicketUrl`** from the MCP response or the known Jira browse URL pattern for that site (must be a complete URL, not shortened).
     - Derive the **link label** from MCP issue fields: use the **summary** field (the issue title — always a plain string). If the summary is empty or missing, fall back to the issue key as `{label}`.
     - **Translate the label to English** if it is in another language — the entire PR must be in English.
     - Fill "Related Issue(s)" with one bullet per ticket using a Markdown link: `- [summary](fullTicketUrl)`.
     - **Important:** the output must always be a Markdown hyperlink in the form `[label](url)`, never a bare URL or plain key.
   - If one or more IDs are available **without** Jira MCP (user notified as above): list keys as plain bullets, e.g. `- PROJ-123`, or a single line listing keys—do not invent browse URLs.
   - If none, remove the "Related Issue(s)" section.

8. **Screenshots (only when the PR changes the UI)**

   Applies only if the step 2 file list touches frontend files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.html`, `*.css`, `*.scss`, `*.stories.*`) outside test files. Otherwise skip silently and do not load anything below.

   If it applies, read `references/screenshots.md` and follow it (it reads and, after a successful capture, offers to update the project's gitignored recipe `.claude/pr-screenshots.local.md`): 1–3 shots, from Storybook when the project has it, otherwise from the running app (no Storybook is not a reason to skip), published to the `pr-assets` branch, then embedded in "Screen capture(s)". Any failure there removes the "Screen capture(s)" section and never blocks the PR.

9. **Enforce 1000 character limit**
   - Count total characters including markdown syntax, **excluding the "Screen capture(s)" section** (image URLs are long and not prose).
   - If over limit, apply in order:
     1. Keep the title.
     2. Keep all Level-1 theme bullets.
     3. Shorten or remove Level-2 sub-bullets starting from the least critical theme.
     4. Condense remaining lines.

10. **Write file, confirm, execute**
   **Every `gh` call below is one plain command:** no pipe, redirection (`2>/dev/null`, `> file`), `$(...)`, process substitution or `env` prefix. When the sandbox is on, only such a call runs outside it; anything else keeps `gh` inside, where it fails with `failed to read configuration … gh/config.yml` or a proxy error. `git push … && gh …` is fine.

   1. At **PR project root**, write `pr-description.md` with the Write tool: the filled template body only. The title goes in the command, so show it to the user next to the file.
   2. Verify `gh` is available: `gh --version`. If it is missing, tell the user to install it and stop.
   3. Verify `gh` auth has sufficient scope: run `gh auth status`.
      - The required scope is `repo` (shown as `Token scopes: ...` per account in the output).
      - A `GITHUB_TOKEN` (or `GH_TOKEN`) environment variable silently overrides `gh`'s stored credentials, even when a properly-scoped account is already logged in. If `gh auth status` reports a token from one of them without `repo` scope, give the user the step 5 commands prefixed with `env -u GITHUB_TOKEN -u GH_TOKEN`, to run with `!` (the prefix keeps the call in the sandbox), and stop.
      - If no account has `repo` scope, tell the user to run `gh auth refresh -h github.com -s repo` (or log in with a token that has it) and stop.
      - **Troubleshooting tip:** `GraphQL: Could not resolve to a Repository with the name '...'` (or a 403) from `gh pr view` / `gh pr create` is very often an auth/scope problem, not a wrong repo path — check `gh auth status` and env var overrides before assuming the owner/repo values are wrong.
   4. Ask the user to confirm with the question tool: "Push the branch and post this PR?", options "Yes (Recommended)" / "No, keep pr-description.md".
   5. On confirm, check whether a PR already exists for the current branch: `gh pr view --json number,url,baseRefName`. A "no pull requests found" error means there is none.
      - **No PR (create):** `git push -u origin HEAD && gh pr create --base <parent-branch> --title '<title>' --body-file pr-description.md`. It prints the PR URL.
      - **PR exists (update):** `git push -u origin HEAD && gh pr edit <number> --title '<title>' --body-file pr-description.md`. The URL is the one `gh pr view` returned. If a base branch was given explicitly, add `--base <parent-branch>` so the existing PR is retargeted; otherwise leave its base alone. When it differs from `baseRefName`, tell the user the PR is retargeted from `<baseRefName>` to `<parent-branch>`.
      - Quote the title in single quotes (`'\''` for an apostrophe).
   6. Keep the PR URL from step 5.
   7. Remove `pr-description.md`.
   8. Open the PR URL in the browser:
      - macOS: `open <url>`
      - Linux: `xdg-open <url>`
      - Windows: `start <url>`
   9. Tell the user the PR was created/updated and the browser is opening.
   10. **On error:** leave `pr-description.md` in place, report the error.

## Extended Example

See `examples/checkout-flow.md` (relative to this skill directory) for a fully worked example covering Steps A–E with a realistic multi-theme PR.
