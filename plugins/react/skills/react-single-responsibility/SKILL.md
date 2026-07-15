---
name: react-single-responsibility
description: "Single-responsibility strategies to simplify components, hooks, and methods: decomposition order (utilities, hooks, sub-components), early returns, control flow, parameter design, and code smell fixes. Use when the user asks to simplify or ungodify a component, hook, function, or method."
metadata:
  version: "1.1.0"
  last-updated: "2026-07-15"
  source: "Extracted from react-ts-guidelines"
allowed-tools: Read Write Edit Grep Glob
---

# Single Responsibility — Simplify Components, Hooks & Methods

Apply these strategies to keep components, hooks, and methods focused, testable, and readable. Rules are split by **file type** into dedicated reference files — load only the one matching the code being simplified.

---

## Principles

| Principle                 | Rule                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **KISS**                  | Simplest solution that works. Avoid over-engineering.                                         |
| **Single responsibility** | One clear responsibility per component or function; extract utilities, hooks, sub-components. |
| **DRY**                   | Extract common logic; create reusable functions or components.                                |
| **Composition**           | Prefer composing small components and utilities over large, multi-purpose blocks.             |

---

## Which rules apply

Use the **file** where the function lives to pick the reference file:

- **`*.tsx`** → components → [`references/component-simplification.md`](references/component-simplification.md)
- **`use*.ts`** → hooks → [`references/hook-simplification.md`](references/hook-simplification.md)
- **`*.ts`** (plain functions) → methods → [`references/method-simplification.md`](references/method-simplification.md)

Plain TypeScript functions are always in `*.ts`, never in `*.tsx`. Load the matching reference file first, then apply the Shared rules below regardless of file type.

---

## Shared (components, hooks, and methods)

### Object destructuring

- Use **object destructuring** when reading or passing object attributes so that attribute names are explicit and the code stays readable. Applies to: **component props** (e.g. `const { isLoading, error, data } = props` or in the signature), **function parameters** (e.g. `const fn = ({ a, b }: FnArgs) => ...`), and **local objects** when you use several properties (e.g. `const { name, status } = item`). Prefer destructuring when it clarifies usage and improves readability; avoid when a single property is used once.
- **Parameter object (2+ args)** — As soon as a function has more than one parameter, use a single options object with destructuring and extract the parameter interface immediately above the signature. Applies to every function: component, hook, or method.

### Coupling (shotgun surgery)

- **Signal:** One feature change requires edits in many files.
- **Fix:** Co-locate related logic (e.g. feature folder with its own components, hooks, utils, types); reduce coupling and centralize domain logic where it belongs.

### File and size guidelines

- **`*.tsx` (components)** — Must not exceed **150 lines**. Plain functions live in `*.ts`, not in `*.tsx`.
- **`*.ts` (pure TypeScript)** — **200–400 lines** typical per file; **2000 lines** absolute maximum. Plain functions (methods) use the per-function threshold defined in [`references/method-simplification.md`](references/method-simplification.md).
- File names: **kebab-case**. Examples: `market-list-item.tsx`, `use-market-filters.ts`, `<name>.utils.ts`, (e.g. `market-list.utils.ts`).

### Quick checklist

- [ ] Does it do more than one thing? → if yes: extract pure utilities, hooks, or sub-components (component) or smaller named functions (method).
- [ ] More than 1 parameter? → see Parameter object rule above.
- [ ] Copy-pasted code? → extract and parameterize.
- [ ] Control flow deeply nested? → use early returns and intermediate variables.
- [ ] Comments explaining _what_? → rename for self-documenting code; keep comments for _why_ only.
- [ ] Inside a class and re-computing derived state? → extract a getter (`get xyz() { return ... }`) to promote DRY and simplify method bodies.
