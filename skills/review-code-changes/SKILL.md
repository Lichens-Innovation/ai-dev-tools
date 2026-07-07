---
name: review-code-changes
description: Reviews code changes for quality, maintainability, readability, and potential regressions. Supports reviewing explicitly mentioned files, git staged files, or changes between branches. Use when reviewing code changes, examining git diffs, reviewing staged changes, comparing branches, or when the user asks to review modifications.
---

# Review Code Changes

## Triage

Determine scope before reviewing. Three modes in priority order:

### 1. Explicitly Mentioned Files
**Indicators:** File paths named in the request.
**Resolution:** Use those files. Obtain diff against HEAD or named branch for context if tracked in git.

### 2. Branch Comparison
**Indicators:** Branch names mentioned; keywords "branch", "compare", "diff between", "vs"; PR context.
**Resolution:** Identify branches from the request. Default to current branch vs main if only one branch mentioned.

### 3. Staged Files
**Indicators:** "staged", "before commit", preparing to commit.
**Resolution:** `git diff --cached --name-only` to list staged files. If empty, inform the user.

Git commands for each triage mode: [git-commands.md](git-commands.md)

**After triaging:** Confirm scope is non-empty. For branch comparison, verify both branches exist. For large diffs, run `--stat` first to show an overview.

## Workflow

1. **Triage the scope** — determine mode, confirm scope is non-empty
2. **Resolve intent** — use stated intent from the invocation if provided; otherwise deduce from git: branch name, recent commit messages on this branch. Done when intent is known or explicitly unresolvable. Git commands: [git-commands.md](git-commands.md)
3. **Obtain changes** — diff or file content per triage mode
4. **Analyze each change against all four criteria** — done when every criterion has a finding (positive or negative) for every changed file
5. **Provide structured feedback** using [templates/review-summary.md](templates/review-summary.md)

## Review Criteria

### 1. Contextual Sense

- Do changes address the intended goal?
- Are related changes grouped logically?
- Is scope appropriate — not too broad, not too narrow?
- Are any unrelated changes included that should be a separate commit?

### 2. Regression Prevention

- **Behavior changes**: Does the code behave differently than before?
- **API changes**: Are function signatures, props, or interfaces modified?
- **Side effects**: Could changes affect other parts of the codebase?
- **Dependencies**: Are imports, dependencies, or external integrations affected?
- **Edge cases**: Are existing edge cases still handled correctly?

**Filter by intent:** skip changes that fall within the resolved intent — flag only unintended side effects. Example: intent = "extract utilities" → moved functions and signature changes are approved; inadvertently dropped error handling is not.

**Red flags:**
- Removing error handling without replacement
- Changing return types or function signatures
- Modifying shared utilities without checking usages
- Removing validation or checks
- Changing default values that other code might depend on

### 3. Maintainability & Evolvability

- **Structure**: Is code better organized (extracted functions, clearer modules)?
- **Complexity**: Is cyclomatic complexity reduced?
- **Coupling**: Are dependencies reduced or better managed?
- **Testability**: Is code easier to test (pure functions, dependency injection)?
- **Patterns**: Are established patterns followed consistently?

### 4. Readability

- **Naming**: Are variables, functions, and types clearly named?
- **Structure**: Is code flow easy to follow?
- **Comments**: Are comments helpful (explain "why", not "what")?
- **Formatting**: Is code consistently formatted?
- **Magic numbers**: Are constants extracted and named?

## When to Flag Issues

- **Critical**: Changes break existing functionality or introduce bugs
- **Warning**: Changes might cause issues or reduce maintainability
- **Suggestion**: Changes could be improved but aren't problematic

Provide specific examples from the diff when flagging issues.
