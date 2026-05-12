---
name: react-coding-standards
description: "Enforces internal React and TypeScript coding standards using avoid/prefer rules. Use when reviewing or refactoring React/TS code, applying company standards, or when the user asks to align code with coding standards."
metadata:
  keywords: "avoid, prefer, React, TypeScript, naming, patterns, tests, lint, Vitest, ESLint, interface, type guards, isNullish, isBlank, useToggle, named exports"
---

# React & TypeScript coding standards

This skill applies company coding standards expressed as **Avoid** (anti-patterns) and **Prefer** (recommended patterns) to **in-code** patterns only. For file and folder naming and structure, use [react-files-structure-standards](../react-files-structure-standards/SKILL.md).

## Source of truth (priority order)

When resolving standards, use this order:

1. **Project tooling**: ESLint config (`eslint.config.js` / `.eslintrc*`), TypeScript config (`tsconfig.json`, `tsconfig.app.json`). Run `yarn lint` or `npm run lint`; fix auto-fixable issues first.
2. **Rule references** in `references/` (see Reference categories below) for the canonical Avoid/Prefer matrix.
3. **Worked examples** in `coding-examples/` for concrete before/after snippets and explanations.
4. **Reference codebase** (if provided): e.g. a frontend app under the same org — use it to infer naming, structure, and patterns (hooks returning data only, `FunctionComponent` + destructured props, `*.utils.ts` / `*.store.ts`, test style with Vitest or Jest).

## Reference categories

Standards are split between:

- `references/` for the canonical Avoid/Prefer rules.
- `coding-examples/` for detailed examples and rationale.

Load both when needed:

- **TypeScript coding patterns**
  - Rules: [`references/react-typescript.md`](references/react-typescript.md)
  - Examples: [`coding-examples/react-typescript.md`](coding-examples/react-typescript.md)
- **React component patterns**
  - Rules: [`references/react-components.md`](references/react-components.md)
  - Examples: [`coding-examples/react-components.md`](coding-examples/react-components.md)
- **Naming conventions**
  - Rules: [`references/react-naming.md`](references/react-naming.md)
  - Examples: no dedicated file yet (use rule file and codebase patterns)
- **Testing patterns**
  - Rules: [`references/react-tests.md`](references/react-tests.md)
  - Examples: [`coding-examples/react-tests.md`](coding-examples/react-tests.md)
- **Security patterns**
  - Rules: [`references/react-security.md`](references/react-security.md)
  - Examples: [`coding-examples/react-security.md`](coding-examples/react-security.md)

## Three-phase workflow

When the skill is invoked on code (selected files, git staged files, branch):

### Phase 1 — Collect violations

1. **Analyze** the provided code against the reference files above.
2. **Identify** every place where the code matches an **Avoid** pattern.
3. **List** each violation in a single report with:
   - **Category** (TypeScript / React components / naming / testing / security)
   - **Rule name** (e.g. "Avoid Using `any` for Type Definitions")
   - **Location** (file and line or snippet)
4. If no Avoid pattern is found, state that the code complies and stop. Otherwise proceed to Phase 2.

### Phase 2 — Apply corrections

1. For **each** violation in the report:
   - Open the corresponding rule file in `references/` and find the **Prefer** section paired with that Avoid rule.
   - If needed, open the matching file in `coding-examples/` to align on exact implementation style.
   - Apply the recommended correction so the code follows the Prefer pattern.
2. **Preserve** business logic and behavior; only change structure, naming, or patterns.
3. **Prefer minimal edits**: one logical change per violation, no unnecessary rewrites.
4. When several standards apply to the same area, prioritize: TypeScript safety → security boundaries → naming clarity → React architecture → testing structure.

## Rules of thumb

- **Strict avoid/prefer**: Only treat as violations what is explicitly described as Avoid in the reference files; only apply fixes that are explicitly described as Prefer there.
- **One violation, one fix**: One Avoid → one corresponding Prefer; do not mix multiple rules in a single edit unless they target the same line.
- **Readability and maintainability**: After corrections, the code should be easier to read and maintain, without changing behavior.

## Quick reference

- **Collect first**: Complete the full list of Avoid violations (manual analysis) before making edits.
- **Then redress**: Apply each Prefer in turn, using the reference file as the source of truth.
