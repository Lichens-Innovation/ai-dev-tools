# File and folder naming patterns

Table of contents:

- [File and folder naming patterns](#file-and-folder-naming-patterns)
  - [File names: suffixes by intent](#file-names-suffixes-by-intent)
  - [File names: prefixes by intent](#file-names-prefixes-by-intent)
  - [Folder names and structure](#folder-names-and-structure)
  - [Avoid / Prefer summary](#avoid--prefer-summary)

Use **kebab-case everywhere for file and folder names** — no camelCase, no PascalCase, no snake_case. The following patterns are derived from real React/TypeScript codebases and can be adapted to React Native or other TS projects.

## File names: suffixes by intent

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
| Query keys (React Query)  | `query-keys.ts` in scope                           | `providers/query-keys.ts`                                                  | `queryKeys.ts`, `keys.ts`                                   |

## File names: prefixes by intent

| Intent                         | Prefer                                                     | Example                                                                             | Avoid                                                |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Screen / page component        | `*-page.tsx` or `<feature>-page.tsx`                       | `home-page.tsx`, `test-list-page.tsx`, `pump-model-details-page.tsx`                | `HomePage.tsx`, `page.tsx`                           |
| Dialog component               | `*-dialog.tsx`                                             | `app-about-dialog.tsx`, `motor-association-dialog.tsx`, `chart-settings-dialog.tsx` | `Dialog.tsx`, `Modal.tsx` for dialog UI              |
| Section (sub-area of screen)   | `section-*.tsx`                                            | `section-technical-specifications.tsx`, `section-general-information.tsx`           | `TechnicalSpecifications.tsx` without section prefix |
| Action (button / handler UI)   | `action-*.tsx`                                             | `action-edit.tsx`, `action-generate-pdf.tsx`, `action-browse-files.tsx`              | `EditButton.tsx`, `actions.tsx`                      |
| App shell / layout             | `app-*.tsx`                                                | `app-side.tsx`, `app-header.tsx`, `app-action-settings.tsx`                         | `Side.tsx`, `Header.tsx` without app scope           |
| Setting (app setting row/item) | `app-setting-*.tsx` or `*-setting-*.tsx`                   | `app-setting-theme.tsx`, `chart-setting-compensate-losses.tsx`                      | `ThemeSetting.tsx` (no scope prefix)                 |
| Table-related                  | `*-table.tsx`, `*-table-columns.tsx`, `*-table-header.tsx` | `test-list-table.tsx`, `test-motors-table-columns.tsx`                              | `Table.tsx`, `Columns.tsx` without domain            |
| Provider component             | `*-provider.tsx`                                           | `theme-provider.tsx`, `react-query-provider.tsx`                                    | `ThemeProvider.tsx` (PascalCase file)                |
| Card component (feature)      | `*-card.tsx` or `*-info-card.tsx`                          | `pump-info-card.tsx`, `pump-chart-card.tsx`                                         | `Card.tsx` for feature-specific cards                |

## Folder names and structure

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

## Avoid / Prefer summary

- **Prefer** kebab-case for every file and folder name. **Avoid** camelCase, PascalCase, and snake_case in file/folder names (e.g. `usePumpTest.ts`, `TestList/`, `my_module/` → use `use-pump-test.ts`, `test-list/`).
- **Avoid** generic filenames at root (`utils.ts`, `types.ts`, `config.ts`). **Prefer** domain-prefixed or scoped names (`logger.utils.ts`, `auth.types.ts`, `msal-config.ts`).
- **Avoid** a dedicated types file when types have a single consumer. **Prefer** `<domain>.types.ts` when types are reused in more than one place; otherwise colocate above the component if they only serve that component, or above the method (e.g. parameter interface immediately above it) if they only serve that method.
- **Avoid** abbreviations in file names when unclear (`export2xlsx.tsx`). **Prefer** readable names (`export-to-xlsx.tsx` or `table-header-export-xlsx.tsx`).
- **Avoid** mixing suffix order (e.g. `*.utils.ts` vs `*.ts.utils`). **Prefer** consistent suffix after a dot: `<name>.<role>.ts`.
- **Avoid** putting all hooks in a single global `hooks/` folder when they are feature-specific. **Prefer** colocating `hooks/use-*.ts` under the feature (e.g. `screens/test-list/hooks/`).
- **Avoid** deep nesting without clear boundaries. **Prefer** flat structure per feature (e.g. `components`, `hooks`, `test-details`) and subfolders only when grouping (e.g. `info-sections/rpm`, `test-details/pdf`).
