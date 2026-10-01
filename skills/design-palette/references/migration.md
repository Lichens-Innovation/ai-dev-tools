# Migrating existing tokens

Goal: fill the inputs block from what the project already has, generate, then (on request)
rewire component references to semantic tokens.

## Steps

1. **Inventory.** List every custom property, Tailwind theme color and hard-coded color, with
   usage counts. Group near-duplicates (ΔE < 2) and report the merges.
2. **Pick inputs.** Map existing values to inputs with the tables below. When a source only has
   one mode, reuse it for both and flag the dark values for review.
3. **Write inputs, run `palette.ts`, review the audit.**
4. **Rewire (only when asked).** Replace old references with the semantic tokens below, and old
   Tailwind classes with the namespaced ones ([Tailwind classes](#tailwind-classes)). Show the
   codemod diff; never apply silently.
5. **Remove** old variables only after no reference remains.

## Common sources

### shadcn/ui

| shadcn                                  | Input / token                                         |
| --------------------------------------- | ----------------------------------------------------- |
| `--background` / `--foreground`         | `background` / `font` inputs                          |
| `--primary` / `--primary-foreground`    | `primary` input / `--text-on-primary`                 |
| `--secondary`, `--accent`               | `secondary` input; `--accent` surfaces → `--bg-hover` |
| `--muted` / `--muted-foreground`        | `--bg-soft` / `--text-muted`                          |
| `--card`, `--popover` (+ `-foreground`) | `--bg-elevated` (+ `--text`)                          |
| `--border` / `--input` / `--ring`       | `border` input / `--border-input` / `--focus-ring`    |
| `--destructive`                         | `danger` input                                        |
| `.dark { … }` values                    | the `-dm` inputs                                      |

### Separate light/dark variables

`--x-light` / `--x-dark` (or `--prefix-x-light`) used to pick a mode → `--x-lm` / `--x-dm`.
Drop the prefix; replace `light-dark(var(--x-light), var(--x-dark))` wrappers with `var(--x)`.

### Raw scales (`--blue-500`, Tailwind `blue-*`)

Choose one step per brand/status color as its input (usually the 500/600). Keep Tailwind's own
palette for charts and one-offs; do not re-declare it. Components move to semantic tokens.

### Tailwind classes

Every palette class becomes `<utility>-<ns>-…` (`palette-structure.md`, "Tailwind names"). For a
class `<utility>-<color>` (with any variant prefix and `/opacity` suffix kept as they are):

1. Resolve `<color>` to its theme token: a palette name is the token itself (`bg-primary-bg` →
   `--primary-bg`), a project or kit alias is the token it points at (`bg-surface` → `--bg`).
2. On `text-`, `bg-` and `border-*` / `divide-`, use the short name when the token has one for
   that utility: `--text-muted` → `text-noa-muted`, `--bg` → `bg-noa`, `--primary-bg` →
   `bg-noa-primary-subtle`, `--primary-text` → `text-noa-primary`.
3. Otherwise use the full name: `<utility>-noa-<token>` (`ring-noa-focus-ring`,
   `text-noa-bg-hover` for a background token used as a text color).

One exception, before step 2: an intent's fill used as text or border (`text-primary`,
`border-danger`) moves to its readable text or strong border: `text-noa-primary` (`--primary-text`),
`border-noa-danger-strong` (`--danger-border-strong`). They are the fill when it is readable, so
most keep their color; a fill below 4.5:1 as text (or 3:1 as a border) gets the darker step, which
fixes that contrast. Say which ones changed. Then delete the aliases, and check every other rewrite
compiles to the same value.

Opacity modifiers (`/50`, `/[0.075]`, common in shadcn and gluestack classes) go to the token for
the state they fake: a fill at `/80`–`/90` on hover → `-hover`; `bg-noa-hover/20`…`/80` →
`bg-noa-hover` or `bg-noa-active`; `bg-noa-X/20` → `bg-noa-X-subtle`; a focus or invalid ring →
`ring-noa-focus-ring` / `ring-noa-focus-ring-danger`; a disabled fill → `bg-noa-disabled`. Drop
`dark:` variants that only re-tune the alpha: the tokens already change per mode. These change
the color: list them.

### Older versions of this palette

| Old                                           | New                                         |
| --------------------------------------------- | ------------------------------------------- |
| `-lightest` / `-light` / `-dark` / `-darkest` | `-faint` / `-soft` / `-strong` / `-intense` |
| `--surface`, `--X-surface`                    | `--bg`, `--X-bg`                            |
| `--surface-sunken` / `--surface-raised`       | `--bg-inset` / `--bg-elevated`              |
| `--on-X`                                      | `--text-on-X`                               |
| `--font`, `--background` used in components   | `--text`, `--bg`                            |
| `--bg-strong` / `--bg-intense` as a border    | `--border` / `--border-strong`              |
