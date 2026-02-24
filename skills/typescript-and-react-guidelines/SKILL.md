---
name: typescript-and-react-guidelines
version: 1.0.0
last-updated: 2026-02-24
changelog:
  - 1.0.0: Initial version
description: |
  LOAD THIS SKILL when: creating or editing any TypeScript, JavaScript, React, or Node.js file,
  naming variables/functions/components, designing API endpoints, handling async operations,
  structuring React components, reviewing code for quality, refactoring existing code,
  or setting up a new project structure. Also trigger when the user asks "how should I name...",
  "what's the best way to...", "is this good practice...", or "can you review this code".
  DO NOT load for: CSS-only changes, documentation writing, JSON config edits, shell scripts.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Coding Standards & Best Practices

## ⚠️ NON-NEGOTIABLE RULES (apply before anything else)

Rules are ordered by impact on **readability**, **maintainability**, **comprehensibility**, and **evolvability** — highest impact first.

1. **NEVER mutate** objects or arrays — always use spread (or immutable methods). Mutations break predictability, debugging, and React’s model; they make refactors and evolution risky.
2. **NEVER use `any`** — define precise interfaces/types. Types are the main documentation and safety net; `any` removes both and makes the codebase hard to understand and change.
3. **NO inline types** — extract types/interfaces to named declarations. Single source of truth, reuse, and self-documenting code; changes stay in one place.
4. **NO deep nesting** — use early returns. Flat control flow is the largest readability win; nested conditionals are hard to scan and maintain.
5. **Functions under 50 lines / Files under 800 lines** — split when exceeded. Small units are scannable, testable, and keep a single responsibility; large blocks are the opposite.
6. **ALWAYS handle errors** in async functions with try/catch — never swallow silently; add context to messages and rethrow when the caller must know. Unhandled or silent errors make behavior incomprehensible and bugs hard to fix.
7. **NO magic numbers or unexplained strings** — extract as named constants. Names explain intent and centralize values for safe evolution.
8. **Prefer `??` over `||`** for null/undefined — nullish coalescing only replaces `null`/`undefined`; `||` also replaces `0`, `""`, and `false`, which often causes subtle bugs.
9. **ALWAYS use arrow functions** at top level — `const fn = () => {}`; no `function` keyword for module-level functions. Consistent style reduces cognitive load.
10. **React: use setState updater** when the next state depends on the previous — `setCount((prev) => prev + 1)`. Using `count` directly can be stale and cause wrong behavior.
11. **React: explicit booleans in conditionals** — e.g. `hasItems && <List />`, not `items.length && <List />` (avoids rendering `0`). Conditionals must be clearly boolean.
12. **React: list keys from stable id** — prefer `key={item.id}` (or stable id); avoid `key={index}` unless the list is static and not reordered.
13. **useEffect: always return a cleanup** when you set up subscriptions, intervals, or listeners — avoids leaks and updates after unmount.
14. **NO `console.log` in production code** — use a logger with levels; logs left in code clutter output and can leak sensitive data.

---

## Agent Instructions

After reading this skill:

1. Apply ALL rules to every file you create or modify
2. Run the **Pre-output Validation** checklist before returning any code
3. If a rule conflicts with a user request, flag it explicitly and propose a compliant alternative
4. Reference specific rule names when explaining choices (e.g., "Per the KISS principle, I simplified this by...")
5. Load example files **on demand** — only read the relevant file for the task at hand

---

## Code Quality Principles

| Principle             | Rule                                                       |
| --------------------- | ---------------------------------------------------------- |
| **Readability First** | Code is read more than written. Clear names > clever code. |
| **KISS**              | Simplest solution that works. Avoid over-engineering.      |
| **DRY**               | Extract common logic. Create reusable components.          |
| **YAGNI**             | Don't build features before they're needed.                |
| **Immutability**      | Never mutate — always return new values.                   |

---

## Sections & Example Files

### TypeScript / JavaScript

| Topic                                               | Example File                            | When to load                                                                           |
| --------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| Variable & function naming (incl. boolean prefixes) | `examples/typescript/naming.ts`         | When naming anything (arrow functions only; booleans: is/has/should/can/will)          |
| Immutability patterns                               | `examples/typescript/immutability.ts`   | When working with state/objects/arrays                                                 |
| Error handling                                      | `examples/typescript/error-handling.ts` | When writing async code                                                                |
| Async / Promise patterns                            | `examples/typescript/async-patterns.ts` | When using await/Promise                                                               |
| Type safety                                         | `examples/typescript/type-safety.ts`    | When defining interfaces/types (no inline types; no nested types; extract named types) |
| Control flow & readability                          | `examples/typescript/control-flow.ts`   | Early returns, const vs let, Array.includes/some, nullish coalescing, destructuring    |

### React

| Topic               | Example File                             | When to load              |
| ------------------- | ---------------------------------------- | ------------------------- |
| Component structure | `examples/react/component-structure.tsx` | When creating a component |

### Testing

| Topic              | Example File                                 | When to load                                                                       |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unit test patterns | `examples/testing/unit-testing-patterns.tsx` | When writing Jest/RTL tests (AAA, screen, spyOn, it.each, getByRole, mock factory) |

### Anti-patterns (read during code review)

| Topic                    | File                              |
| ------------------------ | --------------------------------- |
| All BAD patterns grouped | `anti-patterns/what-not-to-do.ts` |
| Code smells detection    | `anti-patterns/code-smells.ts`    |

---

## File Organization Rules

- **200–400 lines** typical file length
- **800 lines** absolute maximum
- One responsibility per file (high cohesion, low coupling)
- **File names: always kebab-case** (lowercase with hyphens). No PascalCase or camelCase in file or folder names.

```
components/button.tsx           # kebab-case (not Button.tsx)
hooks/use-auth.ts               # kebab-case (not useAuth.ts)
lib/format-date.ts              # kebab-case (not formatDate.ts)
types/market.types.ts           # kebab-case + optional .types / .utils / .store suffix
features/market-list/market-list-item.tsx
```

Components and hooks are still **exported** with PascalCase (components) or camelCase with `use` prefix (hooks); only the **file name** is kebab-case.

---

## Pre-output Validation (MANDATORY)

Before returning any code, verify each point:

- [ ] No direct mutations → convert to spread/immutable pattern
- [ ] No `any` types → replace with proper interfaces
- [ ] No inline types → extract to named types/interfaces (DRY, reuse)
- [ ] No deep nesting (>4 levels) → refactor with early returns
- [ ] Every function **under 50 lines** / file **under 800 lines** → split if needed
- [ ] All async functions have **try/catch** (no silent swallow) → add if missing
- [ ] No magic numbers or unexplained strings → extract as named constants
- [ ] Prefer `??` over `||` for null/undefined defaults
- [ ] React: `setState` uses updater when next state depends on previous → `setX((prev) => ...)`
- [ ] React: conditional rendering uses explicit booleans (e.g. `hasItems &&`, not `items.length &&`)
- [ ] React: list keys use stable id (not index) when list can change
- [ ] `useEffect` with subscriptions/intervals/listeners returns cleanup → add if missing
- [ ] No `console.log` left in production code → use logger
- [ ] New file names are **kebab-case** (e.g. `market-list-item.tsx`, `use-auth.ts`) → rename if not
