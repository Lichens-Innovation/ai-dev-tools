# Palette structure

Three layers. Components only touch layer 3.

```
1. Inputs     --primary-lm / --primary-dm …      hand-edited, one value per mode
2. Scales     --primary-faint … --primary-intense generated, same names in both modes
3. Semantic   --primary-bg, --border, --text-muted references to layer 2 only
```

## 1. Inputs

| Group  | Inputs                                                                 | Notes                                                                            |
| ------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Brand  | `primary`, `secondary` (required), `tertiary`, `quaternary`, `quinary` | Missing slots fall back: tertiary→primary, quaternary→secondary, quinary→primary |
| Base   | `font`, `background`, `font-inverted`, `border`                        | `font-inverted` defaults to background; `border` to 14% font into background     |
| Status | `info`, `danger`, `success`, `warning`                                 | Any extra non-brand, non-base input is treated as a status color                 |

Every input has `-lm` (light mode) and `-dm` (dark mode).

## Generated files

`palette.mjs` computes every token as a hex per mode, the same values the audit checks, and writes:

| File     | Holds                                                                                                                                          | Used by                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| theme    | Inputs, generated `--X-light` / `--X-dark` values, the tokens (light), and a `prefers-color-scheme: dark` block re-pointing them. `var()` only | web and React Native    |
| scheme   | `color-scheme: light dark` and `--X: light-dark(<light>, <dark>)` for every token that changes, so `color-scheme` on `<html>` forces a mode    | browsers only           |
| Tailwind | `@import "tailwindcss"` and `@theme inline { --color-X: var(--X) }`                                                                            | Tailwind and NativeWind |
| JSON     | `{ "X": { "light": "#…", "dark": "#…" } }`, references resolved                                                                                | code without CSS vars   |

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
    ├── tailwind-tokens.css project aliases, hand-written: --color-surface: var(--bg)
    ├── palette.ts         typed reader of generated/palette.json, only if JS needs hex values
    └── generated/         never edited: theme.css, scheme.css, tailwind.css, palette.json
```

- Apps import the package's export names, never a `generated/` path, so the layout can change
  without touching them.
- Add `generated/` to the formatter's and linter's ignore files: a reformatted output turns every
  regenerate into a diff.
- Read `palette.json` through one small typed module; do not generate a second copy of the
  values in TS.

| Consumer                  | Imports, in order                                                         |
| ------------------------- | ------------------------------------------------------------------------- |
| Web app, web Storybook    | `tailwind.css`, `theme.css`, `scheme.css`, project aliases                |
| React Native (NativeWind) | `tailwind.css`, `theme.css`, NativeWind theme, project aliases; no scheme |
| React Native Storybook    | the app's global CSS, then `scheme.css` (it renders in a browser)         |

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

- `--bg-faint`, `--bg-soft` (font into background), `--bg-strong` (= border input), `--bg-intense`
  (border input with 20% font, so it follows the border input too)
- `--text-faint`, `--text-soft` (font into background), `--text-strong`, `--text-intense`
- `--bg-elevated`, `--bg-inset`: literal lightness (lighter / darker in both modes), outside the scale

## 3. Semantic (identical in both modes)

| Token                              | →                                                           |
| ---------------------------------- | ----------------------------------------------------------- |
| `--bg-hover` / `--bg-active`       | `--bg-faint` / `--bg-soft`                                  |
| `--border` / `--border-strong`     | `--bg-strong` / `--bg-intense`                              |
| `--border-input`                   | `--text-faint` (≥ 3:1, WCAG 1.4.11)                         |
| `--text-muted` / `--text-disabled` | `--text-soft` / `--text-faint`                              |
| `--bg-disabled`                    | `--bg-soft`                                                 |
| `--focus-ring`                     | `--primary-strong`                                          |
| `--link` / `--link-hover`          | `--primary-text` / `--primary-strong`                       |
| `--X-bg`                           | `--X-faint`                                                 |
| `--X-bg-hover`, `--X-border`       | `--X-soft`                                                  |
| `--X-text`                         | `--X-intense`                                               |
| `--text-on-X`                      | `--text` or `--text-inverted`, picked per mode for contrast |

`X` = every brand and status color.

`--text-faint` (and so `--text-disabled` and `--border-input`) is about 3:1 against the
background: enough for disabled text, placeholders and input borders, not for text people need to
read. Use `--text-muted` (4.5:1, checked by the audit) for help text, labels and other secondary
text.

## 4. Interaction and effects (not derivable from scales)

- `--X-hover` / `--X-active`: lightness shift +0.07 / +0.12, reversed when the color is already light (L > 0.78)
- `--overlay`, `--shadow`: per-mode values

## Contrast audit

`palette.mjs` checks both modes:

- 4.5:1 text: `-text` on `-bg`, `--text-on-X` on `X`, `--text`/`--text-muted` on `--bg`/`--bg-elevated`/`--bg-inset`, `--link`
- 3:1 UI: `--border-input`, `--focus-ring`
- visible states (ΔL ≥ 0.04): `-hover` vs base, `-bg-hover` vs `-bg`, `--bg-hover` (advisory)
- advisory: brand fill visible on page (3:1), very light inputs (L > 0.9), brand vs status
  look-alikes (hue < 25° apart and lightness within 0.2)

## Known limits

- Dark faint/soft are mixes: relative color syntax cannot read the background's lightness.
- `--text-on-*` is decided at generation time; re-run after changing inputs.
- The scheme file needs `light-dark()` (browsers from 2024). The theme itself has no such requirement.
- Changing an input in devtools does not update the scales: re-run the script (the palette card
  recomputes live).
- On React Native, a Tailwind alias through another `--color-*` (`--color-surface: var(--color-bg)`)
  freezes to the light value (react-native-css 3.0.7 inlines once-declared variables in stylesheet
  order). Alias onto the theme token instead: `--color-surface: var(--bg)`.
