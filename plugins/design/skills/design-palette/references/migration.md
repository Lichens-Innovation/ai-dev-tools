# Migrating existing tokens

Goal: fill the inputs block from what the project already has, generate, then (on request)
rewire component references to semantic tokens.

## Steps

1. **Inventory.** List every custom property, Tailwind theme color and hard-coded color, with
   usage counts. Group near-duplicates (ΔE < 2) and report the merges.
2. **Pick inputs.** Map existing values to inputs with the tables below. When a source only has
   one mode, reuse it for both and flag the dark values for review.
3. **Write inputs, run `palette.mjs`, review the audit.**
4. **Rewire (only when asked).** Replace old references with the semantic tokens below. Show
   the codemod diff; never apply silently.
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

### Older versions of this palette

| Old                                           | New                                         |
| --------------------------------------------- | ------------------------------------------- |
| `-lightest` / `-light` / `-dark` / `-darkest` | `-faint` / `-soft` / `-strong` / `-intense` |
| `--surface`, `--X-surface`                    | `--bg`, `--X-bg`                            |
| `--surface-sunken` / `--surface-raised`       | `--bg-inset` / `--bg-elevated`              |
| `--on-X`                                      | `--text-on-X`                               |
| `--font`, `--background` used in components   | `--text`, `--bg`                            |
