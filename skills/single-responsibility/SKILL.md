---
name: single-responsibility
description: |
  Strategies to simplify components and methods: decomposition order (utilities, hooks, sub-components),
  early returns, control flow, parameter design, and code smell fixes. Use when refactoring a large
  component or function, reducing complexity, applying single responsibility, or when the user asks
  how to simplify a component or method.
metadata:
  version: "1.0.0"
  last-updated: "2026-02-25"
  source: "Extracted from typescript-and-react-guidelines"
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Single Responsibility — Simplify Components & Methods

Apply these strategies to keep components and methods focused, testable, and readable. Rules are split into **component** vs **method** simplification.

---

## Principles

| Principle                 | Rule                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **KISS**                  | Simplest solution that works. Avoid over-engineering.                                         |
| **Single responsibility** | One clear responsibility per component or function; extract utilities, hooks, sub-components. |
| **DRY**                   | Extract common logic; create reusable functions or components.                                |
| **YAGNI**                 | Don't build features before they're needed.                                                   |
| **Composition**           | Prefer composing small components and utilities over large, multi-purpose blocks.             |

---

## Simplifying a component

Rules that apply when reducing complexity of a **React component**.

### Decomposition (avoid God Component)

Apply in this order:

1. **Extract pure utilities first** — Logic with no React dependency → pure functions. More than one argument → object destructuring + extracted parameter type. Reusable → `src/utils/xyz.utils.ts`; feature-specific → `component-name.utils.ts` next to the component.

2. **Extract logic into hooks** — State, effects, derived logic → hooks (`use-xyz.ts`). Reusable → `src/hooks/`; feature-specific → feature's `hooks/` subdirectory. Prefer a **plain function** over a custom hook when you don't need React primitives.

3. **Split the visual layer into sub-components** — If render/JSX exceeds roughly **40 lines**, extract sub-components with clear props and a single responsibility. **Avoid `renderXyz()` methods**: turn each into a **regular component** (own file, own props). Each sub-component **must live in its own file**; use **parent file name as prefix**: `parent-name-<specialized-subname>.tsx` (e.g. `market-list-item.tsx`, `market-list-filters.tsx` for parent `market-list.tsx`). Large component (~100+ lines) → split into list container, list item, filters, and a hook for data logic.

### Structure and readability

- **Order inside the component:** types → state → effects → handlers → render.
- **Handlers:** one arrow function per handler (e.g. `const handleClick = () => { ... }`); avoid factories that return handlers.
- **Early returns in render** — Keep the main path flat: `if (isLoading) return <Spinner />; if (error) return <ErrorMessage />; ...` One condition per line; avoid nested ternary operators (“ternary hell”).
- **Boolean in JSX** — Use explicit boolean (e.g. `const hasItems = items.length > 0; { hasItems && <List /> }`) so `0` is not rendered.
- **Static data** — Constants and pure functions that don't depend on props or state → **outside the component** to avoid new references every render.

### React-specific

- **Selected items** — Store selection by **ID** in state; **derive** the full item from the list (e.g. `selectedItem = items.find(i => i.id === selectedId)`). Avoids stale references when the list updates.
- **useMemo / useCallback — only when necessary** — Default: do not use. They add complexity and **React 19** (and recent React) already optimizes renders. Avoid for trivial cases (e.g. `useMemo(() => count * 2, [count])`, `useCallback(() => setOpen(true), [])`). Use only when: (1) **profiling** shows a real performance problem, or (2) you pass a callback to a **memoized child** (`React.memo`) and need a stable reference.
- **Data fetching** — Prefer **TanStack Query** (`useQuery` / `useMutation`) instead of manual `useState` + `useEffect` — reduces boilerplate and keeps the component simpler.

---

## Simplifying a method

Rules that apply when reducing complexity of a **function or method** (non-component).

### Long function (>40 lines)

- **Signal:** Scrolling to understand a single function.
- **Fix:** Extract into smaller, **named** functions. Apply **single responsibility**: each new method must stay **simple and focused on one task only** (e.g. validate → fetch → persist → notify). Each step should be testable in isolation.

### Control flow

- **Early returns** — Prefer early returns over nested if/else (max ~2 levels of nesting).
- **const over let** — Prefer const; use **reduce** or pure helpers instead of mutable loop accumulators.
- **Clear conditionals** — Use `Array.includes(value)` for multiple value checks; `Array.some(predicate)` for existence checks. Extract **complex expressions** into named variables (destructuring, intermediate vars) for readability.

### Parameters

- **Long parameter list (>1 param)** — Use a single **params object** with destructuring; extract type (e.g. `interface CreateUserArgs`). Avoids wrong order and unclear meaning at the call site.
- **Boolean flag parameter** — Avoid `fn(data, true)`. Use an **options object** with a named flag (e.g. `{ userId, includeArchived }: CreateUserArgs`) or **separate functions** when behavior diverges.
- **Conventions** — Destructuring for multiple params; extract parameter types (named types/interfaces); optional as `param?: Type`; defaults in destructuring (e.g. `{ page = 1, size = 10 }`).

### Duplication (DRY)

- **Signal:** Copy-paste with minor variations.
- **Fix:** Extract a **parameterized function** (e.g. single `getMarketsForUser({ userId, status })` instead of `getActiveMarketsForUser` and `getClosedMarketsForUser`).

---

## Shared (components and methods)

### Coupling (shotgun surgery)

- **Signal:** One feature change requires edits in many files.
- **Fix:** Co-locate related logic (e.g. feature folder with its own components, hooks, utils, types); reduce coupling and centralize domain logic where it belongs.

### File and size guidelines

- **200–400 lines** typical per file; **800 lines** absolute maximum.
- **One responsibility per file** (high cohesion, low coupling).
- File names: **kebab-case**. Examples: `market-list-item.tsx`, `use-market-filters.ts`, `<name>.utils.ts`, `<name>.types.ts` (e.g. `market-list.utils.ts`, `market-list.types.ts`).

### Quick checklist

- [ ] Can I understand this in ~30 seconds? → if no: too complex; split or rename.
- [ ] Does it do more than one thing? → if yes: extract utilities, hooks, or sub-components (component) or smaller named functions (method).
- [ ] Long parameter lists or boolean flags? → use options object or separate functions.
- [ ] Copy-pasted code? → extract and parameterize.
- [ ] Control flow deeply nested? → use early returns and intermediate variables.
- [ ] Comments explaining _what_? → rename for self-documenting code; keep comments for _why_ only.
