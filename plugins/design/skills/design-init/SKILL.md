---
name: design-init
description: "One-time setup for running the design loop in an existing React project. Detects what's already present, then orchestrates the palette and Storybook/Chromatic/MCP setup sub-skills and writes the initial design.manifest.json. Use when the user wants to set up a React project for the Claude Design loop, onboard an existing project, or asks how to get started with the design plugin."
disable-model-invocation: true
---

# Design Init

Setup orchestrator. Gets an existing React project ready for `design-loop` by running the two
setup sub-skills and establishing the manifest. Idempotent — safe to re-run; skips what already
exists.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md). Everything
this skill produces must satisfy the preconditions in §6.

## Workflow

1. **Detect current state.** Inspect the project: package manager, React setup, whether a CSS
   theme/token file already exists, whether Storybook / Chromatic / Playwright / the Storybook
   MCP are already configured, and whether `design.manifest.json` exists. Report the gap list.

2. **Palette (sub-skill).** If no canonical CSS palette exists, invoke **`design-palette`** to
   create/normalize one. This file is the source of truth for tokens (contract §5).

3. **Storybook + MCP + Playwright (sub-skill).** If Storybook, the Storybook MCP, or Playwright
   are missing, invoke **`storybook-init`** to install and wire them, and to confirm Playwright
   can screenshot a running Storybook. In a monorepo it may produce several **Storybook targets**
   (one per UI app, contract §2) — keep the list for step 5.

3b. **Chromatic (sub-skill).** Once Storybook exists, invoke **`chromatic-init`** to add the
   publish/approval gate (package, token, script, baseline build). Runs after `storybook-init`.

4. **Bind to a Claude Design project.** Use `DesignSync list_projects`. Reuse an existing
   design-system project or create one. Record its id as `designProjectId`.

5. **Write the manifest.** Create `design.manifest.json` at the repo root per the contract §2
   schema: `designProjectId`, a default `reconcileRule` (`canonical-wins`), and a `components[]`
   row per component discovered (each `wip`, `lastImplementedHash: null`). Map `localPath`,
   `storyId`, and the intended `designPath`. With more than one Storybook target, also write the
   `storybooks` map and set each component's `storybook` key; a single root target on `:6006`
   needs neither.

6. **Verify preconditions.** Walk contract §6 and confirm each is satisfied. List anything still
   missing.

7. **Report & next steps.**
   - Palette file path; Storybook/Chromatic/MCP status; manifest path + bound project.
   - Next: run `/design-sync` to push the catalog up, iterate in Claude Design, then use
     `design-loop` once a component is `approved`.

## Notes

- Do not overwrite an existing palette or manifest without confirming — surface diffs instead.
- This skill sets up; it does not run the loop.
