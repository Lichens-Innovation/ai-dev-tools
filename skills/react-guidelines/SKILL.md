---
name: coding-standards
version: 1.0.0
last-updated: 2026-02-21
changelog:
  - 1.0.0: Initial version
description: |
  LOAD THIS SKILL when: creating or editing any TypeScript, JavaScript, React, or Node.js file,
  naming variables/functions/components, designing API endpoints, handling async operations,
  structuring React components, reviewing code for quality, refactoring existing code,
  or setting up a new project structure. Also trigger when the user asks "how should I name...",
  "what's the best way to...", "is this good practice...", or "can you review this code".
  DO NOT load for: CSS-only changes, documentation writing, JSON config edits, shell scripts.
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Coding Standards & Best Practices

## ⚠️ NON-NEGOTIABLE RULES (apply before anything else)

1. **NEVER mutate** objects or arrays — always use spread operator
2. **NEVER use `any`** type in TypeScript — define proper interfaces
3. **ALWAYS use arrow functions** — never the `function` keyword for top-level or module-level functions (`const fn = () => {}`)
4. **ALWAYS handle errors** in async functions with try/catch
5. **Functions MUST stay under 50 lines** — split if needed
6. **Files MUST stay under 800 lines** — split if needed
7. **NO magic numbers** — extract as named constants
8. **NO deep nesting** (max 4 levels) — use early returns
9. **Prefer `??` over `||`** for null/undefined — use nullish coalescing (`??`) so that `0`, `""`, and `false` are not treated as missing
10. **NO inline types** — extract types/interfaces to named declarations (DRY, reuse, single source of truth)

---

## Agent Instructions

After reading this skill:

1. Apply ALL rules to every file you create or modify
2. Run the **Pre-output Validation** checklist before returning any code
3. If a rule conflicts with a user request, flag it explicitly and propose a compliant alternative
4. Reference specific rule names when explaining choices (e.g., "Per the KISS principle, I simplified this by...")
5. Load example files **on demand** — only read the relevant file for the task at hand

---

## Code Quality Principles

| Principle             | Rule                                                       |
| --------------------- | ---------------------------------------------------------- |
| **Readability First** | Code is read more than written. Clear names > clever code. |
| **KISS**              | Simplest solution that works. Avoid over-engineering.      |
| **DRY**               | Extract common logic. Create reusable components.          |
| **YAGNI**             | Don't build features before they're needed.                |
| **Immutability**      | Never mutate — always return new values.                   |

---

## Sections & Example Files

### TypeScript / JavaScript

| Topic                      | Example File                            | When to load                           |
| -------------------------- | --------------------------------------- | -------------------------------------- |
| Variable & function naming | `examples/typescript/naming.ts`         | When naming anything (arrow functions only) |
| Immutability patterns      | `examples/typescript/immutability.ts`   | When working with state/objects/arrays |
| Error handling             | `examples/typescript/error-handling.ts` | When writing async code                |
| Async / Promise patterns   | `examples/typescript/async-patterns.ts` | When using await/Promise               |
| Type safety                | `examples/typescript/type-safety.ts`    | When defining interfaces/types (no inline types; no nested types; extract named types) |

### React

| Topic               | Example File                             | When to load                   |
| ------------------- | ---------------------------------------- | ------------------------------ |
| Component structure | `examples/react/component-structure.tsx` | When creating a component      |
| Custom hooks        | `examples/react/custom-hooks.tsx`        | When extracting reusable logic |
| State management    | `examples/react/state-management.tsx`    | When using useState/useReducer |

### API Design

| Topic            | Example File                       | When to load                   |
| ---------------- | ---------------------------------- | ------------------------------ |
| Response format  | `examples/api/response-format.ts`  | When writing API handlers      |
| Input validation | `examples/api/input-validation.ts` | When validating request bodies |

### Anti-patterns (read during code review)

| Topic                    | File                              |
| ------------------------ | --------------------------------- |
| All BAD patterns grouped | `anti-patterns/what-not-to-do.ts` |
| Code smells detection    | `anti-patterns/code-smells.ts`    |

---

## File Organization Rules

- **200–400 lines** typical file length
- **800 lines** absolute maximum
- One responsibility per file (high cohesion, low coupling)

```
components/Button.tsx          # PascalCase for components
hooks/useAuth.ts               # camelCase with 'use' prefix
lib/formatDate.ts              # camelCase for utilities
types/market.types.ts          # camelCase with .types suffix
```

---

## Pre-output Validation (MANDATORY)

Before returning any code, verify each point:

- [ ] Every function is **under 50 lines** → if not, split it
- [ ] No `any` types → replace with proper interfaces
- [ ] No inline types → extract to named types/interfaces (DRY, reuse)
- [ ] All async functions have **try/catch** → add if missing
- [ ] No direct mutations → convert to spread pattern
- [ ] No magic numbers → extract as named constants
- [ ] No deep nesting (>4 levels) → refactor with early returns
- [ ] No `console.log` left in production code
- [ ] File stays **under 800 lines** → split if needed
