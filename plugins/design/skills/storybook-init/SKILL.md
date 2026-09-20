---
name: storybook-init
description: "Installs and configures Storybook in a React project, wires up the Storybook MCP server, and confirms Playwright can screenshot a running Storybook - the render + knowledge half of the design loop. Used by design-init, or directly when the user wants to add Storybook or configure the Storybook MCP. Use when the user asks to add Storybook, set up component stories, or configure the Storybook MCP."
disable-model-invocation: true
---

# Storybook Init

Installs and wires the **render + knowledge** stack for the design loop: Storybook (the render
target), the Storybook MCP server (knowledge + tests), and Playwright (the screenshot "eyes").
Chromatic is a separate concern — see the `chromatic-init` skill. Usually invoked by `design-init`.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) — this skill
satisfies the render/knowledge preconditions in §6.

## Prerequisites

- **Node.js 20+**, and npm 10+ / pnpm 9+ / Yarn 4+.
- Run from the **project root** (the CLI auto-detects the framework/builder there).

## Workflow

1. **Detect what exists.** Check for an existing `.storybook/` dir, a `storybook` script in
   `package.json`, Playwright, and the Storybook MCP config. Only add what's missing (idempotent).

2. **Install Storybook (CLI, not MCP).** The Storybook MCP cannot bootstrap Storybook — its tools
   operate against a *running* Storybook, so it's chicken-and-egg. Install via the CLI from the
   project root:

   ```bash
   npm create storybook@latest
   # or: --package-manager=pnpm / yarn
   ```

   Non-interactive / explicit selection when needed:

   ```bash
   npm create storybook@latest -- --type react --features docs test a11y
   ```

   This installs deps, adds `storybook` / `build-storybook` scripts, creates `.storybook/`, and
   scaffolds example stories. Choose the **Recommended** config (docs + testing + a11y) so the MCP
   testing tools have something to run.

3. **Run and verify.** Start the dev server and confirm it serves stories locally:

   ```bash
   npm run storybook   # default: http://localhost:6006
   ```

4. **Add the Storybook MCP server.** Configure the
   [Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview) so a Claude Code session can
   reach `get-documentation`, `get-changed-stories`, `get-storybook-story-instructions`, and
   `run-story-tests` against the running Storybook. Point it at the dev-server URL (`:6006`).
   Note: the MCP does **not** screenshot — that's Playwright's job.

5. **Confirm Playwright screenshots.** Ensure Playwright is installed (`npm i -D playwright &&
   npx playwright install`) and can launch a headless browser against a running Storybook and
   capture a single story via its iframe URL
   (`/iframe.html?id=<storyId>`). Add a small screenshot helper/script if none exists — this is
   the loop's "eyes."

6. **Baseline stories (MCP-guided).** If mapped components lack stories, scaffold minimal ones so
   the MCP and Playwright have something to target. Use the MCP's `get-storybook-story-instructions`
   (now reachable) for project-aware conventions on props and interaction tests, rather than
   hand-guessing story structure.

7. **Report.**
   - Storybook run command + URL; MCP config location; Playwright screenshot helper path.
   - Any component still missing a story (blocks `design-loop` for that component).
   - Next: run `chromatic-init` to add the publish/approval gate.

## Notes

- Storybook 9's default config already bundles a11y + test addons; if the user chose **Minimal**,
  `run-story-tests` will be limited until those addons are added.
- `run-story-tests` needs interaction/a11y tests to add value; purely presentational stories make
  the testing step light until tests are added.
