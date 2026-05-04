---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Testing rules (Jest / Vitest + React Testing Library)

## HIGH
- AAA structure: `// Arrange` / `// Act` / `// Assert` comments in every `it` block
- Mock hooks via `jest.spyOn` / `vi.spyOn` on explicit `import * as mod` — not bare `jest.mock`
- Repeated similar tests → `it.each` parametrized table, not multiple `it` blocks
- Find elements by role: `screen.getByRole("button", { name: "Submit" })` not `getByTestId`
- Mock data → factory function `buildMockXxx(overrides?)` returning new object per call; not a shared mutable export object

## LOW
- Use `screen.getByText(...)` not destructured `const { getByText } = render(...)`
