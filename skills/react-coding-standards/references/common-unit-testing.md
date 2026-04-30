# Unit testing coding standards

Apply these rules when writing or modifying unit tests in a `React` `TypeScript` project using **Jest** or **Vitest** with React Testing Library.
Use `jest` (Jest) or `vi` (Vitest) for spies and mocks (e.g. `vi.spyOn`, `vi.clearAllMocks`, `jest.spyOn`). If you really need concrete code examples of a specific rule, see [coding-examples/common-unit-testing.md](../coding-examples/common-unit-testing.md).

| Avoid | Prefer |
|-------|--------|
| Tests without clear Arrange / Act / Assert structure | AAA pattern: distinct Arrange, Act, Assert sections |
| Destructuring `getByText` (etc.) directly from the render result | `screen.getByText` / `screen.getByRole` for consistent, readable queries |
| Mocking custom hooks without an explicit spy | `jest.spyOn` / `vi.spyOn` with explicit module imports |
| Multiple individual `it` blocks for similar test cases | `it.each` for parametrized tests |
| `getByTestId` for finding UI elements | `getByRole` (semantic, accessible queries) |
| Re-assignable object graph for mock data | Mock factory function with partial overrides |
| Tests in a separate `__tests__/` folder | `*.test.ts` / `*.spec.ts` colocated next to the source file |
