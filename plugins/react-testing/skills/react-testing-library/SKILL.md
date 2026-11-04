---
name: react-testing-library
description: Test React components, hooks and context with React Testing Library (Vitest or Jest). Use when writing or fixing tests for components, custom hooks, context providers, forms, loading and error states, portals or Suspense, or when reviewing React tests for anti-patterns. Not for end-to-end tests.
---

# React Testing Library

React-specific testing patterns. Follow the project's test runner and conventions: check `package.json` and existing `*.test.tsx` files first, and match their imports, file location and naming.

## Core principles

React components are functions: props in, rendered DOM out. Test them that way.

- Test what users see and do, through props and rendered output.
- Do not test component state, component methods or implementation details.
- Do not use shallow rendering (Enzyme).
- Modern RTL cleans up after each test and wraps `render`, `userEvent` and async queries in `act` for you: no manual `cleanup()`, no manual `act()` for those.
- Build the component under test in a factory function inside each test, not in a shared `beforeEach`.

## Setup

```bash
# Vitest (adapt the runner to the project)
<package-manager> add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- Set the environment to `jsdom` (`test.environment: "jsdom"` in Vitest, `testEnvironment: "jsdom"` in Jest).
- Import `@testing-library/jest-dom` (or its `/vitest` entry) once in a setup file for matchers like `toBeInTheDocument`.
- With Vitest, either enable `globals: true` or let RTL's auto-cleanup be registered from the setup file (`afterEach(cleanup)`), since auto-cleanup needs a global `afterEach`.

## Components

Arrange, act, assert. Query through `screen`, prefer role queries, and use `userEvent` for interaction.

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

function renderCounter(props: Partial<CounterProps> = {}) {
  const onChange = vi.fn();
  render(<Counter initial={0} onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup() };
}

it("calls onChange with the new value when incremented", async () => {
  const { onChange, user } = renderCounter({ initial: 2 });

  await user.click(screen.getByRole("button", { name: /increment/i }));

  expect(onChange).toHaveBeenCalledWith(3);
  expect(screen.getByText("3")).toBeInTheDocument();
});
```

Query priority: `getByRole` (with `name`), then `getByLabelText`, `getByPlaceholderText`, `getByText`, `getByDisplayValue`, and `getByTestId` only when nothing semantic fits.

- `getBy*` throws when absent, so use `queryBy*` to assert absence: `expect(screen.queryByText("Error")).not.toBeInTheDocument()`.
- `findBy*` waits for something that appears later. Prefer it over `waitFor` + `getBy*`.
- Use `it.each` for several cases that differ only by input and output.
- Do not destructure queries from the `render` result; use `screen`.

Conditional rendering and props are tested the same way: render with different props, assert on the output.

```tsx
it("shows the empty state when there are no items", () => {
  render(<ItemList items={[]} />);
  expect(screen.getByText(/no items/i)).toBeInTheDocument();
});
```

## Guides

Read the one that matches the task before writing the tests.

| Testing | Guide |
|---|---|
| Custom hooks with `renderHook`, `result.current`, `act`, `rerender` | [references/hooks.md](references/hooks.md) |
| Context providers and consumers, the `wrapper` option, a custom `render` | [references/context.md](references/context.md) |
| Inputs, submission and validation | [references/forms.md](references/forms.md) |
| Loading states, error boundaries, portals, Suspense, timers | [references/advanced.md](references/advanced.md) |

## Test-only attributes

When no accessible query works and you have to add an attribute only for tests, always use `data-testid`, even when it marks a group of elements rather than a unique one (query those with `queryAllByTestId`). Do not invent other `data-*` names such as `data-placeholder="true"`: one rule is easier to follow and to search for.

## Anti-patterns

| Avoid | Prefer |
|---|---|
| Wrapping `render`, `userEvent` or `findBy*` in `act()` | Nothing: RTL already does it |
| Calling `cleanup()` by hand | Automatic cleanup |
| `render` inside `beforeEach`, shared across tests | A render factory called by each test |
| Asserting on state, instance methods or hook internals | Asserting on rendered output and callbacks |
| Shallow rendering | `render()` of the real tree |
| `container.querySelector` | `screen` queries by role, label or text |
| `fireEvent` for typing and clicking | `userEvent`, which fires the full event sequence |
| `waitFor(() => getBy...)` | `await findBy...` |
| Side effects inside `waitFor` | Only assertions inside `waitFor` |
| `getByTestId` for ordinary elements | `getByRole` and friends |
| Snapshot tests of whole components | Targeted assertions |
| Re-assignable shared mock data | A factory with partial overrides: `makeUser({ name: "Ana" })` |

## Checklist

- [ ] `render` from `@testing-library/react`, `screen` for queries
- [ ] `renderHook` for hooks, `wrapper` for providers
- [ ] No manual `act()` except around hook state updates, no manual `cleanup()`
- [ ] Asserts on output, not internal state
- [ ] Render factory instead of `beforeEach` render
- [ ] Role and label queries first, `data-testid` only as a last resort
- [ ] Fresh providers and mocks for every test
- [ ] Test file colocated with the source file, matching the project's naming
