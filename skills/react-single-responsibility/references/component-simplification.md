# Simplifying a component (filename pattern \*.tsx)

Rules that apply when reducing complexity of a **React component**.

## Decomposition (avoid God Component)

Apply in this order:

1. **Extract pure utilities first** — Logic with no React dependency → pure functions (2+ args → see Shared → Parameter object rule in SKILL.md). Reusable → `src/utils/xyz.utils.ts`; feature-specific → `component-name.utils.ts` next to the component.

2. **Form state (multiple useState)** — When multiple `useState` calls are used to manage the full state of an input form: refactor the code to use the **react-hook-form** library, which simplifies the form, its validation, its state, and its submission.

3. **Extract logic into hooks** — State, effects, derived logic → hooks (`use-xyz.ts`). Reusable → `src/hooks/`; feature-specific → feature's `hooks/` subdirectory. Prefer a **plain arrow function** over a custom hook when you don't need React primitives.

4. **Split the visual layer into sub-components** — If render/TSX exceeds roughly **100 lines**, extract sub-components with clear props and a single responsibility. **Avoid internal `renderXyz()` methods**: turn each into a **regular component** (own file, own props). Each sub-component **must live in its own file**; use **parent file name as prefix**: `parent-name-<sub-component-name>.tsx` (e.g. `market-list-item.tsx`, `market-list-filters.tsx` for parent `market-list.tsx`). Large component (exceeding the file size ceiling — see Shared → File and size guidelines in SKILL.md) → split into list container, list item, filters, pure functions and hook(s) as necessary for data logic.

## Structure and readability

- **Order inside the component:** types → state → computed const → effects → handlers → render.
- **Handlers:** If a handler depends only on pure TypeScript it can be moved to `component-name.utils.ts` next to the component; otherwise, if the handler is very simple (e.g. one line) keep it inline in the onClick or other event props; finally, if the handler is more complex or involves state, use one arrow function per handler (e.g. `const handleClick = () => { ... }`). Always avoid factories that return handlers (double arrow functions).
- **Early returns in render** — Keep the main path flat: `if (isLoading) return <Spinner />; if (error) return <ErrorMessage />; ...` One condition per line; avoid nested ternary operators (“ternary hell”).
- **Boolean in JSX** — Use explicit computed boolean (e.g. `const hasItems = items.length > 0; { hasItems && <List /> }`) so `0` is not rendered.
- **Static data** — Constants and pure functions that don't depend on props or state → **outside the component** (relocate into `component-name.utils.ts`) to avoid new references every render.

## React-specific

- **Selected items** — Store selection by **ID** in state; **derive** the full item from the list (e.g. `selectedItem = items.find(i => i.id === selectedId)`). Avoids stale references when the list updates.
- **useMemo / useCallback — only when absolutely necessary** — Default: do not use. Re-renders are often an acceptable tradeoff to promote readability. These hooks add complexity and recent React compilers already optimize renders. Avoid for trivial cases (e.g. `useMemo(() => count * 2, [count])`, `useCallback(() => setOpen(true), [])`). Use only when: **profiling** shows a real performance problem.
- **Data fetching** — Prefer **TanStack Query** (`useQuery` / `useMutation`) instead of manual `useState` + `useEffect` — reduces boilerplate and keeps the component simpler.
- **Form state** — When multiple `useState` calls are used to manage a form, consider using **react-hook-form** to simplify the form and its state (validation, submission, and field registration in one place).
