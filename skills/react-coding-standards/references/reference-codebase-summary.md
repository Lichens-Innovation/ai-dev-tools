# Reference codebase summary

This document summarizes **concrete patterns** observed in a reference frontend (e.g. Vite + React + TypeScript). Use it to align new or refactored code with the same style when a reference codebase is available. The table in the main skill links to this file as an optional source.

## Tooling

| Concern   | Typical setup |
| ---------|--------------- |
| Lint     | ESLint flat config (`eslint.config.js`), `js` + `typescript-eslint` + `react-hooks` + `react-refresh` |
| TypeScript | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, path alias `~/*` → `./src/*` |
| Tests    | **Vitest** (`describe`, `it`, `it.each`, `vi.spyOn`, `vi.clearAllMocks`) or Jest; same AAA + factory patterns |
| Scripts  | `yarn lint` / `npm run lint`, `yarn test` / `vitest` |

## File and module naming

- **Hooks**: `use-<name>.ts` (e.g. `use-conversations.ts`, `use-message-feedback.ts`).
- **Utils**: `<domain>.utils.ts` (e.g. `chat.utils.ts`, `date.utils.ts`, `keyboard.utils.ts`).
- **Stores**: `<domain>.store.ts` + `<domain>.types.ts` (e.g. `app.store.ts`, `app.types.ts`).
- **Components**: kebab-case files; feature folders (e.g. `components/chat/`, `components/header/`).
- **API**: `api/`, `api/<domain>.utils.ts`, `api/axios-client.ts`, `api/index.ts` for re-exports.

## TypeScript and functions

- **No `any`**: Use `interface` / `type`; explicit return types on public APIs when helpful.
- **Interfaces over types**: Prefer `interface` for object shapes; use `type` for unions, literals, `Record<K, V>`, or when it simplifies syntax.
- **Params**: For 2+ arguments, use a single options object and an interface above the function; destructure in the signature.
- **Arrow functions**: Prefer `const fn = (...) => ...` for top-level logic; reserve `function` for hoisting when needed.
- **Nullish / blank checks**: Use `isNullish`, `!isNullish`, `isBlank`, `isNotBlank` from `@lichens-innovation/ts-common` for readable conditions instead of raw `=== null` / `=== undefined` / trim checks.
- **Time periods**: Use `PeriodsInMS` from `@lichens-innovation/ts-common` (e.g. `5 * PeriodsInMS.oneMinute`) instead of magic numbers like `5 * 60 * 1000` for staleTime, gcTime, timeouts, etc.
- **Nullish**: Use `??` for defaulting; avoid `||` when 0/''/false are valid.
- **Optional params**: Prefer `param?: Type` over `param: Type | undefined`.
- **Exports**: Prefer named exports (`export const`, `export interface`); use `export default` only when required (e.g. framework or tool convention).

## React components

- **Signature**: `FunctionComponent<Props>` with destructured props: `({ prop1, prop2 }: Props) => ...`.
- **Handlers**: Simple one-liner → inline in JSX; multi-step or state → named handler (e.g. `const onMessageClick = () => { ... }`).
- **No render helpers**: Extract sub-components instead of `renderXyz()` or `useCallback` returning JSX.
- **Hooks**: Return data and handlers only; no JSX from hooks.
- **Toggle state**: When `@uidotdev/usehooks` is in the project, prefer `useToggle()` for dialogs, modals, and other boolean UI toggles (open/close, show/hide).
- **State updates**: Use functional updater when the next state depends on the previous: `setX(prev => ...)`.
- **Booleans in JSX**: Explicit conditions (e.g. `items.length > 0 && <List />`) to avoid rendering `0`.

## Naming in code

- **Booleans**: Prefix with `is`, `has`, `should`, `can`, or `will` (e.g. `isAssistant`, `hasMessage`, `canSubmit`, `shouldDisplayChatTools`).
- **Stores**: Selectors like `useSelectedMessageId`, `useSetSelectedMessageId`; state slices and setters clearly named.

## Tests (Vitest or Jest)

- **Structure**: `describe` → `it`; AAA with `// arrange`, `// act`, `// assert` comments.
- **Parametrized**: `it.each\`...\`` with table; one test body, multiple rows.
- **Mocks**: Factory (e.g. `buildMessage(overrides?: Partial<ChatMessage>)`) instead of shared mutable objects; use `vi.spyOn` or `jest.spyOn` for hook/module mocks.
- **Queries**: Prefer `screen.getByRole`, `screen.getByText`; avoid `getByTestId` unless necessary.

## React Native–specific (when applicable)

- Prefer `Pressable` over `TouchableOpacity`.
- Use `useWindowDimensions` instead of `Dimensions.get`.
- Prefer `gap` / `rowGap` / `columnGap` over margin for spacing between flex children.

When the reference app is **web-only** (e.g. Vite + React + antd), React Native–specific rules do not apply; use semantic HTML and CSS (e.g. Flex, gap) instead.
