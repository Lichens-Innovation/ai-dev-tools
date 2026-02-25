---
name: react-coding-standards
description: Enforces internal React and TypeScript coding standards using avoid/prefer rules. Use when reviewing or refactoring React/TS code, applying company standards, or when the user asks to align code with coding standards. Keywords: avoid, prefer, React, TypeScript, naming, patterns, tests, lint.
---

# React & TypeScript coding standards

This skill applies company coding standards expressed as **Avoid** (anti-patterns) and **Prefer** (recommended patterns) across many reference categories. When invoked on code, follow the two-phase workflow below.

## Reference categories

Standards are defined in the `references/` folder. Load these files when you need the exact Avoid/Prefer rules and examples:

| Category            | File                                                                         | Scope                                                                |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Coding patterns** | [references/common-coding-patterns.md](references/common-coding-patterns.md) | TypeScript (types, control flow, errors, enums, destructuring, etc.) |
| **Naming patterns** | [references/common-naming-patterns.md](references/common-naming-patterns.md) | Boolean prefixes, descriptive names                                  |
| **React patterns**  | [references/common-react-patterns.md](references/common-react-patterns.md)   | Hooks, components, JSX, state, styling, fragments                    |
| **Unit testing**    | [references/common-unit-testing.md](references/common-unit-testing.md)       | Jest, React Testing Library, AAA, mocks, selectors                   |

## Two-phase workflow

When the skill is invoked on code (selected files, git staged files, branch):

### Phase 1 — Collect violations

1. **Analyze** the provided code against all available reference files.
2. **Identify** every place where the code matches an **Avoid** pattern described in those references.
3. **List** each violation in a single report with:
   - **Category** (coding / naming / React / unit testing)
   - **Rule name** (e.g. “Avoid Using `any` for Type Definitions”)
   - **Location** (file and line or snippet)
   - **Short reason** (what is wrong)

4. If no Avoid pattern is found, state that the code complies and stop. Otherwise proceed to Phase 2.

### Phase 2 — Apply corrections

1. For **each** violation from the report:
   - Open the corresponding reference file and find the **Prefer** section paired with that Avoid rule.
   - Apply the recommended correction (refactor) so the code follows the Prefer pattern.
2. **Preserve** business logic and behavior; only change structure, naming, or patterns.
3. **Prefer minimal edits**: one logical change per violation, no unnecessary rewrites.
4. When several standards apply to the same area, prioritize in this order:
   - TypeScript safety (types, `any`, optional params)
   - Naming clarity (boolean prefixes, descriptive names)
   - React architecture (hooks, components, state, keys)
   - Testing structure (AAA, screen queries, mocks)

## Rules of thumb

- **Strict avoid/prefer**: Only treat as violations what is explicitly described as Avoid in the reference files; only apply fixes that are explicitly described as Prefer there.
- **One violation, one fix**: One Avoid → one corresponding Prefer; do not mix multiple rules in a single edit unless they target the same line.
- **Readability and maintainability**: After corrections, the code should be easier to read and maintain, without changing behavior.

## Quick reference

- **Collect first**: Always complete the full list of Avoid violations before making edits.
- **Then redress**: Apply each Prefer in turn, using the reference file as the source of truth for the exact pattern and examples.
