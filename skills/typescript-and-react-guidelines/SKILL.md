---
name: typescript-and-react-guidelines
description: |
  TypeScript, React, and Node.js coding standards: naming, types, hooks, components, error handling,
  refactoring, code review. Use when creating/editing TS/JS/React files, naming variables or
  components, designing API endpoints, handling async, structuring components, or when the user
  asks "how should I name...", "what's the best way to...", "is this good practice...", "can you
  review this code". Keywords: TypeScript, React, hooks, React Query, Jest, RTL, naming, immutability.
  Do not load for: CSS-only changes, documentation writing, JSON config edits, shell scripts.
metadata:
  version: "1.1.0"
  last-updated: "2026-02-24"
  changelog: "See references/CHANGELOG.md"
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Coding Standards & Best Practices

## Non-negotiable rules

Apply [non-negotiable rules](references/rules.md) (19 rules, ordered by impact) before anything else.

---

## Agent Instructions

After reading this skill:

1. Apply ALL rules to every file you create or modify
2. Run the [Pre-output Validation](references/validation.md) checklist before returning any code
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

### Data fetching (async: loading, error, data)

- **Prefer TanStack Query** — for any async call that involves `isLoading`, error handling, and result data, use `useQuery` (or `useMutation` for writes) instead of manual `useState` + `useEffect`. You get caching, deduplication, and consistent loading/error state for free.
- **Query key factory** — define a single source of truth for cache keys (e.g. `XxxQueryKey.all`, `XxxQueryKey.list(...)`, `XxxQueryKey.detail(id)`). See [references/query-keys-example.ts](references/query-keys-example.ts) and [assets/hook-tanstack-query-template.ts](assets/hook-tanstack-query-template.ts).

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

## Pre-output validation

Before returning any code, run the [Pre-output Validation checklist](references/validation.md).

---

## Templates

Skeletons to copy and adapt (file names in kebab-case):

| Type       | File                        | Use when |
| ---------- | --------------------------- | -------- |
| Hook       | [assets/hook-template.ts](assets/hook-template.ts) | Creating a data-fetching or effect hook |
| Hook (TanStack Query) | [assets/hook-tanstack-query-template.ts](assets/hook-tanstack-query-template.ts) | Creating a hook with @tanstack/react-query (queryKey, queryFn, placeholderData) |
| Component  | [assets/component-template.tsx](assets/component-template.tsx) | Creating a React component |
| Utility    | [assets/utils-template.ts](assets/utils-template.ts) | Creating pure or side-effect helpers (`*.utils.ts`) |

---

## Validation

Validate this skill's frontmatter and structure with [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref):

```bash
skills-ref validate ./skills/typescript-and-react-guidelines
```
