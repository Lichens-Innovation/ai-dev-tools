# Dependencies and scripts

Reference for the Node.js packages and npm/yarn scripts used by the company React/TypeScript ESLint setup.

**Versions below are examples only.** Use current compatible versions in real projects; they evolve quickly.

## devDependencies

Merge these packages into the project `package.json` or install with:

```bash
yarn add -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-testing-library globals
```

| Package | Purpose | Example version |
|--------|---------|------------------|
| `eslint` | Core linter (flat config in ESLint 9+) | ^10.0.2 |
| `@eslint/js` | Recommended JS rules | ^10.0.1 |
| `typescript-eslint` | TypeScript parser and rules | ^8.56.1 |
| `eslint-plugin-react` | React-specific rules | ^7.37.5 |
| `eslint-plugin-react-hooks` | Hooks rules | ^7.0.1 |
| `eslint-plugin-testing-library` | Testing Library best practices | ^7.16.0 |
| `globals` | Global variables (browser, node) | ^17.3.0 |

Same example versions in JSON form: [../assets/package.json.snippet.json](../assets/package.json.snippet.json).

## Scripts

Add to `package.json`:

```json
"scripts": {
  "lint": "eslint .",
  "lint:fix": "eslint . --fix"
}
```

- Use `yarn lint` / `yarn lint:fix` or `npm run lint` / `npm run lint:fix` consistently with the rest of the project.
- CI should run `lint` (without `--fix`) to fail on violations.

## Optional: no extra dependency for TODO rule

The TODO ticket reference rule is provided as a local file (`assets/eslint-rules/todo-ticket-ref.js`). No need for `eslint-plugin-todo-plz` when using this rule.
