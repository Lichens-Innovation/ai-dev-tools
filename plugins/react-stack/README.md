# react-stack

Preferred React library stack for Claude Code.

## What's inside

- `react-stack` skill: sends forms, tests, drag and drop, React Flow diagrams and React Native UI to the plugin that covers them (`react-forms`, `react-testing`, `react-dnd`, `react-diagrams`, `react-mobile`) and suggests installing it when it is missing; lists the default library for every other common React need (state store, server state, routing, tables, UI components, icons, i18n, rich text and Markdown, HTTP, dates, ids, utilities, class names, hotkeys, charts, visibility detection).

## Use it

Install the plugin, then ask Claude to pick or add a library for a React project, or to write code against one of the listed libraries; the skill loads on its own. Run `/react-stack` to audit a project: it lists the plugins its dependencies call for that are not installed, and duplicate libraries doing the same job.

```
claude plugin install react-stack@lichens-ai-dev-tools
```
