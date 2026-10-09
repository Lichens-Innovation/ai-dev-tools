# design

A plugin for running a **design ↔ Storybook/Chromatic** design-iteration loop against a React codebase, with one of two backends:

- **Claude Design**: you explore look-and-feel fast and cheaply inside a [Claude Design](https://claude.ai/design) project.
- **Local design studio**: you explore in a studio that runs on your machine in Docker, on a `design/` folder of your repo (references captured from your Storybook and app, proposals edited visually or by Claude). No account, nothing leaves the machine.

Then a Claude Code session implements the approved result in your real components — grounded in your design tokens, verified with Playwright screenshots and Storybook tests, and published to Chromatic.

The backend is chosen once, in `/design-init`, and recorded as `backend` (`"claude-design"` or `"local"`) in `design.manifest.json`. A project without `backend` is a Claude Design project, exactly as before.

![The design loop: sync up, explore in Claude Design, approve, implement with design-loop, publish to Chromatic, re-sync](./docs/design-loop.svg)

## Prerequisites

Both backends need Node 22.18+ (the palette generator), Playwright (installed by `/storybook-init`) and a Storybook for the components.

### Claude Design backend

Make sure that you have the Claude Design MCP installed and Claude Code's DesignSync enabled:

1. Install the Claude Design MCP: `claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp`
2. In Claude Code, run `/design-login`
3. Check in `/plugins` that the MCP connection is successful; if not, select the MCP and reconnect.
4. Check that `/design sync` is listed. The plugin uses the built-in DesignSync tool to create the design-system project and to upload the palette card. If only `/design consent` and `/design revoke` show up, look in the project's `.claude/settings*.json` for:
   - `"DesignSync"` in `permissions.deny`: remove it.
   - `"disableBundledSkills": true`: set it to `false`, and turn off the bundled skills you do not want with `skillOverrides` (`"<skill>": "off"`).

   Then start a new session.

### Local backend

- Docker, to run the studio (one container per project, on `127.0.0.1` only).
- A checkout of this repository (ai-dev-tools): the studio is `apps/design-studio` in it. `/design-studio` finds it from the plugin's own location, or from `AI_DEV_TOOLS_DIR`.
- Nothing else: no Claude Design MCP, DesignSync or `/design sync`.

## Installation

In Claude Code, run `/design-init`. It asks which backend, checks the prerequisites of that backend and what the project already has (Tailwind, Storybook, Chromatic), asks before changing anything, treats Tailwind and Chromatic as optional, and reviews an existing Storybook for the loop. It runs `/storybook-init` and `/chromatic-init` for you; run
those directly only to (re)configure one piece.

With the local backend it also creates `design/`, captures every mapped component from its Storybook, starts the studio and registers its MCP server.

## Usage

### Local design studio

1. `/design-studio` starts the project's studio (or opens it when it runs) and registers the `design-studio` MCP server at project scope (commit the `.mcp.json` it writes). `/design-studio rebuild` rebuilds the image after you update the ai-dev-tools checkout.
2. In the studio, open a component, **Create proposal**, and edit it: move, resize, retext, restyle, swap a token for another one, or change the palette in the footer. Or ask Claude to write the proposal through the studio's MCP tools.
3. Run `/design-loop`. The first time it finds a proposal it asks whether to implement it and records `status: approved`; it diffs the proposal against its reference (the `<style data-studio>` rules and the DOM changes), implements it, converges on screenshots of the studio's render of the proposal, and writes `lastImplementedHash`.
4. After a code change, `/design-refresh` tells you which references are behind their code (the component's sources or story changed since capture) and re-captures them. It refuses to overwrite a reference someone edited. `/design-refresh add the Home page` captures a screen from the running app: **that snapshot contains whatever data the dev app shows, and `design/` is committed**, so capture on seeded sample data ([`references/local-studio.md`](./references/local-studio.md#sample-data)).

### Claude Design

In Claude Design, change the palette card, or ask for a proposal of a component change
(`proposals/<name>.html`, see [`references/proposals.md`](./references/proposals.md)), then in
Claude Code run `/design-loop`. The first time it finds a proposal it asks whether to implement
it and records `status: approved` in `design.manifest.json`; after that, each new edit of the
proposal is picked up without asking again.

To design a whole page, bring it in first: `/design-refresh add the Home page` (or tell
`/design-loop` to). It rebuilds the page as a mockup from the synced components, checked against
the running app, with no change to the app ([`references/screens.md`](./references/screens.md)).
Propose changes in `proposals/screens/<name>.html` and approve them like a component.

Run `/design-refresh` to bring Claude Design up to date with the code (design-loop offers it
after implementing): it tells you when the components are behind their code (then run
`/design-sync`, which only you can start), and rebuilds the mockups whose screen changed.
After updating the design plugin, it also offers the newer `palette.ts`, proposal conventions,
navbar and cards (`design.manifest.json` records the plugin version the project is at).

## Skills

| Skill            | Role                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-init`    | One-time setup orchestrator for an existing React or React Native project. Asks which backend (Claude Design or the local studio), runs the setup sub-skills below and verifies the result. For the local backend it creates `design/`, captures the components and starts the studio.                                                                                                                  |
| `design-palette` | Creates or migrates the canonical theme palette (light/dark inputs → scales → semantic tokens), generates one theme shared by web and React Native plus namespaced Tailwind utilities (`text-noa-muted`) or Sass names (`$text-muted`), carries hand-authored spacing, type and breakpoint tokens for projects without Tailwind, copies the generator (`palette.ts`, Node 22.18+) into the repo with a `palette` package script, audits contrast, and provides a live palette card for Claude Design that edits the colors, the hand-authored token values and, in its Advanced view, which token each semantic token points to. Used by `design-init`. |
| `storybook-init` | Installs Storybook, wires the Storybook MCP server, and confirms Playwright can screenshot stories. Used by `design-init`.                                                                                                                                                                                                                                                                            |
| `chromatic-init` | Adds Chromatic visual testing (the publish/approval gate). Runs after `storybook-init`. Used by `design-init`.                                                                                                                                                                                                                                                                                        |
| `design-loop`    | The runtime skill. Reads an approved component or screen proposal (or the palette) from the project's backend, Claude Design or the local studio, and implements it in React, converging via screenshots + tests, then pushes to Chromatic. Routes page and refresh requests to `design-refresh`.                                                                                                     |
| `design-refresh` | The one skill for updating the backend from the code. Local studio: reports which captured references are behind their code and re-captures them. Claude Design: says when the components need a `/design-sync`, rebuilds stale screen mockups, offers new screens, and adds a named page or fixes a mockup, checked against screenshots of the running app. After a plugin update it brings the project's copies of the plugin's files (`palette.ts`, the proposal conventions in the design-sync readme header, the navbar, the palette and Tailwind cards) up to date, keeping the card's data and the project's wording; `design-loop` runs the same check before implementing.                         |
| `design-help` | Shows this README in the browser, or in the console with `/design-help console`. Run it yourself. |

## Commands

| Command          | Role                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/design-studio` | Local backend. Starts or opens the project's studio container (finding the ai-dev-tools checkout itself) and registers the `design-studio` MCP server once, at project scope. `rebuild` rebuilds the image. |

## The contract

All the skills agree on one shared contract — the manifest schema, the Claude Design ↔ local mapping, the approval signal, and the token-reconciliation rules. See [`references/design-contract.md`](./references/design-contract.md). Read it before changing any skill.

The skills never branch on the backend: they call five named operations (List targets, Fetch target, Stage render, Check references, Refresh references; contract §8), and each backend implements them in its own doc: [`references/backends/claude-design.md`](./references/backends/claude-design.md) (DesignSync and the `ds-bundle` steps) and [`references/backends/local.md`](./references/backends/local.md) (`local-backend.mjs` and `capture.mjs`). The local files and the sample-data rule are in [`references/local-studio.md`](./references/local-studio.md).
