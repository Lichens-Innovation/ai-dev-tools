---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.tsx"
  - "**/*.jsx"
---
<!-- design-plugin:theme-rule -->
# Theme and colors

The project's colors, and its spacing, type and breakpoints where it has them, come from one
generated theme. Change the inputs and regenerate; never edit a generated file or write a value
the theme already has.

## Files

- **Inputs, the only hand-edited file:** `{{INPUTS}}`
- **Generated, never edit:** `{{GENERATED}}`
- **Regenerate after any change to the inputs:** `{{PALETTE_COMMAND}}`. It also audits contrast in
  both modes: read its `FAIL` and `WARN` lines, don't ignore them.

## Using the theme

- No hex, `rgb()`, `hsl()` or named color in a component, a stylesheet or a style prop. A color is
  a semantic token: `--bg`, `--bg-elevated`, `--text`, `--text-muted`, `--border`,
  `--primary-bg`, `--danger-text`…
- On a solid fill use the matching `--text-on-X` (`--text-on-primary` on `--primary-bg`), never
  white or black.
- Don't write light and dark values by hand, and don't branch on `prefers-color-scheme` in a
  component: the tokens already flip with the mode. Read a color as `var(--X)`, never as a
  JS value.
- No alpha tricks on a token to get a state (hover, active, disabled): use the state's token. A
  missing state is a new token (see below), not a one-off.
<!-- tailwind -->
- Use the namespaced utilities: `text-{{NAMESPACE}}-muted`, `bg-{{NAMESPACE}}-elevated`,
  `border-{{NAMESPACE}}`, `text-{{NAMESPACE}}-on-primary`. Don't add project aliases
  (`bg-surface`, `text-content`) and don't use opacity modifiers on them
  (`bg-{{NAMESPACE}}-hover/50`).
- Spacing, type, radius and breakpoints are Tailwind's own scale (`p-4`, `text-sm`,
  `rounded-md`): no pixel literals in a style prop.
<!-- /tailwind -->
<!-- css -->
- Spacing, font sizes, radius and breakpoints are the hand-authored tokens in the inputs file
  (`--spacing-md`, `--text-sm`, `--radius-md`…): no literal values in a component or stylesheet.
<!-- /css -->
<!-- sass -->
- In Sass, use the names from `{{SASS_FILE}}` (`$text-muted`…), not hand-written `var()`. No
  Sass math or color functions on them: use `calc()` or the palette's scale step.
<!-- /sass -->

## Changing the theme

1. A color or mode change: edit the inputs file, then regenerate.
2. A token the page needs and the theme lacks: ask the user. Don't invent a value or a name, and
   don't add a one-off in the component.
3. A semantic token pointing at the wrong scale step: use a token override at the end of the
   inputs file, then regenerate.
4. Mode-independent colors (a file-type icon, a brand logo) are not theme colors; keep them out
   of the inputs.

## Project notes

Notes here are kept when the plugin updates this rule.
