# Naming conventions

**Global rule for file naming: kebab-case everywhere** — no camelCase, PascalCase, or snake_case in file or folder names.

## File with suffixes by intent

| Intent | Prefer | Avoid |
|--------|--------|-------|
| React hooks | `use-<name>.ts` | `usePumpTest.ts`, `pumpTestHook.ts` |
| Pure utilities | `<domain>.utils.ts` | `pumpUtils.ts`, `utils/pump.ts` without suffix |
| Type definitions | `<domain>.types.ts` | `types.ts` generic at root |
| Store / state | `<domain>.store.ts` | `appStore.ts`, `store.ts` generic |
| Constants | `<domain>.constants.ts` | `appConstants.ts`, `const.ts` |
| Generated code | `*.gen.ts` | `types.generated.ts` |
| Mock / fixture data | `*.data.ts` or `*-mock.data.ts` | `mock.ts`, `fixtures.ts` without domain |
| Config | `<domain>-config.ts` | `config.ts` too generic |
| API client | `*.client.ts` or `*-client.ts` | `client.ts`, `api.ts` for client only |
| Query keys | `query-keys.ts` in scope | `queryKeys.ts`, `keys.ts` |

## File prefixes by intent

| Intent | Prefer | Avoid |
|--------|--------|-------|
| Page / screen component | `*-page.tsx` | `HomePage.tsx`, `page.tsx` |
| Dialog | `*-dialog.tsx` | `Dialog.tsx`, `Modal.tsx` for dialog UI |
| Section (sub-area of screen) | `section-*.tsx` | `TechnicalSpecifications.tsx` without prefix |
| Action (button / handler UI) | `action-*.tsx` | `EditButton.tsx`, `actions.tsx` |
| App shell / layout | `app-*.tsx` | `Side.tsx`, `Header.tsx` without app scope |
| Setting row/item | `app-setting-*.tsx` or `*-setting-*.tsx` | `ThemeSetting.tsx` without scope prefix |
| Table-related | `*-table.tsx`, `*-table-columns.tsx` | `Table.tsx`, `Columns.tsx` without domain |
| Provider component | `*-provider.tsx` | `ThemeProvider.tsx` (PascalCase file) |
| Feature card | `*-card.tsx` or `*-info-card.tsx` | `Card.tsx` for feature-specific cards |

## Folder structure

| Purpose | Prefer | Avoid |
|---------|--------|-------|
| Feature / screen | kebab-case, one concept per folder (`test-list`, `pump-models`) | `testList`, `TestList`, `test_list` |
| Sub-folders per feature | `components`, `hooks`, then feature-specific | `Components`, mixed casing |
| Shared UI | `components/ui` for primitives, `components/<domain>` for domain | `components/UI`, `components/Button` |
| API layer | `api`, `api/generated` for generated code | `API`, `services/api` for same concern |
| Global state | `store` | `stores`, `state` |
| Auth | `auth` with optional `auth/hooks` | `authentication`, `Auth` |
| Utilities | `utils` at src root or per-domain | `Utils`, `helpers`, `lib` |
| Feature-specific hooks | colocated under the feature: `<feature>/hooks/use-*.ts` | Dumping all hooks in a global `hooks/` folder |

## Additional file/folder rules

- Avoid generic filenames at root (`utils.ts`, `types.ts`) → prefer `logger.utils.ts`, `auth.types.ts`
- Avoid a dedicated types file when types have a single consumer → colocate the interface immediately above the component or the method that uses it
- Avoid unclear abbreviations in filenames (`export2xlsx.tsx`) → `export-to-xlsx.tsx`
- Avoid deep nesting without clear boundaries → flat structure per feature; add sub-folders only when grouping is needed

## Well known units

- **Hooks**: `use-<name>.ts` (e.g. `use-conversations.ts`, `use-message-feedback.ts`).
- **Utils**: `<domain>.utils.ts` (e.g. `chat.utils.ts`, `date.utils.ts`, `keyboard.utils.ts`).
- **Stores**: `<domain>.store.ts` + `<domain>.types.ts` (e.g. `app.store.ts`, `app.types.ts`).
- **Components**: kebab-case files; feature folders (e.g. `components/chat/`, `components/header/`).
- **API**: `api/`, `api/<domain>.utils.ts`, `api/axios-client.ts`, `api/index.ts` for re-exports.
