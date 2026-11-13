# react-stack

The preferred React stack: which ai-dev-tools plugin covers a need, and the default library for everything else.

## Triggers

Loaded when choosing or adding a library to a React or React Native project (forms, tests, drag and drop, React Flow diagrams, React Native UI, state store, server state, routing, tables, UI components, icons, i18n, rich text and Markdown, HTTP, dates, ids, utilities, class names, hotkeys, charts, visibility detection), or when writing code against one of them. Run `/react-stack` to audit a project.

## What it contains

- **Plugin routing:** forms, tests, drag and drop, diagrams and React Native UI go to `react-forms`, `react-testing`, `react-dnd`, `react-diagrams` and `react-mobile`. If the plugin's skill is available in the session, Claude defers to it; if not, it gives the `claude plugin install` command and carries on with the listed library.
- **Library list:** the rules for applying it (an existing project's libraries win) and a table of the selected libraries with short usage notes, for example `zustand` for client state.
- **Audit mode:** `/react-stack` reads the project's `package.json` files, lists the plugins its dependencies call for that are not installed, and flags duplicate libraries doing the same job. It changes nothing.

## Related

- `design-studio` plugin: styling and theming
