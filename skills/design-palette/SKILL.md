---
name: design-palette
description: "Creates or migrates the canonical CSS theme palette: brand/base/status inputs per light and dark mode, generated faint→intense scales, a reference-only semantic layer, a var()-only theme shared by web and React Native, Tailwind v4 utilities, and a contrast audit. Used by design-init, or directly when the user wants to create a theme palette, set up design tokens, normalize existing CSS variables, or check palette contrast."
disable-model-invocation: true
---

# Design Palette

Produces the **canonical theme palette**, the single source of truth for design tokens
(contract §5). Usually invoked by `design-init`; can run standalone.

Read before starting:

- [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) §5
- [`references/palette-structure.md`](references/palette-structure.md), the token model this skill produces

## Workflow

1. **Ask the targets and the layout.** Web, mobile, or both, and where the files go. Recommend
   an inputs file next to a `generated/` folder (e.g. in a shared theme package):

   ```
   theme.inputs.css           the inputs, the only hand-edited file (canonical)
   generated/theme.css        the tokens, shared by web and React Native    --theme
   generated/scheme.css       browser-only mode switch (web targets)        --scheme
   generated/tailwind.css     Tailwind v4 utilities (Tailwind targets)      --mobile
   generated/palette.json     resolved hex values (optional, for JS)        --json
   ```

   Drop the outputs a project does not need. A small project may keep one file instead: web only,
   the inputs, theme and scheme in `theme.css`; mobile only, everything in the Tailwind file.
   Web and mobile in one repo: put them in a shared theme package (exports, project aliases,
   JSON reader: [palette-structure.md](references/palette-structure.md#shared-theme-package-web-and-mobile-in-one-repo)).

2. **Detect existing tokens.** Look for CSS custom properties, a Tailwind theme, or hard-coded
   colors. If any exist, follow [`references/migration.md`](references/migration.md) instead of
   starting from the template. Never overwrite an existing palette without showing the diff.

3. **Collect the inputs.** For each of light (`-lm`) and dark (`-dm`) mode:
   - brand: `primary` and `secondary` required, `tertiary`–`quinary` optional. Reuse the logo
     colors; without a logo, suggest a generator such as coolors.co.
   - base: `font`, `background`; optional `font-inverted` (defaults to background) and `border`
     (defaults to a 14% font-into-background mix).
   - status: `info`, `danger`, `success`, `warning` (defaults in the template).

4. **Write the inputs** into the canonical file (the inputs file, or the one file) using
   [`templates/theme.inputs.css`](templates/theme.inputs.css). Inputs are the only hand-edited
   values.

5. **Generate.** Run [`scripts/palette.mjs`](scripts/palette.mjs) (Node 20+, no dependencies):

   ```bash
   # inputs file + generated/ folder (drop the flags a project does not need)
   node ${CLAUDE_SKILL_DIR}/scripts/palette.mjs theme.inputs.css --theme generated/theme.css \
     --scheme generated/scheme.css --mobile generated/tailwind.css --json generated/palette.json
   # one file: web only / mobile only
   node ${CLAUDE_SKILL_DIR}/scripts/palette.mjs theme.css --web --scheme theme.css
   node ${CLAUDE_SKILL_DIR}/scripts/palette.mjs tailwind.css --mobile tailwind.css
   ```

   `--theme <file>` writes the theme and leaves the inputs file as it is; `--web` rewrites the
   inputs file as the full theme. Add `generated/` (or the output files) to the formatter and
   linter ignores, or every re-run shows up as a formatting diff.

   What each app imports (one-file mobile only: `tailwind.css` alone):

   | App                         | Imports, in order                                       |
   | --------------------------- | ------------------------------------------------------- |
   | Web (and any web Storybook) | `tailwind.css` (if Tailwind), `theme.css`, `scheme.css` |
   | React Native (NativeWind)   | `tailwind.css`, `theme.css`; never the scheme file      |
   | React Native Storybook      | the app's global CSS, then `scheme.css`                 |

   The theme has plain values and `var()` only and switches dark mode with
   `prefers-color-scheme`. The scheme file adds `light-dark()` so a browser can force a mode:
   set `document.documentElement.style.colorScheme = mode`. react-native-css turns `light-dark()`
   into arrays that Reanimated rejects, so it stays off React Native.

   Card sync: `--to-card <card>` writes the inputs into the palette card, `--from-card <card>`
   takes them from it (and writes them into the inputs file), `--diff-card <card>` only prints the differences. `--title <name>` sets the
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

8. **Report.** Canonical file path, generated file(s), what each app imports, input count, audit
   summary, and the reminder that the inputs block is canonical: Claude Design and Chromatic are
   downstream, and `design-loop` reconciles changes back into the inputs.

## Rules

- Components consume **semantic tokens only** (`--bg`, `--border`, `--text-muted`,
  `--primary-bg`, `--text-on-primary`…). Raw scale steps are for rare one-offs.
- Never hand-edit generated tokens; change an input and re-run.
- Keep the structure: inputs → scales → semantic. Never flatten semantic tokens into hex.
- Point project Tailwind aliases at the theme token (`--color-surface: var(--bg)`), never at a
  `--color-*` variable. react-native-css inlines a variable declared only once, in stylesheet
  order, and Tailwind emits `--color-*` before the theme, so such an alias loses dark mode on
  native.
