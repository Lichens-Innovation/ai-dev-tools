# React coding standards

React-specific patterns. If you really need concrete code examples of a specific rule, see [coding-examples/common-react-patterns.md](../coding-examples/common-react-patterns.md).

| Avoid | Prefer |
|-------|--------|
| `useMemo` for simple/primitive computations | Direct computation |
| `useCallback` wrapping an inline renderer | Extract to a sub-component |
| `{renderXyz()}` inline in JSX | Declare a named sub-component |
| Storing JSX in variables (`const labelNode = <...>`) | Named sub-components with props |
| Inline handler logic in event props (`onClick={() => { if (...) ... }}`) | Dedicated handler with early returns |
| `use` prefix on pure functions (no React hooks inside) | Name without `use` prefix |
| `setState(state + 1)` when depending on current state | `setState(prev => prev + 1)` |
| `useState` for a simple boolean toggle | `useToggle` from `@uidotdev/usehooks` |
| Inline filter/sort logic in the render template | Extracted utility functions |
| Hooks that return React components | Hooks for logic only; render in the component |
| `<React.Fragment>` verbose syntax | `<>` shorthand |
| Unnecessary DOM wrapper nodes for grouping | `<>` fragments |
| `props.value` direct access | Destructure in signature: `({ value, label })` |
| Setting defaults after destructuring | Defaults during destructuring: `{ label = "default" }` |
| `title={"string"}` curly braces for string props | `title="string"` without braces |
| `{items.length && <Comp />}` (renders `0` when empty) | `{items.length > 0 && <Comp />}` |
| `JSX.Element \| null \| undefined` return type | `ReactNode` |
| Manually typing `children` prop | `PropsWithChildren<Props>` |
| Omitting generic in `useState()` when not inferable | Specify explicitly: `useState<User \| null>(null)` |
| `HTMLInputElement` for refs | `ElementRef<"input">` |
| God components with too many responsibilities | Decompose into focused sub-components |
| Array index as `key` | Stable unique identifier as `key` |
| Complex business logic inline in render | Extract to pure TypeScript functions |
| `useEffect` without cleanup | Return a cleanup function |
| Custom hooks with no React hooks inside | Plain TypeScript functions |
| Storing the full object in state | Store the ID; derive the object |
| Ambiguous initial vs. current state naming | Distinct names: `initialUser` vs `user` |
