# Palette structure

Three color layers; components only touch layer 3. Spacing, type and breakpoints are
[hand-authored tokens](#hand-authored-tokens-non-color) beside them.

```
1. Inputs     --primary-lm / --primary-dm …      hand-edited, one value per mode
2. Scales     --primary-faint … --primary-intense generated, same names in both modes
3. Semantic   --primary-bg, --bg-hover, --text-muted  references to layer 2 only
```

## 1. Inputs

| Group  | Inputs                                                                 | Notes                                                                        |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Brand  | `primary`, `secondary` (required), `tertiary`, `quaternary`, `quinary` | An unset slot has no tokens: set it before using its classes                 |
| Base   | `font`, `background`, `font-inverted`, `border`                        | `font-inverted` defaults to background; `border` to 14% font into background |
| Status | `info`, `danger`, `success`, `warning`                                 | Any extra non-brand, non-base input is treated as a status color             |

Every input has `-lm` (light mode) and `-dm` (dark mode).

### Hand-authored tokens (non-color)

Every other custom property of the inputs file is a **hand-authored token**: spacing, type, radius,
breakpoints… The same in both modes, never derived: `palette.ts` copies them as is into the theme
(a last `:root` block) and into the Sass file. Name them like Tailwind v4's theme variables, so a
project has one vocabulary with or without Tailwind:

| Group       | Names                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Spacing     | `--spacing-xs` … `--spacing-xl`: one scale for padding, margin and gap                     |
| Type        | `--text-sm`, `--text-base`, `--text-lg`…, `--font-sans`, `--font-mono`, `--font-weight-*`, `--leading-*` |
| Shape       | `--radius-*`, `--shadow-*` (a shadow color is the `--shadow` token)                        |
| Breakpoints | `--breakpoint-sm`…: literal values only, the Sass file turns them into media queries       |

A name the palette generates (`--text-muted`, `--bg-soft`…) is an error. Tailwind projects leave the
block out: Tailwind's own theme holds the scale (`palette.ts` warns when `--mobile` finds one).
Claude Design's palette card only edits the color inputs.

## Generated files

`palette.ts` computes every token as a hex per mode, the same values the audit checks, and writes:

| File     | Holds                                                                                                                                          | Used by                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| theme    | Inputs, generated `--X-light` / `--X-dark` values, the tokens (light), and a `prefers-color-scheme: dark` block re-pointing them. `var()` only | web and React Native    |
| scheme   | `color-scheme: light dark` and `--X: light-dark(<light>, <dark>)` for every token that changes, so `color-scheme` on `<html>` forces a mode    | browsers only           |
| Tailwind | `@import "tailwindcss"` and `@theme inline { … }` with the namespaced names ([Tailwind names](#tailwind-names))                                | Tailwind and NativeWind |
| JSON     | `{ "X": { "light": "#…", "dark": "#…" } }`, references resolved                                                                                | code without CSS vars   |
| Sass     | `$X: var(--X)` for every token and hand-authored token; breakpoints as literals, a `$breakpoints` map and an `mq($name)` mixin               | Sass projects           |

### Sass projects

`--sass <file>` (e.g. `generated/_tokens.scss`) gives Sass a typed handle on the theme:
`@use "<theme>/tokens" as t; color: t.$text-muted;` compiles to `var(--text-muted)`, so the value stays
live (dark mode, the scheme file) and a misspelled name fails the build with `Undefined variable`.
The theme CSS must still be loaded at runtime (the same imports as any web app).

- No Sass math or color functions on these names (`t.$spacing-sm * 2`, `color.scale(t.$primary, …)`):
  they are `var()`, not values. Use `calc()`, or the scale step the palette already has
  (`t.$primary-strong`).
- Breakpoints are the exception: `t.$breakpoint-sm` is the literal, and `@include t.mq(sm) { … }`
  writes `@media (min-width: …)`.
- Values only Sass needs (a navbar height used in `calc()`) stay in the project's own Sass.

```css
:root {
  --primary-lm: #401f3e; /* input */
  --primary-dm: #8a5585;
  --primary-faint-light: #fef0fc; /* generated */
  --primary-faint-dark: #271d29;
  --primary: var(--primary-lm); /* token */
  --primary-faint: var(--primary-faint-light);
  --primary-bg: var(--primary-faint); /* semantic: same in both modes */
}
@media (prefers-color-scheme: dark) {
  :root {
    --primary: var(--primary-dm);
    --primary-faint: var(--primary-faint-dark);
  }
}
```

Only the inputs are hand-edited; the rest is regenerated on every run.

### Shared theme package (web and mobile in one repo)

```
packages/theme/
├── package.json           exports public names: "./theme.css": "./src/generated/theme.css", …
└── src/
    ├── theme.inputs.css   the inputs (canonical, manifest palette.localPath)
    ├── palette.ts         typed reader of generated/palette.json, only if JS needs hex values
    └── generated/         never edited: theme.css, scheme.css, tailwind.css, palette.json, _tokens.scss
```

- `scripts/palette.ts` is the repo's copy of the generator (manifest `palette.script`), run by the
  package's `palette` script: `"palette": "node scripts/palette.ts src/theme.inputs.css --theme
src/generated/theme.css --scheme src/generated/scheme.css --mobile src/generated/tailwind.css
--json src/generated/palette.json --namespace noa"`. Node 22.18+, no dependencies. Keep it out of the
  formatter and linter too, so it stays byte-identical to the plugin's.
- Apps import the package's export names, never a `generated/` path, so the layout can change
  without touching them.
- Add `generated/` to the formatter's and linter's ignore files: a reformatted output turns every
  regenerate into a diff.
- Read `palette.json` through one small typed module; do not generate a second copy of the
  values in TS.

| Consumer                  | Imports, in order                                                 |
| ------------------------- | ----------------------------------------------------------------- |
| Web app, web Storybook    | `tailwind.css`, `theme.css`, `scheme.css`                         |
| React Native (NativeWind) | `tailwind.css`, `theme.css`, NativeWind theme; no scheme          |
| React Native Storybook    | the app's global CSS, then `scheme.css` (it renders in a browser) |

## Tailwind names

Every class carries the project namespace (`palette.namespace`, `--namespace noa`) and drops the
role word the utility already names, through Tailwind's per-utility color namespaces
(`--text-color-*`, `--background-color-*`, `--border-color-*`, which win over `--color-*` for that
utility only):

| Token                                                       | Class                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `--text`, `--text-muted`, `--text-on-primary`…              | `text-noa`, `text-noa-muted`, `text-noa-on-primary`                     |
| `--bg`, `--bg-elevated`, `--bg-hover`…                      | `bg-noa`, `bg-noa-elevated`, `bg-noa-hover`                             |
| `--border`, `--border-strong`, `--border-input`             | `border-noa`, `border-noa-strong`, `border-noa-input`                   |
| `--primary`, `--primary-hover`, `--primary-active` (solid)  | `bg-noa-primary`, `bg-noa-primary-hover`, `…-active`                    |
| `--primary-bg`, `--primary-bg-hover`, `--primary-bg-active` | `bg-noa-primary-subtle`, `bg-noa-primary-subtle-hover`, `…-active`      |
| `--primary-text`                                            | `text-noa-primary`                                                      |
| `--primary-border`, `--primary-border-strong`               | `border-noa-primary`, `border-noa-primary-strong`                       |
| any token, by its full name, on every utility               | `bg-noa-primary-faint`, `bg-noa-text-on-primary`, `ring-noa-focus-ring` |

Same for every brand and status color. `text-noa-primary` and `border-noa-primary-strong` are the
fill itself whenever it is readable, so the brand color as text or as a selected outline needs no
other name; `border-noa-primary` is the soft edge of a tinted box. On `border-`, the strong border
takes the place of the `--primary-strong` scale step, which stays reachable as
`border-[var(--primary-strong)]`. There are no
un-namespaced names (`text-text-muted`, `bg-primary-bg`): a project migrating from them rewrites
its classes ([migration.md](migration.md#tailwind-classes)). A short name two tokens would share
(a status color named `muted`) keeps the first and prints a `WARN`.

No opacity modifiers on palette classes (`bg-noa-hover/50`, `ring-noa-danger/20`): the color
then depends on what is behind it, which the audit cannot check. Every state has its token
(`-hover`, `-active`, `-subtle-hover`, `-subtle-active`, `--bg-disabled`, `--focus-ring-danger`);
`--overlay` and `--shadow` carry their own alpha.

## 2. Scales

Five steps ordered by **contrast against the background**, so each name means the same thing in
both modes:

| Step       | Meaning                 | Light mode  | Dark mode           |
| ---------- | ----------------------- | ----------- | ------------------- |
| `-faint`   | barely off the page     | L 0.97 tint | 16% into background |
| `-soft`    | visible tint            | L 0.91 tint | 30% into background |
| base       | the input               | input       | input               |
| `-strong`  | more contrast           | L ≤ 0.5     | L ≥ 0.75            |
| `-intense` | max contrast, text-safe | L ≤ 0.35    | L ≥ 0.88            |

Neutral scales use the same names with smaller shifts (`--bg-intense` is not as strong as
`--primary-intense`):

- `--bg-faint`, `--bg-soft`, `--bg-strong`, `--bg-intense`: font into background (light 6, 10,
  14, 31%; dark 11, 15, 20, 36%), a grey ramp from the page toward the text
- `--border` (the border input) and `--border-strong` (border with 20% font): their own pair,
  outside the ramp
- `--text-faint`, `--text-soft` (font into background), `--text-strong`, `--text-intense`
- `--bg-elevated`, `--bg-inset`: literal lightness (lighter / darker in both modes), outside the scale

## 3. Semantic (identical in both modes)

| Token                              | →                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `--bg-hover` / `--bg-active`       | `--bg-faint` / `--bg-soft`                                                                         |
| `--border-input`                   | `--text-faint` (≥ 3:1, WCAG 1.4.11)                                                                |
| `--text-muted` / `--text-disabled` | `--text-soft` / `--text-faint`                                                                     |
| `--bg-disabled`                    | `--bg-soft`                                                                                        |
| `--focus-ring`                     | `--primary-strong`                                                                                 |
| `--focus-ring-danger`              | `--danger-border-strong`: the focus ring of an invalid field or a danger action                    |
| `--link` / `--link-hover`          | `--primary-text` / `--primary-strong`                                                              |
| `--X-bg`                           | `--X-faint`                                                                                        |
| `--X-bg-hover`, `--X-border`       | `--X-soft`                                                                                         |
| `--X-border-strong`                | `X` if ≥ 3:1 on `--bg`/`--bg-elevated`, else `--X-strong`, per mode                                |
| `--X-text`                         | `X`, `--X-strong` or `--X-intense`: the first ≥ 4.5:1 on `--bg`/`--bg-elevated`/`--X-bg`, per mode |
| `--text-on-X`                      | `--text` or `--text-inverted`, picked per mode for contrast                                        |

`X` = every brand and status color.

`--text-faint` (and so `--text-disabled` and `--border-input`) is about 3:1 against the
background: enough for disabled text, placeholders and input borders, not for text people need to
read. Use `--text-muted` (4.5:1, checked by the audit) for help text, labels and other secondary
text.

## 4. Interaction and effects (not derivable from scales)

- `--X-hover` / `--X-active`: lightness shift +0.07 / +0.12, reversed when the color is already light (L > 0.78)
- `--X-bg-active`: the pressed tint, `--X-soft` shifted 0.07 the same way
- `--overlay`, `--shadow`: per-mode values

## Contrast audit

`palette.ts` checks both modes:

- 4.5:1 text: `-text` on `-bg` and `--bg`, `--text-on-X` on `X`, `--text`/`--text-muted` on `--bg`/`--bg-elevated`/`--bg-inset`, `--link`
- 3:1 UI: `--border-input`, `--focus-ring`, `--focus-ring-danger`, `-border-strong`
- visible states (ΔL ≥ 0.04): `-hover` vs base, `-bg-hover` vs `-bg`, `-bg-active` vs `-bg-hover`, `--bg-hover` (advisory)
- advisory: brand fill visible on page (3:1), very light inputs (L > 0.9), brand vs status
  look-alikes (hue < 25° apart and lightness within 0.2)

## Known limits

- Dark faint/soft are mixes: relative color syntax cannot read the background's lightness.
- `--text-on-*` is decided at generation time; re-run after changing inputs.
- The scheme file needs `light-dark()` (browsers from 2024). The theme itself has no such requirement.
- Changing an input in devtools does not update the scales: re-run the script (the palette card
  recomputes live).
- On React Native, a Tailwind alias through another `--color-*` (`--color-background: var(--color-noa-bg)`)
  freezes to the light value (react-native-css 3.0.7 inlines once-declared variables in stylesheet
  order). Alias onto the theme token instead: `--color-background: var(--bg)`.
