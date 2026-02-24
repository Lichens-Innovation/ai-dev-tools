# Non-negotiable rules (apply before anything else)

Rules are ordered by impact on **readability**, **maintainability**, **comprehensibility**, and **evolvability** — highest impact first.

1. **NEVER mutate** objects or arrays — always use spread (or immutable methods). Mutations break predictability, debugging, and React's model; they make refactors and evolution risky.
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
20. **Prefer TanStack Query (React Query)** for any async call that involves loading state, error state, and result data — use `useQuery` (or `useMutation` for writes) instead of manual `useState` + `useEffect`. Use a query key factory (e.g. `XxxQueryKey.list()`, `XxxQueryKey.detail(id)`) as single source of truth for cache keys. See [query key example](query-keys-example.ts) and [hook template](../assets/hook-tanstack-query-template.ts).
