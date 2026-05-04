---
paths:
  - "**/*.tsx"
---

# React component rules

## HIGH
- Components >~150 lines → break into subcomponents
- No `renderXyz()` inline functions → extract as named components
- No JSX stored in variables (`labelNode`, `textNode`) → small declared components with props
- Complex filter/sort/format logic → external `*.utils.ts` file
- Pure TS logic in component → extract to `<name>.utils.ts`
- Hooks return data/handlers, not JSX
- `useCallback` only for event/user interaction handlers; not for render helpers
- No premature `useMemo` for cheap scalar/string computations
- Conditional rendering → early returns over nested ternaries in JSX

## MEDIUM
- Static constants/functions (no props/state dep) → outside component body
- Pure TS handlers → `component.utils.ts`; 1-liner → inline; complex+state → named `handle*` function
- No double-arrow handler factories (`const h = (id) => () => fn(id)`)
- Conditional guard in event prop → dedicated handler with early return instead of inline `&&`
- `use` prefix only for real hooks (using useState/useEffect/etc.)
- Store selected item by ID (`selectedItemId`), derive full object from list
- Prop seeding state → name it `initialXxx` (e.g. `initialSortOrder`)
- Destructure props in function signature: `({ foo, bar }: Props)` not `(props: Props)`
- Set default values in destructuring: `{ color = "light" }` not post-destructure assignment
- `useEffect` with timers/subscriptions/listeners → always return cleanup function
- State updates dependent on current state → functional updater: `setState(prev => ...)`
- `useState` / `useRef` → explicit generic type when not inferable: `useState<string>()`

## LOW
- Boolean toggles → `useToggle` from `@uidotdev/usehooks` when available
- React Native spacing → `gap`/`rowGap`/`columnGap` over `margin`/`padding` between siblings
- React Native press → `Pressable` over `TouchableOpacity`
- Grouping → `<>...</>` not wrapper `<div>`/`<View>`
- Fragment shorthand `<>` not `<Fragment>` (use `<Fragment key=...>` only when key needed)
- String literal props → `text="foo"` not `text={"foo"}`
- Children-renderable props → `ReactNode` not `JSX.Element | null | undefined`
- Components with `children` → `PropsWithChildren<Props>` not manual `children: ReactNode`
- Refs → `ElementRef<"div">` not `HTMLDivElement`
- Conditional render → explicit boolean: `items.length > 0 &&` not `items.length &&`
- List `.map()` keys → stable unique ID, not array index
