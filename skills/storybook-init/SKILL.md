---
name: storybook-init
description: "Installs and configures Storybook in a React or React Native project (including each UI app of a monorepo), wires up the Storybook MCP server, and confirms Playwright can screenshot a running Storybook - the render + knowledge half of the design loop. Used by design-init, or directly when the user wants to add Storybook or configure the Storybook MCP. Use when the user asks to add Storybook, set up component stories, or configure the Storybook MCP."
disable-model-invocation: true
---

# Storybook Init

Installs and wires the **render + knowledge** stack for the design loop: Storybook (the render
target), the Storybook MCP server (knowledge + tests), and Playwright (the screenshot "eyes").
Chromatic is a separate concern — see the `chromatic-init` skill. Usually invoked by `design-init`.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) — this skill
satisfies the render/knowledge preconditions in §6 and produces the **Storybook targets** of §2.

## Targets

This procedure sets up **one Storybook target**: a directory, a port, an MCP server entry, and a
row in the manifest's `storybooks` map. A normal repo has exactly one — the root, `:6006`, key
`default` — and steps 1–7 below are all it needs.

## Prerequisites

- **Node.js 20+**, and npm 10+ / pnpm 9+ / Yarn 4+.

## Workflow

0. **Detect the repo shape and load the matching references.**
   - **Monorepo** — any of `pnpm-workspace.yaml`, `package.json#workspaces`, `turbo.json`,
     `nx.json`, `lerna.json`. Read [`references/monorepo.md`](references/monorepo.md): it decides
     the list of targets, then run steps 1–7 **once per target**, applying its deltas.
   - **Mobile target** — the target's `package.json` depends on `react-native` or `expo`. Read
     [`references/react-native.md`](references/react-native.md) before step 2 for that target.
   - Otherwise: one target at the root; continue.

1. **Detect what exists.** In the target directory, check for `.storybook/`, a `storybook` script,
   Playwright, and a Storybook MCP entry. Only add what's missing (idempotent).

2. **Install Storybook (CLI, not MCP).** The Storybook MCP cannot bootstrap Storybook — its tools
   operate against a *running* Storybook, so it's chicken-and-egg. Run the CLI **from the target
   directory** (it detects the framework/builder there):

   ```bash
   npm create storybook@latest -- --features docs test a11y ai --yes --no-dev
   # pnpm: pnpm create storybook@latest --features docs test a11y ai --yes --no-dev
   ```

   Leave `--type` off so the CLI detects the project type (React, Next.js, …). `--yes --no-dev` keeps it non-interactive and skips auto-launching the dev server (step 3 does
   that on the right port). `docs test a11y` gives `test-run` something to run; `ai` adds `@storybook/addon-mcp`,
   which serves the MCP from the dev server itself. The CLI installs deps, adds `storybook` /
   `build-storybook` scripts, creates `.storybook/`, and scaffolds example stories.

   **Review what it wrote** — it edits files it doesn't own:
   - Pin versions: it writes `latest` / `^x` ranges. Match the repo's pinning policy and any
     root overrides (e.g. a `vite` override).
   - It may add `vitest.config.ts`, a vitest shim, an ESLint import, and `.gitignore` lines —
     format them with the repo's formatter and check the ESLint plugin is actually applied.
   - Delete the example stories (`src/stories/` by default).

3. **Run and verify.** Start the dev server on the target's port and confirm it serves stories:

   ```bash
   npm run storybook   # default target: http://localhost:6006
   ```

   Also run `build-storybook` once — Chromatic and CI build statically, and some config errors
   only show up there.

4. **Register the Storybook MCP server.** With `addon-mcp` installed, the running Storybook serves
   MCP at `<url>/mcp`. Add it to the project's `.mcp.json`:

   ```json
   { "mcpServers": { "storybook": { "type": "http", "url": "http://localhost:6006/mcp" } } }
   ```

   Confirm the tools the loop uses are reachable: `docs-show`, `stories-changed`, `test-run`, and
   `get-storybook-story-instructions` (Storybook 10.6 names). The MCP does **not** screenshot —
   that's Playwright's job. If a name is missing (older releases differ), list the server's tools
   (`tools/list`) rather than guessing.

5. **Confirm Playwright screenshots.** Ensure Playwright is installed (`npm i -D playwright &&
   npx playwright install chromium`) and can capture a single story from the running Storybook via
   `<url>/iframe.html?id=<storyId>&viewMode=story`. `design-loop`'s `scripts/screenshot.mjs` takes
   the URL as an argument, so one install serves every target.

6. **Baseline stories (MCP-guided).** If mapped components lack stories, scaffold minimal ones so
   the MCP and Playwright have something to target. Take conventions from the project, not from
   guesses: MCP `get-storybook-story-instructions`, or `npx storybook skills write-story` (run in
   the target directory).

7. **Record the target and report.**
   - Record the target for the manifest (contract §2): `dir`, `url`, `mcpServer`, `runCommand`.
     A single root target on `:6006` matches the defaults and needs no `storybooks` entry.
   - Report the run command + URL, MCP entry, Playwright status, and any component still missing a
     story (it blocks `design-loop` for that component).
   - Next: run `chromatic-init` to add the publish/approval gate.

## Notes

- Storybook 9+ splits a11y and testing into addons; if the user picked a **Minimal** install,
  `test-run` is limited until `addon-vitest` and `addon-a11y` are added.
- `test-run` needs interaction/a11y tests to add value; purely presentational stories make
  the testing step light until tests are added.
- Storybook 10 is ESM-only: `.storybook/main.ts` uses `import.meta`, not `__dirname`/`require`
  (use `createRequire(import.meta.url)` when a CJS path is needed).

## Troubleshooting

**MCP server shows `ECONNREFUSED` and offers "Authenticate"; authenticating fails with
`Dynamic Client Registration rejected (HTTP 404)`.** Not an auth problem — `addon-mcp` has no
auth. Claude Code connects to MCP servers once, at session start; if the Storybook wasn't running
then, the connection is refused and Claude Code falls back to an OAuth attempt the server doesn't
support (hence the 404). Fix:
1. Start the target's Storybook (its `runCommand`). Probe it with
   `curl -s -o /dev/null -w "%{http_code}\n" -X POST <url>/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
   — expect `200`; if nothing answers, check the port (`lsof -nP -iTCP:<port> -sTCP:LISTEN`).
2. In Claude Code, `/mcp` → select the server → **Reconnect** (never "Authenticate").

Start the Storybook(s) before launching Claude Code to avoid it.
