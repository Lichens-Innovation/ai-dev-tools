# Design studio shell, palette page and palette footer with Save

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

Work on branch feat/design-studio. Port the design plugin's Claude Design navigation and palette card into the design studio as native React, keeping their features and behaviour but saving directly instead of producing a request to paste into Claude Design. The sources to port are the plugin's design-palette templates: design-nav.js (the shared navbar) and palette-preview.dc.html (the palette card), plus tailwind-classes.html, with preview-card.md describing the behaviour.

Shell on every studio page: a fixed navbar (sidebar toggle, palette and Tailwind links, page title, section shortcuts from data-nav-section, light/dark switch that sets data-theme and color-scheme on the rendered page and is remembered per project) and a sidebar listing Palette, Tailwind, Pages (screens) and Components grouped from the project's design/index.json, each opening its proposal when one exists, else its reference. Light, dark and side-by-side (the page mounted twice, one per mode) views.

Palette footer on every page: the palette inputs for the current mode (color picker + hex), the hand-authored tokens (both modes; breakpoints read only), and the Advanced view re-pointing semantic tokens, all as a live draft that re-themes the open page, with badges for change count and contrast failures. Save calls the project store's palette.save with the draft and its base hash (on Conflict, reload and keep the draft visible); Reset drops the draft. It listens for a 'design-studio:token' window event ({ detail: { token } }) and opens with that token focused, so the editor's token inspector can hand a token over.

/palette: the palette card as a page (grid per mode, contrast audit, semantic mapping with Advanced overrides, hand-authored tokens, component demo, theme/Tailwind export), sharing the footer's draft and saving through the same store call. /tailwind: the Tailwind classes card. Use the palette engine functions exported by the project's palette.ts rather than re-implementing them.

## Acceptance criteria

- [ ] The sidebar lists every page from design/index.json and opens it; the light/dark switch and side-by-side view work on any page and are remembered
- [ ] Changing a color or a token in the footer re-themes the open page live; Save writes the palette inputs file and regenerates the generated outputs (visible in git diff), and the result matches running the project's palette script
- [ ] A save after an external change to the inputs reports the conflict instead of overwriting
- [ ] Dispatching a design-studio:token event opens the footer on that token
- [ ] /palette and /tailwind reproduce the Claude Design cards' sections and share the footer draft
- [ ] Tests and lint for design-studio pass

## Blocked by

- `001-design-studio-core-project-store-mcp-endpoint-docker-live-page-view.md`
