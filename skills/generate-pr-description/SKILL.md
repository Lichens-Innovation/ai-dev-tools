---
name: generate-pr-description
description: "Generates pull request descriptions by comparing current branch with parent branch. Creates semantic commit-style PR titles and fills PR templates. Use when the user asks to generate PR description, prepare pull request, or create merge request description. The user may include ticket IDs in the request (e.g. tickets: NN-123, TB-456) from the company tracking system; treat those as the related issue IDs for the PR."
---

# Generate PR Description

Generate a concise pull request description by analyzing git changes and using the project's PR template.

**Language:** Always generate PR titles and descriptions in **English**, regardless of the user's language or the language of commit messages.

## Workflow

1. **Identify parent branch**
   - Check current branch: `git rev-parse --abbrev-ref HEAD`
   - Determine parent (usually `main` or `master`): `git show-branch | grep '*' | grep -v "$(git rev-parse --abbrev-ref HEAD)" | head -1 | sed 's/.*\[\(.*\)\].*/\1/' | sed 's/[\^~].*//'`
   - Or use: `git merge-base HEAD main` to find common ancestor

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
   - Leave "Screen capture(s)" as 🚫 if not applicable.

7. **Related tickets**
   - **Ticket IDs source:** The user may provide ticket IDs in their request (e.g. "generate PR description, tickets: NN-123, TB-456"). If none were given, **ask the user:** "Ticket IDs for this PR (comma-separated, e.g. `PROJ-123, PROJ-456`). Leave empty if none."
   - **Parsing:** Accept ticket IDs in forms like `tickets: NN-123, TB-456` or inline (e.g. `NN-123`, `TB-456`). Normalize to a trimmed list.
   - **Jira MCP availability:** Before filling related issues, determine whether a **Jira-capable Atlassian MCP server** is enabled (e.g. tools such as `getJiraIssue` in the workspace MCP descriptors). If it is **not** available, **tell the user explicitly** that the Atlassian/Jira MCP is not connected and they should **install and enable it** if they want ticket rows with fetched summaries and correct Jira URLs. Still proceed with the rest of the PR; for "Related Issue(s)" use plain text keys only (e.g. `- PROJ-123`) or `- 🚫` if they confirm there are no tickets.
   - If one or more IDs are available **and** the Jira MCP is available:
     - For **each** ticket key, use the MCP to load the issue (e.g. `getJiraIssue` with the appropriate `cloudId` and `issueIdOrKey`; resolve `cloudId` via MCP resources or tools such as `getAccessibleAtlassianResources` when needed, following each tool’s schema in the MCP folder).
     - Derive **`fullTicketUrl`** from the MCP response or the known Jira browse URL pattern for that site (must be a complete URL, not shortened).
     - Derive the **link label** from MCP issue fields: prefer the **description** (trimmed to a single short line or first sentence if long). If the description is empty, use **summary**. If both are missing, use the issue key as `{label}`.
     - Fill "Related Issue(s)" with one bullet per ticket: `- [{label}]({fullTicketUrl})`.
   - If one or more IDs are available **without** Jira MCP (user notified as above): list keys as plain bullets, e.g. `- PROJ-123`, or a single line listing keys—do not invent browse URLs.
   - If none, keep "Related Issue(s)" as `- 🚫`.

8. **Enforce 1000 character limit**
   - Count total characters including markdown syntax.
   - If over limit, apply in order:
     1. Keep the title.
     2. Keep all Level-1 theme bullets.
     3. Shorten or remove Level-2 sub-bullets starting from the least critical theme.
     4. Condense remaining lines.

9. **Write file, copy to clipboard, remove file**
   - At **PR project root**, create or overwrite `pr-description.md` with the full PR output.
   - Call: `node <skill-dir>/scripts/copy-to-clipboard.mjs "<full-path-to-pr-description.md>"`
   - **On success:** remove the file and tell the user: **"The full PR description is in the clipboard; you can paste it into your PR."**
   - **On error:** leave `pr-description.md` in place and tell the user they can open it or copy manually.

## Output Format

```markdown
## PR Description

<semantic-commit-style-title>

<filled-template-markdown>
```

## Extended Example

See `examples/checkout-flow.md` (relative to this skill directory) for a fully worked example covering Steps A–E with a realistic multi-theme PR.
