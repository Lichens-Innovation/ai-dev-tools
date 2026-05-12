# AI Dev Tools Command Center

A management dashboard for AI development tools, plugins, and marketplace resources.

## Getting Started

To run this application:

```bash
yarn install
yarn run dev
```

## Building For Production

```bash
yarn run build
```

## Testing

This project uses [Vitest](https://vitest.dev/) for testing:

```bash
yarn run test
```

## Linting & Formatting

```bash
yarn run lint
yarn run format
yarn run check
```

## Features

- **Command Center** — View installed Claude plugins and available slash commands
- **Usage Stats** — Track token usage and costs across sessions, blocks, daily, and monthly views
- **Project Marketplace** — Browse plugins, skills, agents, and rules defined in your project
- **Curated Plugins** — Discover verified plugins from trusted sources (Anthropic Official, Astral)
- **Documentation Search** — Full-text search across project documentation with instant navigation

## Project Structure

```
src/
  store/              # TanStack Store state management
    search-store.ts   # Documentation search state
    sidebar-store.ts  # Sidebar toggle state
    stats-store.ts    # Usage stats cache state
  utils/              # Server functions and utilities
    helpers.ts        # Shared parsing utilities and path constants
    stats.ts          # Usage stats server functions
    plugins.ts        # Installed & project marketplace plugins
    marketplace.ts    # Curated external marketplace plugins
    rules.ts          # Project rules server functions
    commands.ts       # Claude Code command parsing
    docs.ts           # Documentation content server functions
  routes/             # TanStack Router file-based routes
  components/         # React components
    tabs/             # Feature tab components
```

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React, SSR-first, Vite-based)
- **Router**: [TanStack Router](https://tanstack.com/router) — file-based routing
- **State**: [TanStack Store](https://tanstack.com/store)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui

## Learn More

- [TanStack Start](https://tanstack.com/start)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Store](https://tanstack.com/store)
