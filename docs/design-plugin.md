# Design Plugin

The `design` plugin runs a **Claude Design ↔ Storybook/Chromatic** iteration loop against a React
codebase. You explore look-and-feel fast and cheaply inside a [Claude Design](https://claude.ai/design)
project, then a Claude Code session implements the approved result in your real components —
grounded in your design tokens, verified with Playwright screenshots and Storybook tests, and
published to Chromatic for team review.

The plugin is **self-contained**: everything the loop needs lives inside it, with no dependency on
other plugins in the marketplace.

## The skills

| Skill | Role |
|-------|------|
| `design-init` | One-time setup orchestrator for an existing React project. Runs the three setup skills below and writes the manifest. |
| `design-palette` | Creates/normalizes a CSS theme palette file — the **canonical source of truth** for design tokens. |
| `storybook-init` | Installs Storybook, wires the Storybook MCP server, and confirms Playwright can screenshot stories. |
| `chromatic-init` | Adds Chromatic visual testing (the publish/approval gate). Runs after `storybook-init`. |
| `design-loop` | The runtime skill. Reads the approved target from Claude Design and implements it in React, converging via screenshots + tests, then publishes to Chromatic. |

The shared contract every skill relies on — the manifest schema, the Claude Design ↔ local
mapping, the approval signal, and the token-reconciliation rules — lives in
`plugins/design/references/design-contract.md`.

## Prerequisites

- **Node.js 20+** and a package manager (npm 10+ / pnpm 9+ / Yarn 4+).
- An existing **React** project.
- Access to **Claude Design** (`claude.ai/design`) via your Claude login — the `DesignSync` tool
  uses it to push the catalog up and read approved targets back.
- A **Chromatic** account (free tier is fine) for the publish/approval gate.

## Installation

The plugin ships in the `lichens-ai-dev-tools` marketplace.

### From the marketplace (recommended)

```bash
# Register the marketplace once (GitHub shorthand)
/plugin marketplace add lichens-ai/ai-dev-tools

# Install the plugin
/plugin install design@lichens-ai-dev-tools
```

Then invoke its skills as usual: `/design-init`, `/design-loop`, etc.

### Local (for development on the plugin)

```bash
claude --plugin-dir ./plugins/design
```

You can combine it with other local plugins by repeating `--plugin-dir`.

See [plugins](./plugins.md) and [marketplace](./marketplace.md) for the general install,
enable/disable, and update mechanics.

## Workflow

The plugin has two phases: a **one-time setup** per project, then the **repeating design loop**.

### Phase 1 — Set up the project (once)

Run `design-init` from your React project root. It detects what's already present and orchestrates
the setup skills, so it's safe to re-run:

```
/design-init
```

It will, as needed:

1. **`design-palette`** — create or normalize a canonical CSS theme palette (your tokens). This
   file stays the source of truth for both token **values and structure**.
2. **`storybook-init`** — install Storybook (`npm create storybook@latest`), wire the
   [Storybook MCP server](https://storybook.js.org/docs/ai/mcp/overview), and confirm Playwright
   can screenshot a running Storybook.
3. **`chromatic-init`** — install Chromatic, store your `CHROMATIC_PROJECT_TOKEN`, add a publish
   script, and run the baseline build.
4. **Bind + manifest** — pick (or create) a Claude Design project and write `design.manifest.json`
   at the repo root: the durable mapping between Claude Design cards and your local components.

After this, `design-init` reports the palette path, Storybook/Chromatic/MCP status, and the bound
Design project.

### Phase 2 — The design loop (repeat per change)

```
  1. SYNC UP    /design-sync  → push palette + component catalog to your Claude Design project
  2. EXPLORE    iterate look-and-feel conversationally in claude.ai/design (fast, no source churn)
  3. APPROVE    flip a component (or the palette) to `status: approved` in design.manifest.json
  4. IMPLEMENT  /design-loop  → Claude Code implements the approved target in React
  5. PUBLISH    design-loop pushes to Chromatic for team visual review/approval
  6. RESTART    back to step 2 for the next change
```

**What `design-loop` does under the hood (step 4):**

1. Reads the manifest, selects components that are `approved` **and** have drifted from the last
   implemented version (a content hash of the Design target).
2. Opens a task per component to track progress.
3. Reads the exact HTML/CSS target from Claude Design (`DesignSync get_file`) and the real
   component API from the Storybook MCP (`get-documentation`).
4. **Reconciles** the target's values into your canonical CSS tokens (snapping to existing semantic
   tokens by default; asking before inventing new ones).
5. Edits the component, then **converges visually**: screenshots the changed stories with Playwright
   and compares them against the target, looping until they match.
6. **Validates** with the Storybook MCP (`run-story-tests` — accessibility + interaction).
7. **Publishes** to Chromatic and records the implemented hash back in the manifest.

### The approval signal

Approval is durable, versioned state — not a chat message. You mark a component ready by setting
`status: "approved"` on its entry in `design.manifest.json` (committed to the repo). Telling the
Claude Code session *"implement the Button, it's ready"* is just the **trigger** to run
`design-loop`; the record of what's approved lives in git.

### Token reconciliation

The canonical CSS palette wins for both values and structure. When a Design target uses a value
that isn't in the palette, the default (`reconcileRule: "canonical-wins"`) snaps it to the nearest
existing semantic token and asks you before adding a new one. Set `reconcileRule: "extend"` in the
manifest if you'd rather have new values added as new tokens automatically. Either way, the semantic
layer (e.g. `--color-primary`) is preserved so a single token change propagates to every component
that references it.

## Roles at a glance

| Piece | Job in the loop |
|-------|-----------------|
| **Claude Design** | Fast, low-stakes exploration of look-and-feel. |
| **DesignSync** | Transport both ways: push catalog up, read approved target back. |
| **Storybook MCP** | Knowledge + validation (props, changed stories, a11y/interaction tests). Does **not** screenshot. |
| **Playwright** | The eyes — the actual pixels the loop converges against. |
| **Canonical CSS** | Single source of truth for token values and structure. |
| **Chromatic** | Team-facing regression / approval gate. |
| **`design.manifest.json`** | Durable mapping + approval state tying Design cards to local components. |
