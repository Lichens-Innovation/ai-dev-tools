---
name: generate-pr-description
description: Generate pull request descriptions by comparing current branch with parent branch. Creates semantic commit-style PR titles and fills PR templates. Use when the user asks to generate PR description, prepare pull request, or create merge request description.
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

5. **Fill template concisely**
   - Before filling the template, group all changes by theme/area (e.g. auth, API, UI, tests, docs)
   - Do not repeat the same subject: one entry per theme, even if multiple files or commits touch it
   - Extract key changes from git diff and commits, already grouped by theme as above
   - Fill "Changes Description" using the template’s two-level structure:
     - **Level 1 (category):** one top-level bullet per theme/area (`{level1_changes_description_category}`)
     - **Level 2 (sub-details):** one or more sub-bullets under each category for distinct sub-changes (`{level2_change_detail_for_that_category}`); omit sub-bullets when a category has only one simple change
   - Keep each bullet point brief (one line when possible)
   - Use emojis sparingly (🚧 for WIP, ✅ for done, etc.)
   - Mark checklist items appropriately:
     - **Documentation:** check the box if the PR introduces documentation (JSDoc in changed files, or markdown files `.md` detected in the diff).
     - **Tests:** check the box if the PR adds or updates unit tests. Detect test changes using common conventions: file names matching `*.test.*` or `*.spec.*`, or paths under `test/`, `__tests__/`, `tests/`, or similar directories used by mainstream test runners (do not assume a specific framework such as Jest or Vitest).
   - Leave "Related Issue(s)" and "Screen capture(s)" as 🚫 if not applicable

6. **Enforce 600 character limit**
   - Count total characters including markdown syntax
   - If over limit, prioritize:
     1. Keep the title
     2. Keep essential change descriptions
     3. Shorten or remove less critical sections
     4. Condense bullet points

## Output Format

Provide ready-to-copy markdown in this format:

```markdown
## PR Title

<semantic-commit-style-title>

## PR Description

<filled-template-markdown including Summary then Changes Description with level-1 bullets (themes) and optional level-2 sub-bullets (sub-changes)>
```

**Grouping rule:** Never list the same subject twice. If several commits or files relate to the same theme (e.g. "auth", "tests", "docs"), merge them into a single level-1 bullet in the summary and in Changes Description; use level-2 sub-bullets only for distinct sub-changes within that theme.

## Example

**Input analysis:**

- Branch: `feature/add-user-auth`
- Changes: Added login component, updated auth service, added tests
- 3 commits: "feat: add login component", "feat: update auth service", "test: add auth tests"

**Output:**

```markdown
## PR Title

feat(auth): implement user authentication

## PR Description

## Summary

- Authentication: login component and auth service.
- Tests: auth-related tests added.

## Changes Description

- **Auth:** login component and auth service.
  - Login component added.
  - Auth service updated.
- **Tests:** auth tests added.

## Checklist

(other checklist items...)
```

## Character Count Tips

- Use abbreviations when appropriate (e.g., "auth" instead of "authentication")
- Combine related changes into single level-1 bullets; use level-2 sub-bullets only when a category has several distinct sub-changes (grouping avoids repetition)
- Remove template placeholders if not needed
- Prioritize Summary and "Changes Description" over other sections
