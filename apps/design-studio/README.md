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

## MCP tools

`list_pages`, `get_page`, `create_proposal`, `write_page` (proposals only; needs the `baseHash` of the last read),
`get_selection`, `get_palette`, `set_palette`, `open_page`.

## Routes

| Route                | What it does                                                                     |
| -------------------- | -------------------------------------------------------------------------------- |
| `/`                  | List of pages                                                                    |
| `/pages/$kind/$name` | A page's reference or proposal in an iframe, reloaded when its file changes      |
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
