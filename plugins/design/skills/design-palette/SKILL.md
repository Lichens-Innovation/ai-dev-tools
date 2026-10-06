---
name: design-palette
description: "Used by design-init, or directly when the user wants to create a theme palette, set up design tokens, normalize existing CSS variables, or check palette contrast."
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

   For Tailwind targets, also ask for the namespace: a short project name (e.g. `noa`) that every
   palette class carries: `text-noa-muted`, `bg-noa-elevated`, `bg-noa-primary-subtle`
   ([Tailwind names](references/palette-structure.md#tailwind-names)). Required with `--mobile`.

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

5. **Put the generator in the repo.** Copy [`scripts/palette.ts`](scripts/palette.ts) (Node 22.18+,
   which runs it as is; no dependencies) into the package that holds the inputs, as `scripts/palette.ts`, and add a
   `palette` script to that package's `package.json` that regenerates every output, so developers
   without the plugin can run it (`npm run palette`, `pnpm --filter <pkg> palette`…):

   ```bash
   # inputs file + generated/ folder (drop the flags a project does not need)
   node scripts/palette.ts src/theme.inputs.css --theme src/generated/theme.css \
     --scheme src/generated/scheme.css --mobile src/generated/tailwind.css \
     --json src/generated/palette.json --namespace noa
   # one file: web only / mobile only
   node scripts/palette.ts theme.css --web --scheme theme.css
   node scripts/palette.ts tailwind.css --mobile tailwind.css
   ```

   Add the copy to the formatter and linter ignores: it must stay byte-identical to the plugin's.
   Raise the project's `engines.node` to `>=22.18` when it allows older versions. Outside a
   `"type": "module"` package, Node prints a harmless module-type warning; add `"type": "module"`
   when no other script there needs CommonJS. The manifest records it as `palette.script` and the
   namespace as `palette.namespace` (`design-init` writes them). On a later run, compare the copy
   with the plugin's first and, when they differ, show the diff and ask before replacing it
   (contract §5). Adding the script is no install: never run the package manager's install.

6. **Generate.** Run the `palette` script (or the copy with the same flags).

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

7. **Report the audit** (report only, never block). For each `FAIL`, propose the smallest input
   change that fixes it (usually nudging that color's lightness) and ask before applying.
   `WARN` lines are advisory; explain them in one line each. Also say which brand slots are unset:
   they have no tokens, so a class like `bg-noa-tertiary` does not exist until the input is added.

8. **Palette card.** When run by `design-init`, stop here: it seeds the Claude Design card and
   reconciles. Standalone, follow [`references/preview-card.md`](references/preview-card.md).

9. **Report.** Canonical file path, the `palette` script, generated file(s), what each app
   imports, input count and audit summary. The inputs are canonical; Claude Design is downstream
   and `design-loop` reconciles its changes back into them.

## Rules

- Components consume **semantic tokens only** (`--bg`, `--border`, `--text-muted`,
  `--primary-bg`, `--text-on-primary`…). Raw scale steps are for rare one-offs.
- No opacity modifiers on palette classes (`bg-noa-hover/50`): use the state's token. A missing
  state is a new token in `palette.ts`, not a one-off alpha.
- Never hand-edit generated tokens; change an input and re-run.
- Keep the structure: inputs → scales → semantic. Never flatten semantic tokens into hex.
- Components use the namespaced classes only (`text-noa-muted`). Don't add project Tailwind
  aliases (`bg-surface`, `text-content`): they bring a second vocabulary back. When a third-party
  kit forces its own names, alias them onto the theme token (`--color-background: var(--bg)`),
  never onto a `--color-*` variable (it loses dark mode on native, see
  [palette-structure.md](references/palette-structure.md)).
