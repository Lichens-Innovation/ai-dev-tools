# TypeScript — Coding Standards

Apply these rules by default when writing or modifying any TypeScript code. If you really need concrete code examples of a specific rule, see [coding-examples/common-coding-patterns.md](../coding-examples/common-coding-patterns.md).

| Avoid | Prefer |
|-------|--------|
| `any` for type definitions | `interface` for object shapes; `type` for unions/aliases/`Record` |
| `type` for object shapes when `interface` fits | `interface`; use `type` only when it simplifies (unions, literals, mapped types) |
| `export default` | Named exports: `export const`, `export interface`, `export type` |
| `function` declarations for top-level/module logic | Arrow functions assigned to `const`: `const fn = () => {}` |
| Nested ternaries (3+) | Early returns |
| Deeply nested `if/else` | Guard clauses with early returns |
| `let` when value never reassigned | `const` |
| `\|\|` for null/undefined fallback | `??` (nullish coalescing) |
| `!=` loose inequality | `!==` strict inequality |
| `param: Type \| undefined` for optional params | `param?: Type` |
| `array.find(...) !== undefined` for existence | `array.some(...)` |
| Multiple `=== x \|\| === y \|\| === z` comparisons | `VALID_VALUES.includes(value)` |
| Nested `try-catch` blocks | Flat `try-catch` |
| `catch (e) { throw e; }` (re-throw with no value) | Log the error or let it propagate naturally |
| Silent empty `catch` block | `console.error(...)` at minimum |
| Custom index signatures `{ [key: string]: T }` | `Record<K, T>` |
| Inline typing inside function parameters | Extract and export an interface placed immediately above the function |
| Positional params when function has 2+ arguments | Single destructured param with interface above: `({ a, b }: MyArgs)` |
| Complex expressions inside template literals | Destructure into named variables first |
| Enums with implicit ordinal values | Enums with explicit numeric values (`Admin = 1`) |
| `// TODO` without ticket reference | `// TODO: TICKET-123 - description` |
| Verbose `!== null && !== undefined` checks | `isNullish(v)` / `isBlank(v)` / `isNotBlank(v)` from `@lichens-innovation/ts-common` |
| Magic number durations (`5 * 60 * 1000`) | `5 * PeriodsInMS.oneMinute` from `@lichens-innovation/ts-common` |
| **Naming** | |
| Generic boolean names (`active`, `enabled`, `valid`) | Descriptive prefixes: `is/has/should/can/will` (`isActive`, `hasPermissions`, `shouldSave`) |
| Single-letter variables (`n`, `d`, `e`, `x`) | Descriptive names (`node`, `userProfile`, `error`) |
| Opaque abbreviations (`fn`, `cb`, `el`) | Domain-meaningful names (`formatName`, `onSubmit`, `inputElement`) |
