---
name: react-selected-libraries
description: The preferred libraries for common React needs (state store, server state, routing, tables, UI components, icons, i18n, rich text and Markdown, HTTP, dates, ids, utilities, class names, hotkeys, charts, visibility detection). Use when choosing or adding a library to a React project, when a task needs one of these capabilities and no library is installed yet, or when writing code against one of them.
---

# Selected libraries for React

Default choices for React work. They are here for needs that do not (yet) justify a skill of their own.

## How to apply this list

- **An existing project wins.** If the project already uses a library for the same job (Redux, SWR, moment, lodash, and so on), keep using it. Do not add a second one next to it, and do not migrate unless asked.
- **Use the choice when nothing is installed yet** for that need, and tell the user which library you are adding and why.
- **Do not add a library for a one-liner.** Reach for one only when the platform or a few lines of code would be clearly worse.
- Check `package.json` before installing. Install with the project's package manager.

## The list

| Need | Library | Notes |
|---|---|---|
| Client state store | `zustand` | One small store per domain, selectors to read (`useStore((s) => s.items)`), actions defined inside the store. Avoid putting server data in it. |
| Immutable updates in stores | `immer` | Use zustand's `immer` middleware, or `produce`, when updates are nested deeply. For flat state, plain spreads are enough. |
| Server state (fetching, caching, mutations) | `@tanstack/react-query` | Owns anything that comes from an API: do not copy query data into a store. Keep query keys in one place per domain. |
| Routing | `react-router` (v7), or `@tanstack/react-router` | Both are in use across projects: keep whichever the project has. For a new project, default to React Router v7 (used by most recent projects); TanStack Router is the alternative when typed params and search params or file-based routes matter. |
| Tables and data grids | `@tanstack/react-table` | Headless: you own the markup. Define columns outside the component or memoize them. |
| UI components | `@base-ui/react` | The default for dialogs, menus, selects, popovers, tooltips, toasts and other interactive components: unstyled and accessible, styled with the project's own design system. Reach for it before adding a single-purpose library (no `sonner` for toasts, for instance). |
| Icons | `@phosphor-icons/react` | Import icons by name (`import { PlusIcon } from "@phosphor-icons/react"`) so unused ones are tree-shaken; pick the look with the `weight` prop. |
| Internationalization | `i18next` + `react-i18next` (+ `i18next-browser-languagedetector`) | Keep translation keys typed, and never concatenate translated fragments. |
| Rich text / WYSIWYG | `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/markdown` | Store the content as Markdown, not HTML: load it with `contentType: "markdown"` and read it back with `editor.getMarkdown()`. Check the API against the installed Tiptap version, as the Markdown extension is recent. |
| Rendering Markdown | `react-markdown` + `remark-gfm` | Renders to React elements, so no `dangerouslySetInnerHTML`. Add `rehype-raw` only for trusted content, or pair it with a sanitizer. |
| Markdown to HTML string | `markdown-it` | When you need an HTML string rather than React elements. Always pass the result through `dompurify` before injecting it. |
| HTML sanitizing | `dompurify` | Any HTML that did not come from your own code, before it reaches the DOM. |
| Fake data (tests, stories) | `@faker-js/faker` | Inside mock factories only, never in production code. Seed it for reproducible tests. |
| Keyboard shortcuts | `@tanstack/react-hotkeys` | Instead of hand-written `keydown` listeners. |
| HTTP client | native `fetch` (no axios) | One thin wrapper: base URL, auth header, JSON in and out, and throw on `!response.ok`, since `fetch` does not reject on 4xx/5xx. Pass react-query's `signal` through for cancellation. Use it from query functions. Keep axios only if the project already has it. |
| Dates | `date-fns` | Plain functions, tree-shakeable. Avoid `moment`. `dayjs` appears in older projects: keep it there, but do not use both in one project. |
| Unique ids | `nanoid` | For client-generated ids. Use `crypto.randomUUID()` when a UUID is required. |
| General utilities | `radashi` | Collection, object and async helpers (`group`, `unique`, `debounce`, `retry`…), as a lighter alternative to lodash. |
| Conditional class names | `classnames` | `classNames("base", { active: isActive })`. |
| Charts | `recharts` | Declarative chart components. |
| Visibility detection | `react-intersection-observer` | Lazy loading, infinite scroll, "in view" tracking. |
| Narrowing in effects | `tiny-invariant` | `invariant(ref.current)` instead of non-null assertions. |

## Related skills

Libraries with enough depth to have their own skill are covered there: `react-flow` (diagrams and canvases, in this plugin), `react-hook-form` (forms, in `react-forms`), `pragmatic-drag-and-drop` (drag and drop, in `react-dnd`), `react-testing-library` (tests, in `react-testing`). Styling and theming are not on this list: the `design-studio` plugin covers them, and Tailwind is not assumed, so follow what the project already uses.

## Maintaining this list

When a library here grows enough usage notes to fill a page, move it into its own skill and replace its row with a pointer under Related skills. Add a row only for a deliberate preference, not for every dependency a project happens to have.
