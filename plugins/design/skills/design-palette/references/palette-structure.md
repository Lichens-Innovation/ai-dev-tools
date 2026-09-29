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

Every input has `-lm` (light mode) and `-dm` (dark mode). Mode is switched by `color-scheme`
on `:root` (web, via `light-dark()`) or `prefers-color-scheme` (Tailwind / React Native).

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

## 4. Interaction and effects (not derivable from scales)

- `--X-hover` / `--X-active`: lightness shift +0.07 / +0.12, reversed when the color is already light (L > 0.78)
- `--overlay`, `--shadow`: per-mode values

## Contrast audit

`palette.mjs` checks both modes:

- 4.5:1 text: `-text` on `-bg`, `--text-on-X` on `X`, `--text`/`--text-muted` on `--bg`/`--bg-elevated`/`--bg-inset`, `--link`
- 3:1 UI: `--border-input`, `--focus-ring`
- visible states (ΔL ≥ 0.04): `-hover` vs base, `-bg-hover` vs `-bg`, `--bg-hover` (advisory)
- advisory: brand fill visible on page (3:1), very light inputs (L > 0.9)

## Known limits

- Dark faint/soft are mixes: relative color syntax cannot read the background's lightness.
- `--text-on-*` is decided at generation time; re-run after changing inputs.
- Tailwind hex values are computed to match the browser; very saturated colors may differ by a shade.
- Web output needs `light-dark()` and relative color syntax (browsers from ~2024).
