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

The footer edits a draft of the palette: the colors of the current mode, the hand-authored tokens (both modes;
breakpoints are read only) and, with Advanced, which token each semantic token points to. The draft re-themes the open
page live and is shared with `/palette` and `/tailwind`. **Save** writes the inputs file and regenerates the outputs
like the project's palette script; if the file changed on disk since it was read, it reports the conflict, reloads and
keeps the draft. **Reset** drops the draft.

A page can open the footer on a token by dispatching `window.dispatchEvent(new CustomEvent('design-studio:token',
{ detail: { token: 'link' } }))`.

## Editor and token inspector

A reference opens read only: click an element to inspect it. **Create proposal** copies it and opens the copy in the
GrapesJS editor (select, move, resize, edit text, add elements, restyle). Edits are saved into the page body and its
`<style data-studio>` block, the overrides the design loop reads. **Save** (Ctrl+S) checks the file did not change on
disk since it was opened; if it did, choose **Reload** or **Overwrite**. When Claude writes the open proposal, a banner
offers to reload it. Side by side, the editor shows light and a live copy shows dark.

The side panel lists every style of the selected element that comes from a token: the token chain
(`--primary → --blue-base`), its light and dark values and the class or rule it comes from. Raw values are flagged as
matching a token or off-token. Click a token to open it in the palette footer; in a proposal, swap it for another
token. MCP `get_selection` returns the same trace.

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
