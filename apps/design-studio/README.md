# Design studio

A local, single-user replacement for Claude Design in the [design-studio plugin](../../plugins/design-studio)'s loop. It serves
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
  proposals/<kebab>.html        the proposal (version a), what the design loop implements
  proposals/<kebab>.<v>.html    alternate versions b..z, until one is used
  proposals/screens/<kebab>.html
  wireframes/<components|screens>/<kebab>/<name>.excalidraw
  requests/                     Make real requests (git-ignored)
  index.json                    the catalog
```

Pages are full HTML documents linking `../assets/project.css` (`../../assets/` for proposals/screens). A page may
load nothing but files under `design/assets`.

## The shell

Every page has a navbar (sidebar toggle, palette and Tailwind links, the section shortcuts of the open page, a
light/dark switch, side by side), a sidebar listing the pages of `design/index.json` (each opens its proposal if
there is one, else its reference, else its wireframes) and a palette footer. The light/dark, side-by-side, sidebar
and footer choices are remembered per project in the browser.

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

## A page: reference, proposal versions, wireframes

The bar above a page switches between its three views:

- **Reference**: the page as the code renders it today (read only).
- **Proposal**: the realistic HTML view of the design. You don't edit it by hand: ask Claude for changes ("make the
  header sticky"), or run `/design-in-studio <page> <brief>` for new versions from the plugin's designer agent, and
  the open page reloads when Claude writes it. What you change yourself are theme values: the
  palette in the footer, and token swaps in the Inspect tab. When a page has alternate versions, chips **A**, **B**,
  **C**… switch between them. On an alternate, **Use this version** makes it the proposal (the old proposal takes its
  letter) and **Discard** deletes it. Only the proposal (A) is what `/implement-design` implements.
- **Wireframes**: Excalidraw drawings of the page, where you try things yourself (see below).

## Token inspector

Click an element in a reference or a proposal: the footer's **Inspect** tab shows its token trace, a full-width table.
Each row has the property, the token chain (`--primary → --blue-base`), the light and dark values, the class or rule it
comes from, and a flag when the value is a raw one that matches a token (`literal`) or none (`off-token`). Click a
token in a chain to open it in the palette.

Each row has two separate actions, so changing one element is never confused with changing the whole palette:

1. **The color square changes the color.** The light and dark squares open a color picker for that mode's value of the
   palette color at the end of the chain. It goes into the shared palette draft, the page re-themes live and the
   footer's **Save** writes it. The row names the color and how many tokens use it ("edits `--primary`, used by 6
   tokens"). A color derived from a base step cannot be picked (the row says to edit the base), and nor can a token
   that is not in the palette; spacing, radius and other non-color tokens have no square.
2. **The token name switches the token for this element only.** It is a dropdown with a search bar that lists the
   tokens of the property's kind (colors with swatches for color properties, the spacing scale for padding, margin and
   gap, radii for border-radius, type sizes for font-size), each with its light and dark values. Picking one writes
   the override into the proposal version's `<style data-studio>` block (the element gets a `ds-…` id if it has no
   unique one). **Undo swap** (Ctrl+Z) takes the last swap back, unless the file changed since. On a reference the
   dropdown is disabled and the tab offers **Create proposal**.

MCP `get_selection` returns the same trace.

## Wireframes and Make real

A page can have several wireframes. **New wireframe** draws one from a version of the page (the proposal, an
alternate or the reference), laid out at the page's width: boxes, text, fields, buttons, images as cross-hatched
boxes, each shape remembering the page element it stands for. It can also start blank. **New blank page** (sidebar)
creates a page with no reference and an empty wireframe `main`.

Then it is Excalidraw: move, resize, retext, delete, draw new things, write notes to Claude. It autosaves (Ctrl+S saves
now); if the file changes on disk, a banner offers to reload it. Wireframes are plain Excalidraw files and open on
excalidraw.com.

**Make real** sends the selected shapes (or the whole wireframe when nothing is selected) to Claude: the studio writes
`design/requests/<id>.json` and a PNG. Claude reads what moved, changed or was deleted against the page it was drawn
from, writes the result as a **new alternate version** of the proposal, and the request list offers **Open version X**.
**Copy command** puts `/sketch-in-studio <id>` on the clipboard, the fallback when the Claude Code channel is not on. The
design-studio plugin's channel (`channel/design-channel.mjs`) follows `/events` and pushes new requests into the session;
start Claude Code with `claude --dangerously-load-development-channels plugin:design-studio@lichens-ai-dev-tools`.

## MCP tools

- Pages: `list_pages`, `get_page` (a reference or a proposal version), `create_proposal`, `write_page` (a proposal
  version; needs the `baseHash` of the last read), `create_alternate` (the next free letter), `open_page`.
- Wireframes: `list_wireframes`, `get_wireframe` (compact shapes, their source elements and changes, removed elements).
- Make real: `list_sketch_requests`, `get_sketch_request` (the compact wireframe and the PNG), `resolve_sketch_request`
  (`done` with the version written, or `failed`).
- `get_selection`, `get_palette`, `set_palette`.

## Routes

| Route                    | What it does                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `/`                      | List of pages                                                                                |
| `/pages/$kind/$name`     | A page: `?variant=reference`, `?variant=proposal&version=b`, `?variant=wireframe&wireframe=` |
| `/palette`               | The palette card: colors, contrast audit, semantic mapping, tokens, components               |
| `/tailwind`              | The Tailwind classes card: every utility under the project's namespace                       |
| `/render/*`              | The raw files of `design/`, e.g. `/render/proposals/button.html`, for Playwright             |
| `/events`                | Server-sent events: file changes, requests and `open_page` requests                          |
| `/mcp`                   | MCP, Streamable HTTP                                                                         |
| `/api/selection`         | `PUT` the browser selection, `GET` it                                                        |
| `/api/requests`          | `GET` the requests (`?status=pending`), for the channel                                      |
| `/api/requests/$id/sent` | `POST`: the channel delivered it (`pending` becomes `sent`)                                  |
| `/excalidraw-assets/*`   | Excalidraw's fonts, served locally                                                           |

## Develop

```bash
pnpm --filter design-studio dev     # PROJECT_ROOT=/path/to/project STUDIO_PORT=3009
pnpm --filter design-studio test
pnpm --filter design-studio lint
pnpm --filter design-studio build
```
