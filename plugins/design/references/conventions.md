# Conventions for Claude Design

The plugin's part of the project's design-sync readme header (`readmeHeader` in
`.design-sync/config.json`, e.g. `.design-sync/conventions.md`), which `/design sync` publishes
as the project's README so Claude Design follows the proposal model
([proposals.md](./proposals.md)).

Only the block between the two markers below goes into the project, markers included:
`plugin-files.mjs conventions` prints it with this text's hash in the start marker, so a later
plugin can tell when this text changed
([plugin-files.md](../skills/design-refresh/references/plugin-files.md#conventions)). Fit it to
the project (the provider's name, e.g. `window.RegloUI.DesignProvider`) and keep the project's own
notes outside the markers.

Editing the block below changes what `design-refresh` offers every project after the next plugin
version: keep it to what Claude Design needs in any project.

<!-- design-plugin:conventions -->
- **Theme first.** For a change to color, spacing, type or radius, start with the palette card
  (`Palette.dc.html`), not the components: one change there re-themes every component and page,
  so the app stays uniform. In the defaults of its `data-props`:
  - `inputs`: the palette colors, each with a light (`lm`) and a dark (`dm`) value;
  - `tokens`: the hand-authored values (spacing, type, radius…), the same in both modes;
  - `overrides`: a semantic token re-pointed to another token, in both modes, e.g.
    `{ "link": "info-text" }` for links in the info color (`null` when there are none). Only
    semantic tokens take one, and never in a loop.

  Then tell the user to run `design-loop` in the repo: it applies the card to the theme (the
  values and the token-override block of its inputs file, e.g. `theme.inputs.css`). A token the card doesn't have can't
  be added from it: suggest its name and value for the repo instead. Only when no input, token or
  override can express the change, write a component proposal (below), with the semantic tokens
  (`var(--…)`) there, never raw hex or palette steps.
- **Palette requests** ("Update the palette in Palette.dc.html: …", copied from the palette
  footer) change only the listed entries in those three defaults, and leave the rest of the file
  as is. Never edit `styles.css`, `tokens/` or the synced components for them: the repo applies
  the palette and the next sync brings it back.
- **Always wrap in the design provider** and let it pick the mode; don't set a page background
  in hex (use `var(--bg)`). Without it, a page follows the viewer's OS mode.
- **Proposals for a component change** go in `proposals/<component>.html`. Render the synced
  component inside the provider's side-by-side mode (`mode="both"`) and put the change in
  page-local CSS or props, scoped to what changes. Never edit `components/`, `_ds_bundle.*` or
  `styles.css`: they are synced from the repo and overwritten on every sync.
- **Screens** (`screens/<name>.html`) are mockups of the app's pages, rebuilt from the code:
  don't edit them. A screen change goes in `proposals/screens/<name>.html`, a copy of the mockup
  with the change, in the same mode. Its layout may be restructured with the semantic tokens and
  the synced components; its data is illustrative. A change to a component itself goes in that
  component's proposal.
<!-- /design-plugin:conventions -->
