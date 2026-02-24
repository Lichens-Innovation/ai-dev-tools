# Pre-output validation (mandatory)

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
- [ ] Async data (loading + error + result): TanStack Query used (useQuery/useMutation); query key factory (e.g. XxxQueryKey.list(), .detail(id)) when adding or changing queries
