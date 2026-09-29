---
name: design-palette
description: "Creates or migrates the canonical CSS theme palette: brand/base/status inputs per light and dark mode, generated faint→intense scales, a reference-only semantic layer, web (light-dark) and/or Tailwind v4 outputs, and a contrast audit. Used by design-init, or directly when the user wants to create a theme palette, set up design tokens, normalize existing CSS variables, or check palette contrast."
disable-model-invocation: true
---

# Design Palette

Produces the **canonical theme palette**, the single source of truth for design tokens
(contract §5). Usually invoked by `design-init`; can run standalone.

Read before starting:

- [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) §5
- [`references/palette-structure.md`](references/palette-structure.md), the token model this skill produces

## Workflow

1. **Ask the targets.** Web, mobile, or both, and the file paths:
   - web → the canonical `theme.css` (e.g. `src/styles/theme.css`)
   - mobile → the Tailwind v4 CSS file (e.g. `apps/mobile/global.css`)
   - mobile only → the Tailwind file is also the canonical file (it holds the inputs block)

2. **Detect existing tokens.** Look for CSS custom properties, a Tailwind theme, or hard-coded
   colors. If any exist, follow [`references/migration.md`](references/migration.md) instead of
   starting from the template. Never overwrite an existing palette without showing the diff.

3. **Collect the inputs.** For each of light (`-lm`) and dark (`-dm`) mode:
   - brand: `primary` and `secondary` required, `tertiary`–`quinary` optional. Reuse the logo
     colors; without a logo, suggest a generator such as coolors.co.
   - base: `font`, `background`; optional `font-inverted` (defaults to background) and `border`
     (defaults to a 14% font-into-background mix).
   - status: `info`, `danger`, `success`, `warning` (defaults in the template).

4. **Write the inputs** into the canonical file using
   [`templates/theme.inputs.css`](templates/theme.inputs.css). Inputs are the only hand-edited
   values.

5. **Generate.** Run [`scripts/palette.mjs`](scripts/palette.mjs) (Node 20+, no dependencies):

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/palette.mjs <theme.css> --web                      # web
   node ${CLAUDE_SKILL_DIR}/scripts/palette.mjs <theme.css> --web --mobile <tw.css>    # both
   node ${CLAUDE_SKILL_DIR}/scripts/palette.mjs <tw.css> --mobile <tw.css>             # mobile only
   ```

   Card sync: `--to-card <card>` writes the inputs into the palette card, `--from-card <card>`
   takes them from it, `--diff-card <card>` only prints the differences. `--title <name>` sets the
   card's project name; `--thumbnail <file>` writes the Claude Design project thumbnail.

   The script reads every `--name-lm` / `--name-dm` input, regenerates the rest of the file(s),
   and prints the contrast audit. Re-run it after any input change.

6. **Report the audit** (report only, never block). For each `FAIL`, propose the smallest input
   change that fixes it (usually nudging that color's lightness) and ask before applying.
   `WARN` lines are advisory; explain them in one line each. Also say which brand slots fall back
   (e.g. "tertiary and quinary use primary").

7. **Palette card.** When run by `design-init`, stop here: it seeds the Claude Design card and
   reconciles. Standalone, follow [`references/preview-card.md`](references/preview-card.md). For
   web Storybooks, install the live-theme bridge so palette edits show up in real stories.

8. **Report.** Canonical file path, generated file(s), input count, audit summary, and the
   reminder that the inputs block is canonical: Claude Design and Chromatic are downstream, and
   `design-loop` reconciles changes back into the inputs.

## Rules

- Components consume **semantic tokens only** (`--bg`, `--border`, `--text-muted`,
  `--primary-bg`, `--text-on-primary`…). Raw scale steps are for rare one-offs.
- Never hand-edit generated tokens; change an input and re-run.
- Keep the structure: inputs → scales → semantic. Never flatten semantic tokens into hex.
