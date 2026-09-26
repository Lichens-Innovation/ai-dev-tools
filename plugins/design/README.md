# design

A plugin for running a **Claude Design ↔ Storybook/Chromatic** design-iteration loop against a React codebase.

You explore look-and-feel fast and cheaply inside a [Claude Design](https://claude.ai/design) project, then a Claude Code session implements the approved result in your real components — grounded in your design tokens, verified with Playwright screenshots and Storybook tests, and published to Chromatic.

## Prerequisites

Make sure that you have the Claude Design MCP installed:

1. Install the design-sync MCP: `claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp`
2. In Claude Code, run `/design-login`
3. Check in `/plugins` that the MCP connection is successful; if not, select the MCP and reconnect.

## Installation

In Claude Code, run `/design-init`. It runs `/storybook-init` and `/chromatic-init` for you; run
those directly only to (re)configure one piece.

## Usage

In Claude Code, run `/design-loop`.

## Skills

| Skill            | Role                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-init`    | One-time setup orchestrator for an existing React or React Native project. Runs the setup sub-skills below and verifies the result.                       |
| `design-palette` | Creates/normalizes a CSS theme palette file (the **canonical source of truth** for design tokens). Used by `design-init`.                                 |
| `storybook-init` | Installs Storybook, wires the Storybook MCP server, and confirms Playwright can screenshot stories. Used by `design-init`.                                |
| `chromatic-init` | Adds Chromatic visual testing (the publish/approval gate). Runs after `storybook-init`. Used by `design-init`.                                            |
| `design-loop`    | The runtime skill. Reads the approved target from Claude Design and implements it in React, converging via screenshots + tests, then pushes to Chromatic. |

## The contract

All four skills agree on one shared contract — the manifest schema, the Claude Design ↔ local mapping, the approval signal, and the token-reconciliation rules. See [`references/design-contract.md`](./references/design-contract.md). Read it before changing any skill.
