---
name: react-stack
description: The preferred React stack. Sends forms, tests, drag and drop, React Flow diagrams and React Native UI to the ai-dev-tools plugin that covers them (react-forms, react-testing, react-dnd, react-diagrams, react-mobile) and suggests installing it when it is missing; lists the default library for every other common need (state store, server state, routing, tables, UI components, icons, i18n, rich text and Markdown, HTTP, dates, ids, utilities, class names, hotkeys, charts, visibility detection). Use when choosing or adding a library to a React or React Native project, when a task needs one of these capabilities and no library is installed yet, when writing code against one of them, or when the user runs /react-stack to audit a project's stack and plugins.
---

# React stack

Default choices for React work, in two parts: needs that have their own plugin, and a list of libraries for needs that do not (yet) justify one.

## Needs covered by a plugin

These needs have a plugin in the `lichens-ai-dev-tools` marketplace whose skill goes deeper than a table row could. Check this table first.

| Need | Plugin | Skill | Library | Signals in `package.json` |
|---|---|---|---|---|
| Forms and validation | `react-forms` | `react-hook-form` | `react-hook-form` + `zod` | `react-hook-form` |
| Component, hook and context tests (not end-to-end) | `react-testing` | `react-testing-library` | `@testing-library/react` with Vitest or Jest | `@testing-library/react` |
| Drag and drop, reorderable lists, boards | `react-dnd` | `pragmatic-drag-and-drop` | `@atlaskit/pragmatic-drag-and-drop` | `@atlaskit/pragmatic-drag-and-drop` |
| Diagrams, node graphs and canvases | `react-diagrams` | `react-flow-canvas-geometry` | `@xyflow/react` (React Flow) | `@xyflow/react`, `reactflow` |
| React Native UI components | `react-mobile` | `gluestack-ui` | gluestack UI | `react-native`, `expo`, `@gluestack-ui/*` |

**Find out whether the plugin is installed** from the skills available in this session: an installed plugin's skill is listed as `<plugin>:<skill>`, e.g. `react-forms:react-hook-form`. Do not read settings files to find out; the session's skill list is the source of truth.

- **Installed:** load that skill and follow it. Tell the user the need is covered by the plugin, and do not add guidance of your own on top of it.
- **Not installed:** tell the user which plugin covers the need and give the command to install it for the project. Do not install it yourself:

  ```
  claude plugin install <plugin>@lichens-ai-dev-tools --scope project
  ```

  If the marketplace is not registered yet, it comes first: `claude plugin marketplace add Lichens-Innovation/ai-dev-tools`. Then carry on with the library in the table. The skill only becomes available in a new session after the install.

## Libraries for everything else

### How to apply this list

- **An existing project wins.** If the project already uses a library for the same job (Redux, SWR, moment, lodash, and so on), keep using it. Do not add a second one next to it, and do not migrate unless asked.
- **Use the choice when nothing is installed yet** for that need, and tell the user which library you are adding and why.
- **Do not add a library for a one-liner.** Reach for one only when the platform or a few lines of code would be clearly worse.
- Check `package.json` before installing. Install with the project's package manager.

### The list

| Need | Library | Notes |
|---|---|---|
| Client state store | `zustand` | One small store per domain, selectors to read (`useStore((s) => s.items)`), actions defined inside the store. Avoid putting server data in it. |
| Immutable updates in stores | `immer` | Use zustand's `immer` middleware, or `produce`, when updates are nested deeply. For flat state, plain spreads are enough. |
| Server state (fetching, caching, mutations) | `@tanstack/react-query` | Owns anything that comes from an API: do not copy query data into a store. Keep query keys in one place per domain. |
| Routing | `react-router` (v7), or `@tanstack/react-router` | Both are in use across projects: keep whichever the project has. For a new project, default to React Router v7 (used by most recent projects); TanStack Router is the alternative when typed params and search params or file-based routes matter. |
| Tables and data grids | `@tanstack/react-table` | Headless: you own the markup. Define columns outside the component or memoize them. |
| UI components (web) | `@base-ui/react` | The default for dialogs, menus, selects, popovers, tooltips, toasts and other interactive components: unstyled and accessible, styled with the project's own design system. Reach for it before adding a single-purpose library (no `sonner` for toasts, for instance). For React Native, see `react-mobile` above. |
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

Styling and theming are not on this list: the `design-studio` plugin covers them, and Tailwind is not assumed, so follow what the project already uses.

## Audit: /react-stack

When the user runs `/react-stack` with no other request, review the project instead of waiting for a need:

1. Read every `package.json` in the project (the root and each workspace package), skipping `node_modules`.
2. **Plugins.** For each row of the plugin table whose signals appear in the dependencies, check whether its skill is available in this session. List the missing plugins with their install command; mention the installed ones in one line.
3. **Libraries.** For each need in the library list, note which library the project uses for it. Flag only a second library doing the same job (e.g. `moment` next to `date-fns`, `axios` next to a `fetch` wrapper): a different but single choice is the project's own and is fine.
4. Report in a short list and change nothing. Install or migrate only if the user then asks.

## Maintaining this skill

When a library here grows enough usage notes to fill a page, move it into its own plugin skill: add a row to the plugin table and remove it from the list. Add a library row only for a deliberate preference, not for every dependency a project happens to have.
