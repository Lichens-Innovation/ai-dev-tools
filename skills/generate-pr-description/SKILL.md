---
name: generate-pr-description
description: Generate pull request descriptions by comparing current branch with parent branch. Creates semantic commit-style PR titles and fills PR templates. Use when the user asks to generate PR description, prepare pull request, or create merge request description.
---

# Generate PR Description

Generate a concise pull request description by analyzing git changes and using the project's PR template.

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
   - Read the template file

5. **Fill template concisely**
   - Extract key changes from git diff and commits
   - Fill "Changes Description" section with bullet points
   - Keep each bullet point brief (one line when possible)
   - Use emojis sparingly (🚧 for WIP, ✅ for done, etc.)
   - Mark checklist items appropriately
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

<filled-template-markdown>
```

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

## Changes Description

- Add login component with form validation
- Update auth service with JWT token handling
- Add unit tests for authentication flow

## Checklist

- [x] code follows project guidelines.
- [x] tests have been added or updated (if applicable).
- [ ] documentation has been updated (if applicable).

## Related Issue(s)

- 🚫

## Screen capture(s)

- 🚫
```

## Character Count Tips

- Use abbreviations when appropriate (e.g., "auth" instead of "authentication")
- Combine related changes into single bullet points
- Remove template placeholders if not needed
- Prioritize "Changes Description" over other sections
