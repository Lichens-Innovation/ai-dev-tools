# design

A plugin for running a **Claude Design ↔ Storybook/Chromatic** design-iteration loop against a React codebase.

You explore look-and-feel fast and cheaply inside a [Claude Design](https://claude.ai/design) project, then a Claude Code session implements the approved result in your real components — grounded in your design tokens, verified with Playwright screenshots and Storybook tests, and published to Chromatic.

## Skills

| Skill | Role |
|-------|------|
| `design-init` | One-time setup orchestrator for an existing React project. Runs the setup sub-skills below and verifies the result. |
| `design-palette` | Creates/normalizes a CSS theme palette file (the **canonical source of truth** for design tokens). Used by `design-init`. |
| `storybook-init` | Installs Storybook, wires the Storybook MCP server, and confirms Playwright can screenshot stories. Used by `design-init`. |
| `chromatic-init` | Adds Chromatic visual testing (the publish/approval gate). Runs after `storybook-init`. Used by `design-init`. |
| `design-loop` | The runtime skill. Reads the approved target from Claude Design and implements it in React, converging via screenshots + tests, then pushes to Chromatic. |

## The contract

All four skills agree on one shared contract — the manifest schema, the Claude Design ↔ local mapping, the approval signal, and the token-reconciliation rules. See [`references/design-contract.md`](./references/design-contract.md). Read it before changing any skill.
