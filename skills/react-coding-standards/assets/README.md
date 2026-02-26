# Assets — ESLint for react-coding-standards

Ready-to-use ESLint configs aligned with the skill references (coding, React, unit testing). Versions and layout match usage in real projects (ESLint 10, TypeScript projectService, globals, globalIgnores).

## Files

| File | Usage |
|------|--------|
| `eslint.config.js` | **Main config** (ESLint 9+ flat config). Copy to project root. |
| `eslint.config.with-todo.js` | Same config + TODO ticket reference rule. Uses local rule (no extra dep). |
| `eslint-rules/todo-ticket-ref.js` | Local rule for TODO ticket ref. Copy with `eslint.config.with-todo.js`. |
| `package.json.snippet` | `devDependencies` and `scripts` excerpt to merge into the project `package.json`. |

## Quick setup (flat config — ESLint 10+)

1. Copy `eslint.config.js` to the repo root (or import it from this folder).
2. Install dependencies (see `package.json.snippet`):

```bash
yarn add -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-testing-library globals
```

3. Ensure `package.json` includes something like:

```json
"scripts": {
  "lint": "eslint .",
  "lint:fix": "eslint . --fix"
}
```

4. Run: `yarn lint`

**Note:** The config uses `projectService: true` and `tsconfigRootDir: import.meta.dirname` — your project must have a `tsconfig.json` (or `tsconfig.app.json`) at the root. Adjust `globalIgnores` in the config if you have generated code (e.g. `src/api/generated/**`, `src/components/ui/**`).

## Optional: TODO with ticket reference

To require a ticket reference (JIRA, Linear, etc.) in TODO comments:

1. Copy `eslint-rules/todo-ticket-ref.js` into your repo (e.g. `eslint-rules/todo-ticket-ref.js`).
2. Use `eslint.config.with-todo.js` as the entry config, or merge the `todo-plz/ticket-ref` block from that file into your `eslint.config.js`.

No extra dependency: the rule is provided locally and replaces `eslint-plugin-todo-plz` for this use case. You can override the `pattern` option for your tool (e.g. `([A-Z]+-\\d+)` for JIRA).

## Rules applied (summary)

- **Coding**: `no-explicit-any`, `prefer-const`, `eqeqeq`, `no-nested-ternary`, `no-empty` (catch), `no-useless-catch`, `prefer-nullish-coalescing`, `consistent-indexed-object-style`, `max-depth`
- **React**: `no-array-index-key`, `jsx-fragments`, `react-hooks/*`
- **Tests**: `testing-library/prefer-screen-queries`

Details and analysis in `references/eslint-migration-analysis.md`.
