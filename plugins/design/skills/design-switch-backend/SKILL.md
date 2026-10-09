---
name: design-switch-backend
description: "Moves a project's design loop from one backend to the other: from Claude Design to the local design studio, or back. Checks for unimplemented proposals first, rewrites design.manifest.json for the new backend, then hands over to /design-init to set that backend up."
disable-model-invocation: true
---

# Design Switch Backend

Moves a project set up by `design-init` from one design backend (contract §8) to the other:
`claude-design` → `local`, or `local` → `claude-design`. What carries over is everything on the code
side: the palette and its files, the components and screens with their stories, sources and routes.
What does not carry over is the old backend's design work: its references, mockups and proposals
stay where they are (the Claude Design project, or the repo's `design/` folder) and are not
converted. A Claude Design proposal renders the synced bundle, a local one is a DOM snapshot: the
two do not translate.

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) §2 and §8 and the
doc of the backend you are leaving:
[`claude-design.md`](${CLAUDE_SKILL_DIR}/../../references/backends/claude-design.md) or
[`local.md`](${CLAUDE_SKILL_DIR}/../../references/backends/local.md).

`<switch-backend.mjs>` is `${CLAUDE_SKILL_DIR}/scripts/switch-backend.mjs`. Run it from the repo root.

## Steps

1. **Where from, where to.** `design.manifest.json` must exist at the repo root (none: point at
   `/design-init` and stop). The current backend is its `backend`, `claude-design` when missing. The
   target is the other one; when the user's request does not say, confirm it with them
   (`AskUserQuestion`).

2. **Open work.** Find the proposals that are not implemented yet, as `design-loop` step 1 does on
   the current backend: **List targets**, then **Fetch target** for each candidate, stale when its
   hash differs from `lastImplementedHash`. If there are any, list them and ask
   (`AskUserQuestion`):
   - **Implement them first** (recommended): stop here and tell the user to run `/design-loop`, then
     this skill again.
   - **Switch anyway**: they stay in the old backend, unimplemented. Name where (the Claude Design
     project, or the `design/proposals/` files).

   If the old backend cannot be read (Claude Design MCP disconnected, the studio down), say so and
   ask whether to switch without the check.

3. **Show the change.** `node <switch-backend.mjs> plan <target>` prints the manifest as it will be.
   Summarise it for the user: every component and screen goes back to `wip` with
   `lastImplementedHash: null` (the old hashes were of the old backend's files), the design paths
   become the new backend's (contract §2, "The local backend's rows"; on Claude Design they wait for
   `/design sync` and the mockups), the old backend's fields go (`designProjectId`, or `studio`).
   Ask before writing. Exit 1 means the project is already on that backend: say so and stop.

4. **Rewrite the manifest.** `node <switch-backend.mjs> apply <target>`. The previous manifest is in
   git; nothing else is written.

5. **Leave the old backend tidy.** Ask, per item, never by default:
   - From **local**: stop the studio container (from the ai-dev-tools checkout's
     `apps/design-studio`, found as `/design-studio` finds it:
     `PROJECT_DIR=<repo root> docker compose -p design-<name> down`, `<name>` as `/design-studio`
     derives it), and remove the project's MCP server
     (`claude mcp remove --scope project design-studio`, which edits `.mcp.json`). Keep `design/`
     unless the user asks to delete it: it is committed history of the explored designs.
   - From **Claude Design**: nothing to remove. The Claude Design project stays as it is; the user
     can archive it in claude.ai/design. The `.design-sync/` config and the design provider's
     navbar hook in the code are harmless; mention them, remove them only if asked.

6. **Set up the new backend.** Tell the user to run `/design-init` (only they can start it). It
   reads the new `backend` and runs that backend's steps: for local, it creates `design/`, captures
   the components and starts the studio; for Claude Design, it binds or creates the project, seeds
   the palette card and prepares `/design sync`. Screens come back through `/design-refresh add the
   <name> page`.

## Report

The old and new backend, the open proposals left behind (and where), what was removed from the old
backend, and the next command: `/design-init`.
