# Design studio

A local, single-user replacement for Claude Design in the [design plugin](../../plugins/design)'s loop. It serves
one project's design pages in the browser, and exposes the same pages to Claude Code over MCP, so a proposal written
by Claude shows up live in the page you have open.

## Run it on a project

One container per target project. The project is mounted read-write at `/project`, and the compose name keeps
several projects apart:

```bash
cd apps/design-studio
PROJECT_DIR=/path/to/project docker compose -p design-myproject up --build
# http://localhost:3009
```

| Variable      | Default | Meaning                                                |
| ------------- | ------- | ------------------------------------------------------ |
| `PROJECT_DIR` | none    | The project folder to mount (required)                 |
| `STUDIO_PORT` | `3009`  | Port the app listens on, host and container            |
| `HOST_UID`    | `1000`  | User the container runs as, so written files are yours |
| `HOST_GID`    | `1000`  | Group, same reason                                     |

Connect Claude Code:

```bash
claude mcp add --transport http design-studio http://localhost:3009/mcp
```

## The project it expects

```
design.manifest.json            palette entry: inputs file, outputs, palette.ts copy, namespace
design/
  assets/project.css            captured CSS, images, fonts: assets/<hash>.<ext>
  components/<kebab>.html       reference snapshots (read only)
  screens/<kebab>.html
  proposals/<kebab>.html        editable copies, what the design loop implements
  proposals/screens/<kebab>.html
  index.json                    the catalog
```

Pages are full HTML documents linking `../assets/project.css` (`../../assets/` for proposals/screens). A page may
load nothing but files under `design/assets`.

## The shell

Every page has a navbar (sidebar toggle, palette and Tailwind links, the section shortcuts of the open page, a
light/dark switch, side by side), a sidebar listing the pages of `design/index.json` (each opens its proposal if
there is one, else its reference) and a palette footer. The light/dark, side-by-side, sidebar and footer choices are
remembered per project in the browser.

The footer has three tabs, and a handle on its top edge to resize it (drag, or the arrow keys; double-click for the
default height). The active tab and the height are remembered per project, like the other choices.

- **Palette**: the colors of the current mode and the hand-authored tokens (both modes; breakpoints are read only).
- **Full palette**: the same, plus every generated token and which token each semantic token points to. Re-pointing a
  semantic token (`--primary` at another color) is done here only.
- **Inspect**: the token trace of the selected element (see below).

The first two edit a draft of the palette, which re-themes the open page live and is shared with `/palette` and
`/tailwind`. **Save** writes the inputs file and regenerates the outputs like the project's palette script; if the file
changed on disk since it was read, it reports the conflict, reloads and keeps the draft. **Reset** drops the draft.

A page can open the footer on a token (in a palette tab) by dispatching `window.dispatchEvent(new CustomEvent('design-studio:token',
{ detail: { token: 'link' } }))`.

## Editor and token inspector

A reference opens read only: click an element to inspect it. **Create proposal** copies it and opens the copy in the
GrapesJS editor (select, move, resize, edit text, add elements, restyle). Edits are saved into the page body and its
`<style data-studio>` block, the overrides the design loop reads. **Save** (Ctrl+S) checks the file did not change on
disk since it was opened; if it did, choose **Reload** or **Overwrite**. When Claude writes the open proposal, a banner
offers to reload it. Side by side, the editor shows light and a live copy shows dark.

### Moving, copying and adding

Editing a proposal works like moving things in Figma. The result is always a layout the design loop can implement
(order in the DOM, `margin: auto`, the container's alignment, written as `data-studio` rules), never `position:
absolute`, `top` or `left`.

- **Drag the selected element** itself (not only the toolbar's move icon). It follows the cursor freely, and a marker
  shows the drop: a line between two elements, a dashed box when it goes into another box, a line at the far end or
  the middle of its row when it will be pushed there. On release: between two elements it is moved there in the order;
  into another box it is moved into it at that spot; at the far end of its row (or column) it gets `margin-left: auto`
  (`margin-top` in a column), at the centre both margins; as the only child of its box, the box's alignment
  (`justify-content`, or `align-items` in a column) changes. A plain box is made a flex box when the push needs it.
  Moving an element forgets an earlier push. Esc cancels a drag.
- **Add tab**: **Components** lists the project's captured component references, each with a small preview. Dragging
  one in inserts its real markup (the project's classes, so it looks right at once) with `data-component="<name>"`
  (the name in `design/index.json`) on its root. Copies of an element carrying `data-component` keep it. The plain HTML
  blocks stay under **Elements**.
- **Copy, paste, duplicate**: Ctrl+C / Ctrl+V (a paste goes after the selected element), Ctrl+D duplicates in place.
  The clipboard (markup and the rules of the element's ids) is kept in the browser per project, so an element copied
  in one proposal can be pasted into another.
- **Keyboard**: Alt+arrows move the selection before or after its siblings; Delete removes; Ctrl+Z / Ctrl+Shift+Z undo
  and redo. Each gesture above is one undo step.
- **Line-up buttons** on the selection's toolbar set its container's alignment: start, centre, end, space between
  ("push this to the right").
- **Layers tab**: the element tree, named by `data-component` where present. Click selects; drag a row above, below or
  into another, with the same rules as the canvas.
- The **?** next to the tabs lists these shortcuts.

The editor's side panel has the Style, Add and Layers tabs. The token trace of the selected element is the
footer's **Inspect** tab, a full-width table that works on a reference (click to inspect) and on a proposal (the
editor's selection); with nothing selected it says how to select. Each row has the property, the token chain
(`--primary → --blue-base`), the light and dark values, the class or rule it comes from, and a flag when the value is a
raw one that matches a token (`literal`) or none (`off-token`). Click a token in a chain to open it in the palette.

Each row has two separate actions, so changing one element is never confused with changing the whole palette:

1. **The color square changes the color.** The light and dark squares open a color picker for that mode's value of the
   palette color at the end of the chain. It goes into the shared palette draft, the page re-themes live and the
   footer's **Save** writes it. The row names the color and how many tokens use it ("edits `--primary`, used by 6
   tokens"). A color derived from a base step cannot be picked (the row says to edit the base), and nor can a token
   that is not in the palette; spacing, radius and other non-color tokens have no square.
2. **The token name switches the token for this element only.** It is a dropdown with a search bar that lists the
   tokens of the property's kind (colors with swatches for color properties, the spacing scale for padding, margin and
   gap, radii for border-radius, type sizes for font-size), each with its light and dark values. Picking one writes
   the override into the proposal's `<style data-studio>` block. On a reference the dropdown is disabled and the tab
   offers **Create proposal**.

MCP `get_selection` returns the same trace.

## MCP tools

`list_pages`, `get_page`, `create_proposal`, `write_page` (proposals only; needs the `baseHash` of the last read),
`get_selection`, `get_palette`, `set_palette`, `open_page`.

## Routes

| Route                | What it does                                                                     |
| -------------------- | -------------------------------------------------------------------------------- |
| `/`                  | List of pages                                                                    |
| `/pages/$kind/$name` | A reference (read only, inspectable) or a proposal in the editor                 |
| `/palette`           | The palette card: colors, contrast audit, semantic mapping, tokens, components   |
| `/tailwind`          | The Tailwind classes card: every utility under the project's namespace           |
| `/render/*`          | The raw files of `design/`, e.g. `/render/proposals/button.html`, for Playwright |
| `/events`            | Server-sent events: file changes and `open_page` requests                        |
| `/mcp`               | MCP, Streamable HTTP                                                             |
| `/api/selection`     | `PUT` the editor selection (browser), `GET` it                                   |

## Develop

```bash
pnpm --filter design-studio dev     # PROJECT_ROOT=/path/to/project STUDIO_PORT=3009
pnpm --filter design-studio test
pnpm --filter design-studio lint
pnpm --filter design-studio build
```
