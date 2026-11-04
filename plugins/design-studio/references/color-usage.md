# Color usage

How a page uses the project's colors. The palette itself (inputs, scales, semantic tokens, naming,
generation) belongs to `design-palette` and `palette.ts`
([`palette-structure.md`](../skills/design-palette/references/palette-structure.md)): never build a
ramp, rename a token or pick a notation here. A proposal only **uses** tokens; a token it needs and
does not find is a question for the user, not a new value.

Adapted from the usage and contrast rules of `better-colors` in
[jakubkrehel/skills](https://github.com/jakubkrehel/skills) (MIT, © 2026 Jakub Krehel), with its
palette-building rules left out: they conflict with the canonical palette.

## Measured, not estimated

Never claim a contrast you did not measure. Two sources count: the palette's own audit
(`get_palette` returns it), and a ratio computed from the resolved values of a pair the audit does
not cover. A token choice, a hue or a mood is a design decision; a failing pair, a token used
against its role and a meaning carried by color alone are findings.

## Pairs the palette already checks

`palette.ts` audits these in both modes, so using them as intended needs no measurement:

| Foreground                     | On                                          | Threshold   |
| ------------------------------ | ------------------------------------------- | ----------- |
| `--text`, `--text-muted`       | `--bg`, `--bg-elevated`, `--bg-inset`       | 4.5:1       |
| `--X-text`                     | `--bg`, `--bg-elevated`, `--X-bg`           | 4.5:1       |
| `--text-on-X`                  | `X` (the brand or status fill)              | 4.5:1       |
| `--link`                       | `--bg`                                      | 4.5:1       |
| `--border-input`, `--focus-ring`, `--focus-ring-danger`, `--X-border-strong` | the backgrounds | 3:1 |

`X` is every brand and status color (`primary`, `danger`…). Anything else is unmeasured until you
measure it: `--text-muted` on `--X-bg`, text on `--bg-hover`, any text on an image, a gradient, or
a color with transparency.

`--text-faint` (and `--text-disabled`, `--border-input`) is about 3:1: for disabled text,
placeholders and input borders only, never for text people need to read. Secondary text is
`--text-muted`.

## Measure the rendered pair

Measure a foreground against the background it actually sits on: the nearest ancestor that paints
one, not the page. Resolve both tokens for the mode (the `get_palette` values), then compute the
WCAG 2 ratio, in **both modes**: a pair that passes in light can fail in dark.

| Content                                             | WCAG 2 AA |
| --------------------------------------------------- | --------- |
| Text                                                | 4.5:1     |
| Large text (at least `24px`, or `18.67px` bold)     | 3:1       |
| UI components and graphical objects (icons, borders that identify a control) | 3:1 |

Disabled controls and logos are exempt. Text with transparency (`/50`, `rgba(`, `color-mix(` with
`transparent`), text on a translucent surface, on an image or on a gradient: measure the worst
region it can sit on, or use a solid token or a scrim instead.

When a pair fails, change the pairing (another token whose role fits), never write a literal. If no
token fits, report the pair, both measured ratios and the threshold to the user: a palette change is
theirs to make (the palette page or `design-palette`). When asked to fix a value, change its
**lightness**, the channel contrast responds to, not its hue.

## Use a token only in its role

Never borrow a token because its value looks right today: a border token as text color, a text
token as a background. It breaks at the next theme change, in one mode first. The roles are the
semantic tokens of the palette: backgrounds (`--bg*`, `--X-bg*`), text (`--text*`, `--X-text`,
`--text-on-X`), borders (`--border*`, `--X-border*`), interaction (`--focus-ring*`, `--X-hover`,
`--X-active`), effects (`--overlay`, `--shadow`). Scale steps (`--primary-soft`, `--bg-soft`)
are the palette's inputs to those roles: a proposal uses the semantic token, not the step.

## One color, one meaning

A color means one thing across the whole interface. If `primary` means "interactive", a decorative
heading in `primary` is misleading, and so is an interactive element left neutral. Status colors
(`danger`, `warning`, `success`) mark that status only: never `danger` on a non-destructive action.
Treat two hues within about 15° of each other as the same color (the palette audit flags brand and
status look-alikes).

Never let color carry meaning alone: an error, a status, a selected item, a required field also
has an icon, a label or a shape.

## One filled action per view

When a filled color marks the primary action, one action per view gets it and its peers stay
neutral (outline, ghost, text). The color goes on the background (`X` with `--text-on-X`), not the
label: accent text on a neutral button reads as a link. A selected tab or a checked segment is
state, not emphasis, and may use the accent. Several colored fills are fine when they encode
distinct states or categories rather than competing actions.

## Dark is not the light page inverted

Both modes come from the palette, so a page that uses semantic tokens gets its dark mode for free.
What breaks it: a literal, a scale step chosen by eye in light mode, a shadow that only reads on
white, an image or illustration with a white background. Check every proposal in both modes.

## Gradients and color across cultures

Keep text off gradients; when it must sit on one, measure the worst region. Interpolate in
`oklab` by default (`linear-gradient(in oklab, …)`), `oklch` when a two-hue gradient goes gray in
the middle; a gradient's stops are tokens too. Where color carries financial meaning (gain and
loss), it depends on the locale: red is a gain in Chinese financial UIs.

## Before you finish

| Pattern                                                           | Fix                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A hex, `rgb(`, `hsl(` or `oklch(` literal in the page              | The semantic token for that role                                        |
| A scale step (`--primary-soft`, `--bg-soft`) on an element         | The semantic token that points at it (`--primary-bg-hover`, `--bg-active`) |
| `--text-faint` or `--text-disabled` on text people must read       | `--text-muted`                                                          |
| A border token in `color:`, a text token in `background:`          | The token of the missing role, or ask                                   |
| Two or more filled `primary` buttons side by side                 | One filled, the others outline or ghost                                 |
| `danger` on an action that destroys nothing                       | A neutral or brand treatment                                            |
| A status, error or selection shown by color alone                 | Add an icon, a label or a shape                                         |
| Text on an image, a gradient or a translucent surface, unmeasured | Measure the worst region, or add a scrim                                |
| A pair outside the audit table, checked in one mode               | Measure it in light and dark                                            |
| A contrast fix that changes hue                                   | Change lightness, or pick another token                                 |
