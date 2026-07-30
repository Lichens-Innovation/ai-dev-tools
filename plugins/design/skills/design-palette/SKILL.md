---
name: design-palette
description: "Creates or normalizes a CSS theme palette file that is the canonical source of truth for a project's design tokens, preserving raw-scale vs semantic-token structure. Used by design-init, or directly when the user wants to generate/consolidate a color/token theme file or restructure existing CSS variables into a palette. Use when the user asks to create a theme palette, set up design tokens, or normalize their CSS variables."
---

# Design Palette

Produces the **canonical CSS theme palette** — the single source of truth for design tokens
(contract §5). Usually invoked by `design-init`; can also be run standalone.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md), especially
§5 (token reconciliation and structure).

## Workflow

1. **Find existing color/token sources.** Look for existing CSS custom properties, hard-coded
   hex/rgb values, or a partial theme file. Ask the user to point at the intended file if
   ambiguous — do not guess across unrelated projects.

2. **Choose the token structure** (confirm with the user if not already established):
   - **Raw scale** — e.g. `--blue-500`, `--gray-900`: the primitive palette.
   - **Semantic layer** — e.g. `--color-primary`, `--color-danger`, `--color-surface`: what
     components actually consume, referencing the raw scale.
   Preserve any structure that already exists; never flatten semantic tokens into raw hex.

3. **Generate / normalize the palette file.** Write a single CSS file (e.g.
   `src/styles/theme.css`) with the raw scale first, then the semantic layer referencing it
   under `:root`. Consolidate duplicate/near-duplicate colors and report the merges.

4. **Rewire references (optional, on request).** Where components hard-code colors, offer to
   replace them with the matching semantic token. Do not do this silently.

5. **Report.**
   - Palette file path; raw vs. semantic token counts; any colors merged or flagged as
     near-duplicates.
   - Remind the user this file is canonical: Claude Design and Chromatic are downstream of it,
     and `design-loop` reconciles changes back into it.

## Notes

- This file feeds the Claude Design palette card via `/design-sync`, but it stays canonical —
  Design-side edits are reconciled back here, never the reverse.
- Keep it framework-agnostic CSS custom properties unless the project already uses a specific
  token system (Tailwind theme, CSS-in-JS tokens) — then match it.
