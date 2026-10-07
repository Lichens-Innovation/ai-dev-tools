# Palette preview card

[`templates/palette-preview.dc.html`](../templates/palette-preview.dc.html) is a Claude Design
card: the palette grid (editable per mode), contrast audit, semantic mapping, the hand-authored
tokens (editable, both modes), a demo of common components, and a theme/Tailwind export.

## Shared navbar

The card has no navbar of its own: it loads [`templates/design-nav.js`](../templates/design-nav.js),
uploaded to the project root as `design-nav.js`. Synced cards and proposals load the same file
through the design provider ([proposals](../../../references/proposals.md#side-by-side-modes-and-the-navbar-in-the-design-provider)),
so every card in the project shares:

- **Palette link**: a palette icon in the navbar and at the top of the sidebar opens the palette
  card, the project's start page. To its right, in the navbar and the sidebar, a Tailwind icon
  opens the [Tailwind classes card](#tailwind-classes-card) when the project has one.
- **Hamburger button and sidebar**: the palette link, then **Pages** (the screen mockups, from
  `screens/index.json`, written by `design-refresh`), then every other card grouped as in the
  Design System view, from the `_ds_manifest.json` Claude Design compiles at the project root.
  A click opens that page in place. The sidebar starts open on wide screens and remembers its
  state; on narrow screens it covers the page and closes after a pick. Proposals are not listed.
- **Section shortcuts**: the elements marked `data-nav-section="<label>"` (Palette, Tokens and
  Components here), or a synced card's stories.
- **Light / dark switch**: sets `data-theme` and `color-scheme` on `<html>` and is remembered for
  the whole project. The palette card follows it through the `design-nav:mode` event.
- **Palette footer**: a bar fixed to the bottom of every card that opens a panel with each palette
  input (value for the current mode, color picker and hex field). Edits re-theme the page live,
  so a color can be judged on the real components; the badges count the changes and the contrast
  failures they cause. The changes are a draft kept in the browser for the whole project and
  shared with the palette card's swatches. **Copy request** copies a short request listing them,
  to paste in Claude Design's chat so it updates `Palette.dc.html`; **Reset** drops the draft.
  The footer reads the saved inputs and the palette engine from `Palette.dc.html` itself (its
  `data-props` and its script up to the component class), so it only appears when that card is
  at the project root, and changes the card already has drop out of the draft.
- **Token group**: below the colors, **Tokens · both modes** lists the card's hand-authored
  tokens (`--spacing-*`, `--text-*`, `--font-*`…), one text field per value. A valid value (not
  empty, no `;`, `{` or `}`) re-themes every card live, joins the request as a `token` line and
  is kept in its own draft beside the colors; **Reset** drops both. Names are fixed: components
  compile against them. Breakpoints are read only, since media queries cannot read `var()`.
  `window.designNav.tokens` is the drafted values, `setTokens(tokens)` replaces them, and the
  `design-nav:palette` event carries `{ inputs, tokens, overrides }`.
- **Advanced view**: the footer's **Advanced** button (remembered per project; turning it on
  opens the panel) adds every generated token, grouped as neutrals then one group per color,
  with its swatch and value in the current mode. A semantic token gets a picker of the token it
  references: **auto** is the generated reference, any other choice is a
  [token override](palette-structure.md#token-overrides), the same in both modes. Choices that
  would loop are not offered. An override re-themes the cards live, counts in the audit badge,
  joins the request as an `override` line and has its own draft; the row's × goes back to the
  saved reference and **Reset** drops it with the rest. `window.designNav.overrides` is the
  drafted `{ token: target }`, `setOverrides(overrides)` replaces it (invalid ones are ignored).

The card's **Tokens** section (shown when the card has tokens) groups the same values as Type,
Spacing, Shape, Breakpoints and Other, each with a live sample (a bar for spacing, a box for a
radius, text for type). Editing a field there updates the footer's draft and the other way
round; an invalid value stays in its field, outlined in red, and the card keeps the saved one.
The **Export → Web** tab ends with the token values in use.

## Tailwind classes card

[`templates/tailwind-classes.html`](../templates/tailwind-classes.html), uploaded to the project
root as `Tailwind.html` by `design-init` when the palette has a Tailwind namespace, lists every
class the palette generates: the text, background and border names (`text-noa-muted`,
`bg-noa-primary-subtle`, `border-noa-danger-strong`, …) grouped by color, then every token by its
full name on a chosen utility (`ring-noa-focus-ring`). Each class shows its swatch, the token it
points to and its value in the current mode; a click copies it, and a filter narrows the list.

It has no palette code or inputs of its own: it takes the engine, the inputs and the namespace
from `design-nav.js` (`window.designNav.engine`, `.palette`, `.namespace`), which reads them from
`Palette.dc.html`. So it follows the light/dark switch and the palette footer's draft, and needs
both files beside it. It is plain HTML, without `support.js`.

## Where the colors and tokens live

The card reads the project palette from its `inputs` prop (`{ "primary": { "lm": "#…", "dm": "#…" }, … }`)
the hand-authored token values from its `tokens` prop (`{ "spacing-md": "1rem", … }`) and the
token overrides from its `overrides` prop (`{ "link": "info-text" }`), all written by
`palette.ts --to-card`. Its Semantic section marks an overridden token with "(override)". Swatch, field and footer edits are a draft; to keep them, paste
the footer's **Copy request** in Claude Design's chat (or paste the card's **Export → Inputs JSON**
into `inputs`). The card's `inputs`, `tokens` and `overrides` are what `design-loop` applies when the palette
is approved: `--from-card` rewrites the values in the inputs file in place and ignores a token
name the file lacks (add new tokens to the file, then re-seed the card); it adds, rewrites or
removes override lines in the overrides block and fails, writing nothing, on an invalid one.
A component may not use the input its name suggests (a "primary" button can be filled with
`--secondary`): the footer shows which input moves it.

## Push the card

`design-init` does this automatically (seed + reconcile). Manually:

1. Write the inputs, token values and title: `node palette.ts <canonical> --to-card <card> --title "<name>" --namespace <palette.namespace>`
   (the card's Tailwind export uses it).
2. Upload it to the bound project's root as `Palette.dc.html`, with `design-nav.js` beside it
   (`DesignSync finalize_plan`, then `write_files`). The Pages list only shows root files, and
   the Design System view labels each card by its file name.
3. If the root has no `support.js` (`DesignSync list_files`), write it with the Claude Design
   tool's `create_support_js`. The card does not render without it; never overwrite an
   existing one.
4. Record the card in the manifest's `palette` entry (contract §2). Approving the palette card
   triggers `design-loop` to copy the approved inputs back into the canonical file and re-run
   `palette.ts`.

A newer plugin brings a newer card: `design-refresh` (and `design-loop` before implementing) puts
the plugin's card code in place and keeps the card's data (`data-props`), with the navbar beside
it ([plugin-files.md](../../design-refresh/references/plugin-files.md)).

The first line, `<!-- @dsCard group="Colors" -->`, files the card under **Colors** in the Design
System view. Keep it when editing the card.

## Limits

- The card does not embed Storybook stories. Inside Claude Design a card is a
  `claudeusercontent.com` frame nested in `claude.ai`: browsers' Local Network Access protection
  blocks such a frame from loading `http://localhost` without a prompt (Firefox logs
  `prompt action: auto_deny`), and a private Chromatic permalink redirects to a login page that
  refuses to be framed. To see palette changes on real components, run `/design sync` after
  `design-loop` applies the palette: the synced cards render the shipped components.
- Deleting or moving a card file can leave a stale "file not found" entry in the Design System
  view (Claude Design keeps it in its generated `_ds_manifest.json`). Upload the card at its
  final path the first time.
