---
name: review-code-changes
description: Reviews code changes for quality, maintainability, readability, and potential regressions. Supports reviewing explicitly mentioned files, git staged files, or changes between branches. Verifies changes make sense in context, improve maintainability, enhance readability, and don't introduce side effects. Use when reviewing code changes, examining git diffs, reviewing staged changes, comparing branches, or when the user asks to review modifications.
---

# Review Code Changes

Reviews code changes to ensure they improve code quality, maintainability, and readability without introducing regressions. Supports multiple scope modes: explicitly mentioned files, git staged files, or branch comparisons.

## Scope Resolution

Before reviewing, determine the scope of files to review. The skill supports three modes:

### 1. Explicitly Mentioned Files

**Indicators:**
- File paths explicitly mentioned in the user's request (e.g., "review src/components/Button.tsx")
- Files listed in the request (e.g., "review these files: utils.ts, helpers.ts")
- References to specific files in the message

**Resolution:**
- Extract file paths from the user's request
- Verify files exist in the workspace
- Read the current content of the files
- Optionally: if files are tracked in git, obtain diff against HEAD or a specific branch for context

**Git commands (optional, for diff context):**
```bash
git diff HEAD <file-path>           # Diff against HEAD
git diff <branch> <file-path>       # Diff against specific branch
git diff --name-only <file-path>    # Check if file is tracked
```

### 2. Git Staged Files

**Indicators:**
- Keywords: "staged", "staged changes", "git staged", "before commit"
- User preparing to commit changes
- Context suggests reviewing what's in the staging area

**Resolution:**
- Check for staged files: `git diff --cached --name-only`
- If no files staged: inform the user that there are no staged changes to review
- If files staged: obtain the diff with `git diff --cached`

**Git commands:**
```bash
git diff --cached                    # Full diff of staged changes
git diff --cached --name-only        # List of staged files
git diff --cached --stat             # Statistics of staged changes
```

### 3. Branch Comparison

**Indicators:**
- Keywords: "branch", "compare", "diff between", "vs", "against"
- Branch names mentioned in the request
- Context of PR/merge request review

**Resolution:**
- Identify branches from the request:
  - If two branches mentioned: use both explicitly
  - If one branch mentioned: compare with default branch (main/master) or current branch
  - If no branch mentioned but in PR context: deduce from current branch
- Get current branch: `git rev-parse --abbrev-ref HEAD`
- Determine base branch (usually main/master): check common patterns or use `git show-branch`
- Obtain diff between branches: `git diff <base-branch>..<head-branch>`

**Git commands:**
```bash
git rev-parse --abbrev-ref HEAD      # Current branch name
git diff <branch1>..<branch2>        # Diff between two branches
git diff <branch1>..<branch2> --name-only  # List of changed files
git diff <branch1>..<branch2> --stat # Statistics
git merge-base <branch1> <branch2>   # Common ancestor
git show-branch | grep '*' | grep -v "$(git rev-parse --abbrev-ref HEAD)" | head -1 | sed 's/.*\[\(.*\)\].*/\1/' | sed 's/[\^~].*//'  # Infer parent branch
```

### Priority Order

When multiple indicators are present, use this priority:

1. **Explicitly mentioned files** — Highest priority if files are explicitly mentioned
2. **Branch comparison** — If branches are mentioned, compare those branches
3. **Staged files** — If no files/branches mentioned, check for staged files
4. **Fallback** — If scope cannot be determined, ask the user for clarification

### Scope Validation

After determining the scope:

1. **Verify scope is not empty**
   - If no files found: inform the user clearly
   - If branch doesn't exist: report error with branch name
   - If files don't exist: report error with file paths

2. **Display scope summary**
   - Show which mode was used
   - List files that will be reviewed
   - For branch comparison: show branch names and number of changed files

3. **Handle edge cases**
   - Large diffs: consider using `--stat` first to show overview, then full diff
   - Many files: process in batches if needed
   - Ambiguous requests: confirm with user before proceeding

## Workflow

When reviewing code changes:

1. **Resolve scope** — Follow the "Scope Resolution" section above to determine which files to review
2. **Obtain changes** — Get the diff or file content based on the resolved scope:
   - For explicitly mentioned files: read file content (and optionally diff if tracked in git)
   - For staged files: `git diff --cached`
   - For branch comparison: `git diff <base>..<head>`
3. **Analyze each change** against the four criteria below
4. **Provide structured feedback** using the template in this skill: [templates/review-summary.md](templates/review-summary.md) (relative to the skill directory)

## Review Criteria

### 1. Contextual Sense

Verify changes align with the stated purpose:

- Do the modifications address the intended goal?
- Are related changes grouped logically?
- Is the scope appropriate (not too broad, not too narrow)?
- Are any unrelated changes included that should be in a separate commit?

### 2. Regression Prevention

Identify potential breaking changes:

- **Behavior changes**: Does the code behave differently than before?
- **API changes**: Are function signatures, props, or interfaces modified?
- **Side effects**: Could changes affect other parts of the codebase?
- **Dependencies**: Are imports, dependencies, or external integrations affected?
- **Edge cases**: Are existing edge cases still handled correctly?

**Red flags:**

- Removing error handling without replacement
- Changing return types or function signatures
- Modifying shared utilities without checking usages
- Removing validation or checks
- Changing default values that other code might depend on

### 3. Maintainability & Evolvability

Assess long-term code health:

- **Structure**: Is code better organized (extracted functions, clearer modules)?
- **Complexity**: Is cyclomatic complexity reduced?
- **Coupling**: Are dependencies reduced or better managed?
- **Testability**: Is code easier to test (pure functions, dependency injection)?
- **Documentation**: Are complex parts documented?
- **Patterns**: Are established patterns followed consistently?

**Signs of improvement:**

- Extracting reusable utilities
- Reducing nested conditionals
- Breaking large functions into smaller ones
- Using consistent naming conventions
- Following project architecture patterns

### 4. Readability

Evaluate code clarity:

- **Naming**: Are variables, functions, and types clearly named?
- **Structure**: Is code flow easy to follow?
- **Comments**: Are comments helpful (explain "why", not "what")?
- **Formatting**: Is code consistently formatted?
- **Magic numbers**: Are constants extracted and named?

**Signs of improvement:**

- More descriptive variable names
- Reduced nesting levels
- Clearer control flow
- Better type annotations
- Consistent code style

## Common Patterns to Check

### Refactoring Patterns

**Good refactoring:**

- Extract function → Verify all call sites updated
- Rename variable → Verify all references updated
- Move code → Verify imports and dependencies updated

**Risky refactoring:**

- Changing shared utilities without checking all usages
- Modifying type definitions without updating consumers
- Removing "unused" code that might be used dynamically

### Code Quality Improvements

**Verify improvements are real:**

- Not just moving code around
- Actually reducing complexity
- Actually improving readability
- Making code more testable, not just prettier

### Readability Improvements

**Ensure clarity gains:**

- Names are actually more descriptive
- Structure is genuinely easier to follow
- Comments add value, not noise

## When to Flag Issues

Flag changes if:

- **Critical**: Changes break existing functionality or introduce bugs
- **Warning**: Changes might cause issues or reduce maintainability
- **Suggestion**: Changes could be improved but aren't problematic

Provide specific examples from the diff when flagging issues.
