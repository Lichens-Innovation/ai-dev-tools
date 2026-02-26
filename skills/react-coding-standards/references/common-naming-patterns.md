Table of Content

- [Naming patterns](#naming-patterns)
  - [File and folder naming patterns](#file-and-folder-naming-patterns)
    - [File names: suffixes by intent](#file-names-suffixes-by-intent)
    - [File names: prefixes by intent](#file-names-prefixes-by-intent)
    - [Folder names and structure](#folder-names-and-structure)
    - [Avoid / Prefer summary](#avoid--prefer-summary)
  - [Prefer Using Descriptive Prefixes for Boolean Variables in TypeScript](#prefer-using-descriptive-prefixes-for-boolean-variables-in-typescript)
    - [❌ Avoid Using Generic or Non-Descriptive Names for Boolean Variables](#-avoid-using-generic-or-non-descriptive-names-for-boolean-variables)
    - [✅ Prefer Using Descriptive Prefixes for Boolean Variables](#-prefer-using-descriptive-prefixes-for-boolean-variables)
    - [ℹ️ Explanation](#ℹ️-explanation)
    - [📚 References](#-references)

# Naming patterns

Naming conventions in a React Native TypeScript project are crucial for several reasons:

- **Readability**: Consistent naming makes the code easier to read and understand, especially for new team members or collaborators. It helps in quickly identifying the purpose of variables, functions, and files.

- **Maintainability**: Proper naming conventions contribute to maintaining the codebase over time. It makes it simpler to locate and modify code when needed, reducing the risk of introducing bugs.

- **Scalability**: As the project grows, consistent naming helps in managing and organizing the codebase. It prevents confusion and redundancy, ensuring that new components or modules fit seamlessly into the existing structure.

- **Collaboration**: When multiple developers are working on the same project, following a standard naming convention minimizes conflicts and misunderstandings. It ensures that everyone adheres to the same style, making the development process smoother.

- **Tooling and Automation**: Many development tools and automated systems rely on naming conventions to function correctly. Consistent naming aids in code generation, linting, testing, and other automated processes, enhancing overall productivity.

In summary, naming conventions are vital for readability, maintainability, scalability, collaboration, and effective use of development tools in a React Native TypeScript project.

## File and folder naming patterns

The following patterns are derived from real codebase usage. **Use kebab-case everywhere for file and folder names** — no camelCase, no PascalCase, no snake_case.

### File names: suffixes by intent

| Intent                   | Prefer                                             | Example                                                                    | Avoid                                                       |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| React hooks              | `use-<name>.ts`                                    | `use-pump-test.ts`, `use-export-csv-mutation.ts`                           | `pumpTestHook.ts`, `usePumpTest.ts` (camelCase)             |
| Pure utilities           | `<domain>.utils.ts` or `<feature>-<name>.utils.ts` | `pump.utils.ts`, `test-list-table.utils.ts`, `action-edit-dialog.utils.ts` | `pumpUtils.ts`, `utils/pump.ts` without suffix              |
| Type definitions         | `<domain>.types.ts`                                | `auth.types.ts`, `navigation.types.ts`                                     | `types.ts` (generic at root)                                |
| Store / state            | `<domain>.store.ts`                                | `app.store.ts`, `table-state.store.ts`, `ui-preferences.store.ts`          | `appStore.ts`, `store.ts`                                   |
| Constants                | `<domain>.constants.ts` or `constants.ts` at scope | `app.constants.ts`, `constants.ts`                                         | `appConstants.ts`, `const.ts`                               |
| Generated code           | `*.gen.ts`                                         | `types.gen.ts`, `sdk.gen.ts`, `client.gen.ts`                              | `types.generated.ts` (prefer short suffix)                  |
| Mock / fixture data      | `*.data.ts` or `*-mock.data.ts`                    | `test-request-list-mock.data.ts`                                           | `mock.ts`, `fixtures.ts` without domain                     |
| Unit tests               | `*.test.ts` / `*.spec.ts` next to source           | `test-list-table.utils.test.ts`                                            | Tests in separate `__tests__` only with no colocated option |
| Config                   | `*-config.ts` or `<domain>-config.ts`              | `msal-config.ts`                                                           | `config.ts` (too generic at root)                           |
| API client               | `*.client.ts` or `*-client.ts`                     | `api.client.ts`, `axios-client.ts`                                         | `client.ts`, `api.ts` for client only                       |
| Query keys (React Query) | `query-keys.ts` in scope                           | `providers/query-keys.ts`                                                  | `queryKeys.ts`, `keys.ts`                                   |

### File names: prefixes by intent

| Intent                         | Prefer                                                     | Example                                                                             | Avoid                                                |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Screen / page component        | `*-page.tsx` or `<feature>-page.tsx`                       | `home-page.tsx`, `test-list-page.tsx`, `pump-model-details-page.tsx`                | `HomePage.tsx`, `page.tsx`                           |
| Dialog component               | `*-dialog.tsx`                                             | `app-about-dialog.tsx`, `motor-association-dialog.tsx`, `chart-settings-dialog.tsx` | `Dialog.tsx`, `Modal.tsx` for dialog UI              |
| Section (sub-area of screen)   | `section-*.tsx`                                            | `section-technical-specifications.tsx`, `section-general-information.tsx`           | `TechnicalSpecifications.tsx` without section prefix |
| Action (button / handler UI)   | `action-*.tsx`                                             | `action-edit.tsx`, `action-generate-pdf.tsx`, `action-browse-files.tsx`             | `EditButton.tsx`, `actions.tsx`                      |
| App shell / layout             | `app-*.tsx`                                                | `app-side.tsx`, `app-header.tsx`, `app-action-settings.tsx`                         | `Side.tsx`, `Header.tsx` without app scope           |
| Setting (app setting row/item) | `app-setting-*.tsx` or `*-setting-*.tsx`                   | `app-setting-theme.tsx`, `chart-setting-compensate-losses.tsx`                      | `ThemeSetting.tsx` (no scope prefix)                 |
| Table-related                  | `*-table.tsx`, `*-table-columns.tsx`, `*-table-header.tsx` | `test-list-table.tsx`, `test-motors-table-columns.tsx`                              | `Table.tsx`, `Columns.tsx` without domain            |
| Provider component             | `*-provider.tsx`                                           | `theme-provider.tsx`, `react-query-provider.tsx`                                    | `ThemeProvider.tsx` (PascalCase file)                |
| Card component (feature)       | `*-card.tsx` or `*-info-card.tsx`                          | `pump-info-card.tsx`, `pump-chart-card.tsx`                                         | `Card.tsx` for feature-specific cards                |

### Folder names and structure

| Purpose                 | Prefer                                                           | Example                                                                                     | Avoid                                                    |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Feature / screen        | kebab-case, one concept per folder                               | `test-list`, `pump-models`, `test-motors`, `test-request`                                   | `testList`, `TestList`, `test_list`                      |
| Sub-folders per feature | `components`, `hooks`, then feature-specific                     | `screens/test-list/components`, `screens/test-list/hooks`, `screens/test-list/test-details` | `Components`, `HOC`, mixed casing                        |
| Shared UI components    | `components/ui` for primitives, `components/<domain>` for domain | `components/ui`, `components/pump-chart`, `components/table`                                | `components/UI`, `components/Button`                     |
| API layer               | `api`, optional `api/generated` for generated code               | `api`, `api/generated`, `api/generated/client`                                              | `API`, `services/api` for same concern                   |
| State                   | `store` for global state                                         | `store`                                                                                     | `stores`, `state`, `redux` if not using Redux            |
| Navigation              | `navigation` for router/layout                                   | `navigation`                                                                                | `routes`, `router` (unless single router file)           |
| Auth                    | `auth` with optional `auth/hooks`                                | `auth`, `auth/hooks`                                                                        | `authentication`, `Auth`                                 |
| i18n                    | `i18n` with locale subfolders                                    | `i18n`, `i18n/en`, `i18n/fr`                                                                | `locales`, `lang`, `translations` (unless team standard) |
| Utilities               | `utils` at src root or per-domain                                | `utils`, or `screens/<feature>/<feature>.utils.ts`                                          | `Utils`, `helpers`, `lib` for same intent                |

### Avoid / Prefer summary

- **Prefer** kebab-case for every file and folder name. **Avoid** camelCase, PascalCase, and snake_case in file/folder names (e.g. `usePumpTest.ts`, `TestList/`, `my_module/` → use `use-pump-test.ts`, `test-list/`).
- **Avoid** generic filenames at root (`utils.ts`, `types.ts`, `config.ts`). **Prefer** domain-prefixed or scoped names (`logger.utils.ts`, `auth.types.ts`, `msal-config.ts`). Use a dedicated `<domain>.types.ts` when types are reused in more than one place; otherwise colocate types next to their single consumer.
- **Avoid** abbreviations in file names when unclear (`export2xlsx.tsx`). **Prefer** readable names (`export-to-xlsx.tsx` or `table-header-export-xlsx.tsx`).
- **Avoid** mixing suffix order (e.g. `*.utils.ts` vs `*.ts.utils`). **Prefer** consistent suffix after a dot: `<name>.<role>.ts`.
- **Avoid** putting all hooks in a single global `hooks/` folder when they are feature-specific. **Prefer** colocating `hooks/use-*.ts` under the feature (e.g. `screens/test-list/hooks/`).
- **Avoid** deep nesting without clear boundaries. **Prefer** flat structure per feature (e.g. `components`, `hooks`, `test-details`) and subfolders only when grouping (e.g. `info-sections/rpm`, `test-details/pdf`).

_These file and folder patterns were collected from a React/TypeScript codebase (feature screens, hooks, utils, stores, API layer) and can be adapted to React Native or other TS projects._

---

## Prefer Using Descriptive Prefixes for Boolean Variables in TypeScript

Using prefixes when naming variables can make the code much easier to read and understand. Here are some tips for using prefixes when naming variables.

### ❌ Avoid Using Generic or Non-Descriptive Names for Boolean Variables

```ts
// This code uses non-descriptive names for boolean variables, making the code harder to understand
const active = true;
const enabled = false;
const valid = true;

if (active) {
  // Do something
}

if (enabled) {
  // Do something else
}

if (valid) {
  // Validate something
}
```

### ✅ Prefer Using Descriptive Prefixes for Boolean Variables

```ts
// This code uses descriptive prefixes for boolean variables, making the code more readable and maintainable
const isActive = true;
const isEnabled = false;
const isValid = true;
const hasPermissions = true;
const shouldSave = false;
const canProceed = true;
const willRetry = false;

if (isActive) {
  // Do something
}

if (isEnabled) {
  // Do something else
}

if (isValid) {
  // Validate something
}

if (hasPermissions) {
  // Check permissions
}

if (shouldSave) {
  // Save data
}

if (canProceed) {
  // Proceed to next step
}

if (willRetry) {
  // Retry operation
}
```

### ℹ️ Explanation

- **Avoid Using Generic or Non-Descriptive Names:** Using generic names like `active`, `enabled`, or `valid` for boolean variables can make the code harder to understand. It is not immediately clear what these variables represent or when they should be true or false.
- **Use Descriptive Prefixes:** Prefer using prefixes like `is`, `has`, `should`, `can`, and `will` to make the purpose of boolean variables clear:
  - `is`: Indicates a state or condition (e.g., `isActive`, `isEnabled`, `isValid`).
  - `has`: Indicates possession or presence of a property (e.g., `hasPermissions`).
  - `should`: Indicates a recommended action or condition (e.g., `shouldSave`).
  - `can`: Indicates ability or possibility (e.g., `canProceed`).
  - `will`: Indicates future action or intention (e.g., `willRetry`).
- **Readability and Maintainability:** Using descriptive prefixes improves the readability of the code by making the purpose of each boolean variable immediately clear. This also enhances maintainability by making the code easier to understand and modify.
- **Consistency:** Consistently using these prefixes helps establish a clear and understandable naming convention throughout the codebase, making it easier for all team members to follow and comprehend the code.

By following these best practices and using descriptive prefixes for boolean variables, you can create code that is more readable, maintainable, and easier to understand.

### 📚 References

- [Variable naming patterns](https://www.linkedin.com/posts/muhamadzolfaghari_variable-javascript-naming-activity-7179568278841737216-zFrX/)
