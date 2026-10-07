# TODO

## Edit the hand-authored tokens in Claude Design

The palette card and its footer can edit the values of the hand-authored tokens (`--spacing-*`,
`--text-*`, `--font-*`…) like the color inputs. Names stay fixed (components compile against them)
and breakpoints are read only (media queries cannot read `var()`).

### Done

- `palette.ts`: the card's `tokens` prop (`{ "spacing-md": "1em" }`). `--to-card` writes it,
  `--diff-card` prints its diff, `--from-card` writes the values back into the inputs file in place
  (`withTokens`), ignores names the file lacks and rejects empty values or ones with `;`, `{`, `}`.
  Tested on a copy of the turborepo theme inputs.
- `design-nav.js`: a "Tokens · both modes" group in the palette footer (one text field per value,
  breakpoints disabled), its own draft (`localStorage` key `design-nav:tokens`), the values applied
  live on every card but the palette card, token lines in **Copy request**, `Reset` clearing both
  drafts, `window.designNav.tokens` / `setTokens()` and `tokens` in the `design-nav:palette` event.
  Syntax-checked only.
- `palette-preview.dc.html`: the `tokens` prop, a **Tokens** section (grouped Type, Spacing, Shape,
  Breakpoints, Other, with a live sample per value), the token values in its injected CSS and in
  the Web export, and the shared draft. Script and props checked with Node only.

### Left

- [ ] Test in a browser: no headless browser was available. Serve a folder holding `design-nav.js`,
      a seeded `Palette.dc.html` (`palette.ts <inputs> --to-card`) and a page loading both, then
      check the footer rows, the live values, Copy request and Reset. The card itself needs
      Claude Design's `support.js`: test it in a real project (`sc-if` around a `<section>`, the
      text `<input>` `onChange` firing per keystroke, `disabled="{{ … }}"`).
- [ ] Docs:
  - `skills/design-palette/references/preview-card.md`: the footer's token group, the Tokens
    section, "Where the colors live" (the `tokens` prop)
  - `skills/design-palette/references/palette-structure.md`: drop "Claude Design's palette card
    only edits the color inputs"
  - `references/design-contract.md` § Hand-authored tokens: "edited by hand, not by the palette
    card" is no longer true
  - `skills/design-loop/references/palette-item.md` step 2: "its hand-authored tokens stay as they
    are" becomes "receives the card's token values"
  - `skills/design-palette/SKILL.md`, `README.md`: mention the token editing
- [ ] Bump `.claude-plugin/plugin.json` to 0.4.0.
- [ ] Copy the new `palette.ts` into `turborepo/packages/theme/scripts/palette.ts` (design-loop
      flags a copy that differs from the plugin's).
- [ ] Existing behavior, worth a look: `--to-card` / `--from-card` add `font-inverted` and `border`
      to the inputs (`toInputs` fills the derived values in), so a `--from-card` run appends them
      at the end of an inputs file that left them out, pinning values that were derived.
