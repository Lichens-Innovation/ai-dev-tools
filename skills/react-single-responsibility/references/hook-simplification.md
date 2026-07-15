# Simplifying a hook (filename pattern use\*.ts)

Rules that apply when reducing complexity of a **custom React hook**. Apply single responsibility by extracting pure logic into utilities and splitting broad hooks into smaller, focused ones.

## Decomposition order

1. **Extract pure JS utilities first** — Any logic that has no dependency on React (no `useState`, `useEffect`, context, etc.) → move to **pure exported arrow functions** (2+ args → see Shared → Parameter object rule in SKILL.md). Put extracted arrow function(s) in `<component-name>.utils.ts` next to the component or `<hook-name>.utils.ts` next to the hook, or in `src/utils/` if reusable. Examples: formatting, validation, computing derived values from plain data, building query params or request bodies. Pure functions are easier to test and reuse outside the hook.

2. **Consider enriching an existing state manager** — Before creating new specialized hooks, check if the project already uses a **state manager** (e.g. **Zustand**, **MobX**, Redux). If so, consider **adding the business logic there**: actions, derived state, and domain rules can live in the store and **slim down the hooks**. Hooks then become thin selectors or one-off bindings (e.g. `useStore(selector)`), and the store encapsulates the domain. Prefer extending the existing store over multiplying hooks that each hold their own state.

3. **Split into specialized hooks** — If no store fits or the logic is purely local/UI, and the hook still handles several concerns (e.g. fetching + filtering + pagination) or states, extract **one hook per concern**: e.g. `useFetchItems`, `useItemsFilter`, `usePagination`. Compose them in the component or in a thin “orchestrator” hook that only wires the others. Each hook should have **one clear responsibility** and a name that reflects it.

## Hook design

- **Narrow return shape** — Prefer returning a small, stable object (e.g. `{ data, isLoading, error }` or `{ value, onChange }`). Avoid returning large bags of unrelated state and setters; split into separate hooks instead.
- **Plain function vs hook** — If the logic doesn’t need React primitives (state, effects, context), use a **plain function** in a `.utils.ts` file instead of a custom hook. Only introduce a hook when you need React’s lifecycle or state.
- **Dependencies** — Keep hook inputs explicit (parameters); avoid reading from context or globals inside the hook unless that’s the hook’s sole purpose. Easier to test and reason about.

## File and naming

- **One hook per file** when the hook is non-trivial; file name: `use-<name>.ts` (e.g. `use-market-filters.ts`, `use-pagination.ts`). Reusable hooks → `src/hooks/`; feature-specific → feature’s `hooks/` subdirectory.
- **Co-locate utilities** — `<hook-name>.utils.ts` next to the hook for helpers used only by that hook; `<main-component-name>.utils.ts` next to the main component for helpers used by main component and its sub-components; shared logic → `src/utils/` or domain-specific utils module.
