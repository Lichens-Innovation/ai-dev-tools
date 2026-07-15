# Simplifying a method (filename pattern \*.ts)

Rules that apply when reducing complexity of a **function or method** (non-component).

## Long function (>40 in \*.ts)

Only apply in **`*.ts`** (plain functions) → threshold **40 lines**.

- **Signal:** Scrolling to understand a single function.
- **Fix:** Extract into smaller, **named** arrow functions. Apply **single responsibility**: each new method must stay **simple and focused on one task only** (e.g. validate → fetch → persist → notify). Each step should be testable in isolation.

## Control flow

- **Early returns** — Prefer early returns over nested if/else (max ~2 levels of nesting).
- **const over let** — Prefer const; use **reduce** or pure helpers (e.g. `const isXyz({ arg1, arg2 }: MyArgs): boolean`) with early returns instead of mutable loop accumulators.
- **Clear conditionals** — Use `Array.includes(value)` for multiple value checks; `Array.some(predicate)` for existence checks. Extract **complex expressions** into named variables (destructuring, intermediate vars) for readability.

## Parameters

- **Long parameter list (>1 param)** — see SKILL.md → Shared → Parameter object rule for the base mandate. The interface name matches the method name but starts with a capital letter and ends with `Args` (e.g. for `getThisMethod`, use `interface GetThisMethodArgs`). This rule is also enforced as a coding standard (see react-coding-standards, common-coding-patterns); during normalization, apply it to every such function.
- **Interface used only for one method** — When an interface exists solely to type a single method’s signature, **place it immediately above that method** (colocation). This self-documents the signature that follows and keeps the type next to its only consumer.
- **Boolean flag parameter** — Avoid `fn(data, true)`. Use an **options object** with a named flag (e.g. `{ userId, includeArchived }: CreateUserArgs`) or **separate functions** when behavior diverges.
- **Conventions** — Destructuring for multiple params; extract parameters into named interfaces; optional as `param?: Type`; defaults in destructuring (e.g. `{ page = 1, size = 10 }`).

## Duplication (DRY)

- **Signal:** Copy-paste with minor variations.
- **Fix:** Extract a **parameterized arrow function** (e.g. single `getMarketsForUser({ userId, status }: GetMarketsForUserArgs)` instead of `getActiveMarketsForUser` and `getClosedMarketsForUser`).

## TypeScript classes — getters for derived state

When the method lives inside a **TypeScript class**, consider extracting computed or derived values into **simple getters** before applying other simplifications.

- **Signal:** A method (or multiple methods) recomputes the same derived value inline (e.g. `this.items.filter(...).length`, `this.firstName + ' ' + this.lastName`).
- **Fix:** Extract a getter. Keep getters **simple and pure** — they should read `this` properties and return a value, with no side effects.

```ts
// Before — repeated inline computation
get label() {
  return `${this.firstName} ${this.lastName} (${this.items.filter(i => i.active).length})`;
}

// After — derived values extracted to getters
get fullName() { return `${this.firstName} ${this.lastName}`; }
get activeCount() { return this.items.filter(i => i.active).length; }
get label() { return `${this.fullName} (${this.activeCount})`; }
```

- **DRY internally** — other class methods call the getter instead of repeating the expression.
- **DRY externally** — public getters let callers read derived state without re-implementing the logic.
- **Naming** — getter name describes *what it represents*, not *how it's computed* (e.g. `activeCount`, not `getFilteredItemsLength`).
