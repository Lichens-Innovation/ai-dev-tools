---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript coding rules

## HIGH
- No `any` → `interface` for object shapes, `type` for unions/aliases/Records
- 2+ function params → single object param + interface immediately above → destructure in signature
- Nested ternary (2+) → early returns
- Catch blocks → always log error, never silence
- `!==` not `!=`
- Explicit numeric enum values (not implicit ordinals)
- Early returns over nested if/else
- Export extracted types; no inline typing for shared shapes
- No `value!` without prior runtime guard → optional chaining or explicit check
- No `as` casts → runtime validation (zod) at type boundaries
- Async calls must be awaited or have `.catch()` — no floating promises
- Independent async ops → `Promise.all`, not sequential `await`
- No `async` callback in `forEach` → `for...of` or `Promise.all(arr.map(async ...))`
- `JSON.parse` → always wrap in `try/catch`
- Throw `Error` instances (or subclasses), not strings/plain objects
- Data-fetching subtrees → wrap in `<ErrorBoundary>`
- No mutable module-level `let` as shared state → dedicated state manager
- No `var` → `const` / `let`
- Exported functions → explicit return types
- Callback-style APIs → promisify before mixing with `async/await`
- External data (API, user input) → validate with zod at boundary
- `process.env` → validate all vars with zod at startup
- No `require()` in TS/ESM → `import` / `import()`

## MEDIUM
- `const` over `let` when value not reassigned
- Flatten nested `try/catch`; don't re-throw the same error untouched
- Null/undefined checks → `isNullish(x)`, `isBlank(x)` from `@lichens-innovation/ts-common`
- Named exports over `export default` (except Next.js pages/layouts)
- Arrow functions assigned to `const` over `function` declarations
- `[a, b, c].includes(x)` over `x === a || x === b || x === c`
- No direct React state mutation → return new object
- No `await` inside loop for independent calls → `Promise.all`
- Named/tree-shakeable imports; no whole-package imports
- No `console.log` in production code → structured logger
- Deep optional chains → add `?? fallback` at the end

## LOW
- `Array.some()` over `Array.find() !== undefined`
- Durations → `PeriodsInMS` from `@lichens-innovation/ts-common`, not magic numbers
- Optional params → `param?: Type` not `param: Type | undefined`
- `Record<K, V>` over `{ [key: string]: V }` index signatures
- `interface` for object shapes; `type` for unions, mapped types, aliases
- TODO comments → include ticket ID: `// TODO [PROJ-123] description`
- `??` over `||` when default applies only to `null`/`undefined`
