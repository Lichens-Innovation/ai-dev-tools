---
name: typescript-and-react-guidelines
version: 1.1.0
last-updated: 2026-02-24
changelog:
  - 1.1.0: Bonified from development-standards.mdc — new sections (Code Style, React Components, Hooks, Error Handling, Architecture, Comments, Logging, Function Parameters, TypeScript Best Practices, React Native), extended non-negotiables and Pre-output Validation, anti-patterns for renderXyz/use prefix/useMemo/useCallback
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
6. **ALWAYS handle errors** in async functions with try/catch — never swallow silently; include a context prefix in error messages (e.g. `[ComponentName] description`); rethrow only when adding context or transforming the error type so the caller can handle it. Unhandled or silent errors make behavior incomprehensible and bugs hard to fix.
7. **NO magic numbers or unexplained strings** — extract as named constants (e.g. UPPER_SNAKE_CASE for constants). Names explain intent and centralize values for safe evolution.
8. **Prefer `??` over `||`** for null/undefined — nullish coalescing only replaces `null`/`undefined`; `||` also replaces `0`, `""`, and `false`, which often causes subtle bugs.
9. **ALWAYS use arrow functions** at top level — `const fn = () => {}`; no `function` keyword for module-level functions. Consistent style reduces cognitive load.
10. **React: use setState updater** when the next state depends on the previous — `setCount((prev) => prev + 1)`. Using the current state variable directly can be stale and cause wrong behavior.
11. **React: explicit booleans in conditionals** — e.g. `hasItems && <List />`, not `items.length && <List />` (avoids rendering `0`). Conditionals must be clearly boolean.
12. **React: list keys from stable id** — prefer `key={item.id}` (or other stable id); avoid `key={index}` unless the list is static and not reordered.
13. **useEffect: always return a cleanup** when you set up subscriptions, intervals, or listeners — return a cleanup function to avoid leaks and updates after unmount.
14. **NO `console.log` in production client code** — use a logger with levels (e.g. info, error, warn, debug); include a context prefix in messages (e.g. `[ComponentName] description`). `console.log` is acceptable in server-side/API code for debugging.
15. **React: store selected items by ID** — keep `selectedId` (or similar) in state and derive the full item from the list with `find(id)`; storing the whole object can go stale when the list changes.
16. **React: prefer named exports** — use named exports for components; default export only when required by the framework (e.g. Expo Router route files).
17. **React: no `{renderXyz()}` pattern** — extract render logic into named sub-components instead of inline render functions.
18. **Reserve `use` prefix for real hooks** — do not use the `use` prefix for non-hook functions; it breaks the Rules of Hooks and confuses readers.
19. **Prefer plain functions over custom hooks** when React primitives are not needed — use a pure TypeScript function instead of a hook when you don't need state, effects, or context.

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
settings-screen.tsx              # e.g. settings-screen.tsx, use-device-discovery.ts
```

Components and hooks are still **exported** with PascalCase (components) or camelCase with `use` prefix (hooks); only the **file name** is kebab-case.

---

## Code Style / TypeScript

- **TypeScript strict mode** — enable in `tsconfig.json` for maximum type safety.
- **Explicit function signatures** — type function parameters and return types explicitly; avoid relying on inference for public APIs.
- **Type inference for locals** — prefer inference for local variables when the type is obvious (e.g. `const count = 0`).

---

## React Components

- **FunctionComponent** — type React components with `FunctionComponent<Props>` (or `FC<Props>`); use typed props interfaces, not inline or `any`.
- **Early returns** — use early returns in component bodies to keep the main render path flat and readable.
- **Fragment shorthand** — use `<>...</>` instead of `<Fragment>` unless a `key` is required.
- **Exports** — prefer named exports for components; default export only when required by the framework (e.g. Expo Router).

---

## React Hooks

- **Functions vs hooks** — prefer a plain function to a custom hook when you don't need React primitives (state, effects, context).
- **use prefix** — use the `use` prefix only for real hooks; never for plain functions.
- **useMemo / useCallback** — avoid for simple computations or callbacks; use when profiling shows a need or when passing callbacks to memoized children.
- **Handlers** — use a single arrow function per handler (e.g. `const handleClick = () => { ... }`); avoid function factories that return handlers.
- **Selected items** — store selection by ID in state and derive the full item from the list (e.g. `selectedItem = items.find(i => i.id === selectedId)`); avoids stale references when the list updates.

---

## Error Handling

- **Context in messages** — include a prefix in error and log messages (e.g. `[ComponentName] failed to load`).
- **Rethrow policy** — rethrow only when adding context or transforming the error type; don't rethrow after logging unless the caller needs to handle the failure.

---

## Architecture & Organisation

- **Feature structure** — each feature should be self-contained: its own components, `hooks/` subdirectory, `*.utils.ts` and `*.types.ts` files, and Controllers/Services for complex business logic (e.g. `features/3D/`, `scene-manager/controllers/`).
- **Single responsibility** — one clear responsibility per file; keep components small and focused.
- **Composition over inheritance** — prefer composing small components and utilities over class inheritance.
- **Group related code** — keep related functionality together (e.g. by feature or domain).

---

## Comments

- **Self-documenting first** — prefer clear names and structure over comments; comment only when behavior is non-obvious.
- **Explain "why" not "what"** — comments should explain rationale, side effects, or workarounds, not restate the code.
- **Keep comments up to date** — remove or update comments when code changes.
- **TODO with ticket ID** — use a traceable format for TODOs (e.g. `// TODO: JIRA-1234 - description`).

---

## Logging

- **Logger with levels** — use a logger (e.g. `logger.info()`, `logger.error()`, `logger.warn()`, `logger.debug()`) instead of `console.*` in client code.
- **Context prefix** — include a context prefix in log messages (e.g. `[useDeviceDiscovery] storing last known camera IP`).
- **Server exception** — `console.log` is acceptable in server-side or API route code for debugging.

---

## Function Parameters

- **Destructuring for multiple params** — use object destructuring when a function has more than one parameter (e.g. `const fn = ({ a, b }: Args) => ...`).
- **Extract parameter types** — export parameter types as named types/interfaces instead of inline typing.
- **Optional parameters** — use `param?: Type` rather than `param: Type | undefined`.
- **Defaults in destructuring** — set default values in the destructuring when possible (e.g. `{ page = 1, size = 10 }`).

---

## TypeScript Best Practices

- **ReactNode for children** — use `ReactNode` for component children (not `JSX.Element | null | undefined`).
- **PropsWithChildren** — use `PropsWithChildren<Props>` for components that accept `children`.
- **`Record<K, V>`** — prefer the `Record<K, V>` utility type over custom index signatures.
- **Array.includes()** — use for multiple value checks instead of repeated `===` comparisons.
- **Array.some()** — use for existence checks instead of `array.find(...) !== undefined`.
- **Explicit enum values** — use explicit numeric (or string) values for enums so they survive reordering and serialization.

---

## React Native (when applicable)

When working in a React Native or Expo project:

- **Spacing** — prefer `gap`, `rowGap`, and `columnGap` over `margin`/`padding` for spacing between elements.
- **Responsive layout** — use `useWindowDimensions` instead of `Dimensions.get` for layout that reacts to size changes.
- **Static data outside components** — move constants and pure functions that don't depend on props or state outside the component to avoid new references on every render.

---

## Pre-output Validation (MANDATORY)

Before returning any code, verify each point:

- [ ] No direct mutations → convert to spread/immutable pattern
- [ ] No `any` types → replace with proper interfaces
- [ ] No inline types → extract to named types/interfaces (DRY, reuse)
- [ ] No deep nesting (>4 levels) → refactor with early returns
- [ ] Every function **under 50 lines** / file **under 800 lines** → split if needed
- [ ] All async functions have **try/catch** (no silent swallow); error messages include context prefix; rethrow only when adding context or transforming error
- [ ] No magic numbers or unexplained strings → extract as named constants (UPPER_SNAKE_CASE for constants)
- [ ] Prefer `??` over `||` for null/undefined defaults
- [ ] React: `setState` uses updater when next state depends on previous → `setX((prev) => ...)`
- [ ] React: conditional rendering uses explicit booleans (e.g. `hasItems &&`, not `items.length &&`)
- [ ] React: list keys use stable id (not index) when list can change
- [ ] React: selected items stored by ID; full item derived from list
- [ ] React: no `{renderXyz()}` pattern → use named sub-components
- [ ] `useEffect` with subscriptions/intervals/listeners returns cleanup → add if missing
- [ ] No `console.log` in client code → use logger with levels and context prefix; server/API debug use is acceptable
- [ ] New file names are **kebab-case** (e.g. `market-list-item.tsx`, `use-auth.ts`, `settings-screen.tsx`) → rename if not
- [ ] Components use named exports; default export only when required by framework
- [ ] No `use` prefix on non-hook functions; prefer plain functions over custom hooks when React not needed
