# Design studio: footer tabs with an Inspect tab for the selected element's tokens

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

In the design studio, the token inspector (the trace of every style of the selected element that comes from a token) sits crammed in the editor's right side panel. Move it into the palette footer, which becomes tabbed:

- **Palette**: the colors of the current mode (today's default footer view).
- **Full palette**: every token in both modes, with the semantic mapping (today's Advanced view). Remapping a semantic token (pointing `--primary` at another color) stays here only.
- **Inspect**: the token trace of the element selected in the page, as a full-width table: property, token chain (`--primary → --blue-base`), light value, dark value, source class or rule, and the literal/off-token flags. It works on read-only references (click to inspect) and in proposals (the editor's selection). With nothing selected, it says how to select.

Each Inspect row offers two separate actions, so changing one element is never confused with changing the whole palette:

1. **The color square opens a color picker that changes the token's value**, the same way the footer's swatches already do. It goes into the shared palette draft, the page re-themes live, and the footer's Save writes it. For a semantic token, the picker edits the color at the end of the chain, and the row names it and how many tokens use it (for example "edits `--blue-base`, used by 6 tokens"). Colors derived from a base step can't be picked, as in the footer today; the row says to edit the base. Non-color tokens (spacing, radius, breakpoints) have no square, because the palette doesn't edit them.
2. **The token name is a dropdown with a search bar that switches the token for this element only.** It lists the tokens of the property's kind: colors with swatches for color properties, the spacing scale for padding, margin and gap, radii for border-radius, and so on. Each entry shows its light and dark values, filtered as you type. Picking one writes the override into the proposal's `data-studio` block, like today's token swap, and updates the editor. On a reference, the dropdown is disabled and offers Create proposal.

The active tab and the footer's height are remembered per project like the footer's other choices. The footer gets a resize handle, because Inspect needs more room than Palette. The `design-studio:token` event and clicking a token still open the footer on that token in a palette tab. The editor's side panel keeps only GrapesJS's own panels. MCP `get_selection` still returns the same trace. Update the studio README's shell and "Editor and token inspector" sections.

## Acceptance criteria

- [ ] The palette footer has Palette, Full palette and Inspect tabs; the token trace no longer appears in the editor's side panel
- [ ] Selecting an element in a reference or a proposal shows its trace in Inspect, with chains, light and dark values, sources and literal/off-token flags
- [ ] Changing a color with a row's square updates the palette draft at the end of the token chain and re-themes the page live; the row names the edited token and how many tokens use it; derived steps and non-color tokens can't be picked
- [ ] A row's searchable dropdown lists only tokens of the property's kind with their values, and picking one writes a `data-studio` override for that element only in a proposal; it is disabled on a reference
- [ ] The active tab and the footer height persist per project; the footer is resizable
- [ ] The `design-studio:token` event and MCP `get_selection` behave as before
- [ ] Tests cover the token-kind filtering of the dropdown and the chain-end resolution of the picker; the studio's test, lint, type check and build pass
- [ ] The studio README describes the tabs and the two actions

## Blocked by

None — can start immediately
