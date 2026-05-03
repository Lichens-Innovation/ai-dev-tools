---
name: react-coding-standards
description: "Enforces internal React and TypeScript coding standards using avoid/prefer rules. Use when reviewing code changes, checking PR or branch compliance, auditing staged files, or when the user asks if code aligns with company standards."
metadata:
  keywords: "React, TypeScript, naming, patterns, tests, interface, type guards, isNullish, isBlank, useToggle, named exports, code review, PR review, standards, violations, audit, staged, branch"
---

# React & TypeScript coding standards

This skill audits code against company standards expressed as **Avoid** (anti-patterns) and **Prefer** (recommended patterns), then produces a structured violation report.

## Reference files

These are the source of truth. **All 5 must be read before any analysis** — do not rely on training data for company standards.

| File | Scope | Rules |
|------|-------|-------|
| [`references/files-naming-structure-standards.md`](./references/files-naming-structure-standards.md) | File and folder naming conventions | naming |
| [`references/common-security.md`](./references/common-security.md) | TypeScript, Nodejs, Next.js, patterns | security |
| [`references/common-coding-patterns.md`](./references/common-coding-patterns.md) | TypeScript coding patterns | coding |
| [`references/common-react-patterns.md`](./references/common-react-patterns.md) | React component patterns | react |
| [`references/common-unit-testing.md`](./references/common-unit-testing.md) | Unit testing patterns | unit-testing |

## Workflow

### 1. Load all reference files

Read all 5 reference files. After reading them, output a single confirmation line before proceeding:

```
✅ Standards loaded: naming | coding | react | unit-testing
```

Do not proceed to Step 2 until this line is output. If any file cannot be read, stop and report the error.

### 2. Determine what code to review

Use the first applicable option in order:

1. **Staged files** — if the user mentions "staged" or `git add`: run `git diff --staged`
2. **Unstaged changes** — if the user mentions "unstaged", "working tree", or "unsaved": run `git diff`
3. **Branch changes** — if the user mentions "branch", "PR", or "changes": run `git diff main...HEAD` (adjust base branch as needed)
4. **Specific files** — if the user names files or paths: read those files directly
5. **New/untracked file** — if a file path is given that is untracked by git: read the file directly in full; apply all applicable rule sets to the entire file
6. **Ask** — if none of the above is clear, ask: *"What code should I review? Point me to specific files, staged changes, or a branch."*

**Audit mode by source:**
- **Git diff output**: audit only lines prefixed with `+`. Do not flag violations in unchanged context lines.
- **Full file read** (new/untracked files, explicit paths): audit the entire file.
- **Exception**: if an unchanged context line contains a HIGH-severity pattern that an added line now calls or activates, flag it as `[pre-existing]`.

### 3. Collect violations

#### 3.1 Apply rules by file type

For each file in the target scope, apply the relevant rule sets:

| File type | Rule sets to apply | Notes |
|-----------|-------------------|-------|
| Any file or folder name | `naming` | Apply to each folder segment and the filename independently. Example: `src/Components/use-pump-test.ts` → check `Components` (violation: should be `components`) and `use-pump-test.ts` (pass). |
| `.ts` | `security`, `coding` | |
| `.tsx` | `security`, `coding`, `react` | |
| `*.test.ts` / `*.spec.ts` | `coding` + `unit-testing` | |
| `*.test.tsx` / `*.spec.tsx` | `coding` + `react` + `unit-testing` | Test files with JSX need react rules too |

For each match against an **Avoid** pattern, record a violation.

#### 3.2 Confidence and false positives

Before recording a violation:
- **Report** if you are >70% confident the code matches an Avoid pattern
- **Skip** if the pattern match depends on context you cannot see (e.g., a variable whose type is only resolvable via an external import)
- **Annotate** with `[context-dependent]` if the code matches an Avoid pattern but may be intentional (e.g., `export default` on a Next.js page, `let` in a loop where reassignment is the point)

Context-dependent violations still count in the summary but include:
```
  ⚠️  Note: This may be intentional. Verify before fixing.
```

### 4. Output the violation report

Output one markdown table per severity level that has violations, in order: `CRITICAL`,  `HIGH`, then `MEDIUM`, then `LOW`. Each table has this structure:

**🔴 CRITICAL** (or 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW)

| Rulename | Location | Avoid | HowTo Fix |
|----------|----------|-------|-----------|
| rule name | `<file>:<line>` | offending code snippet | Prefer pattern from the reference, adapted to the context |

Omit a severity table entirely if there are no violations at that level.

If no violations are found at any level, list the files checked and rule sets applied, then output:

```
── No violations found. Checked X file(s) against: <rule sets applied> ──
```

### 5. Summary

End with a summary table:

```
| Severity | Count |
|----------|-------|
| CRITICAL | W     |
| HIGH     | X     |
| MEDIUM   | Y     |
| LOW      | Z     |
Total: N violation(s) across M file(s)
```
