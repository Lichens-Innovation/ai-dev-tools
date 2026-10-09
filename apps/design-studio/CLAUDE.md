# design-studio

A local, single-user replacement for Claude Design in the design plugin's loop (`plugins/design`). It serves one target project's `design/` pages in the browser and exposes them to Claude Code over MCP. See `README.md` for running it.

## Stack

- **Framework**: TanStack Start (React 19, SSR-first, Vite-based), file-based routes in `src/routes/`
- **UI**: Tailwind CSS v4 through the shared `@repo/styles`, shared `@repo/ui` components (config lives in `styles.css`, not `tailwind.config.*`)
- **Tests**: Vitest (`test/`), node environment
- **Linting/formatting**: ESLint (`eslint.config.js`, the shared `@repo/eslint-config`) + Prettier (`prettier.config.js`)
- **Package manager**: pnpm (workspace `design-studio`)

## Architecture

One deep module, `src/server/design-project.ts` (`openProject(root)`), holds all the behaviour: pages, palette, watching. The UI server functions (`src/server/functions.ts`) and the MCP tools (`src/server/mcp.ts`) are thin over it. Keep it that way: a rule that matters to both belongs in `DesignProject`, not in a route or a tool.

| File                                          | What it does                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `server/design-project.ts`                    | `openProject`: `pages`, `palette`, `watch`. Errors are `Conflict`, `NotFound`, `Invalid` (`errors.ts`)  |
| `server/page-html.ts`                         | Checks a page loads only from `design/assets`; rebases asset links for `proposals/screens`              |
| `server/native-import.mjs`                    | Node's own `import()` for the project's `palette.ts` (Vite cannot transform it)                         |
| `server/selection.ts`                         | In-memory editor selection: the browser pushes, MCP `get_selection` reads. Not part of DesignProject    |
| `server/hub.ts`                               | Fan-out of watch events and `open_page` to the `/events` stream                                         |
| `server/studio.ts`                            | The process-wide singleton (project at `PROJECT_ROOT`, default `/project`, selection, hub)              |
| `palette/draft.ts`                            | Pure draft logic: a diff against the saved palette (`Draft`), merge, rebase, count, validation          |
| `palette/palette-state.tsx`                   | `PaletteProvider`/`usePalette`: the shared draft, debounced server preview, save, `design-studio:token` |
| `palette/theme.ts`                            | Themes an iframe (`data-theme`, `color-scheme`, draft css) or scopes the css for the studio's own pages |
| `studio/shell-state.tsx`                      | `ShellProvider`: mode, side by side, sidebar, footer, Advanced, remembered in localStorage per project  |
| `components/shell/`                           | Navbar, sidebar, page frame (one iframe per mode), palette footer                                       |
| `components/palette/`, `components/tailwind/` | The `/palette` and `/tailwind` pages                                                                    |
| `server/render.ts`                            | Safe static serving of `design/` for `/render/*`                                                        |

Rules of `DesignProject`:

- Pages are addressed by `{kind, name}` with `name` kebab-case, never by path. Nothing escapes `design/`.
- References are read only: there is no write for them. Only `saveProposal` writes, against a `baseHash` (stale = `Conflict`).
- Writes are atomic (tmp + rename). The watcher ignores `*.tmp`.
- `palette.save` imports the project's own `palette.ts` (manifest `palette.script`) and calls its exported functions, in the order its CLI does. If `palette.ts` changes its CLI flow, mirror it.
- The filesystem and `palette.ts` are used directly, with no ports. Tests copy `test/fixtures/project` to a temp dir.

## Palette in the UI

The browser never re-implements the engine: `palette.preview(draft)` (a `DesignProject` function, `previewPalette` server function) runs the project's own `palette.ts` and returns css, resolved tokens, semantic references, audit and Tailwind classes for a draft, without writing. The draft is a diff against the saved palette, kept in localStorage (`design-studio:<root>:draft`); Save sends it with the `baseHash` the inputs were read at. The project's tokens (`--bg`, `--primary`…) exist only inside iframes and `[data-studio-theme]`; the studio's own chrome uses the shared `--bg-elev`, `--ink`, `--line` tokens: do not mix them.

## Testing

`pnpm --filter design-studio test`. The fixture project ships a copy of the plugin's `palette.ts`; a test fails if it drifts from `plugins/design/skills/design-palette/scripts/palette.ts`, so copy it again when the plugin's changes. `vitest.config.ts` loads `native-import.mjs` as an external module: do not remove that, the palette import breaks inside Vitest's sandbox.

## Docker

`docker-compose.yml` mounts `PROJECT_DIR` at `/project` (rw) and publishes `STUDIO_PORT` (default 3009) on `127.0.0.1` only: the MCP endpoint writes into the project, so never publish it on all interfaces. `/render` sends `script-src 'none'`, since pages share the origin of `/mcp`. Always start it with a per-project name: `PROJECT_DIR=… docker compose -p design-<name> up --build`. The image holds the app (no source mount), so rebuild after a change. The container runs as `HOST_UID:HOST_GID` so files it writes into the project are yours.

The app is listed in `Dockerfile.lockfile-check` (repo root): a new app or workspace package needs its `package.json` copied there.

## Known gotchas

- `src/routeTree.gen.ts` is auto-generated by the Vite plugin: commit it, never hand-edit.
- Server-side runtime checks in `design-project.ts` look redundant to the type checker (values come from MCP/HTTP), hence the file-level lint disable.
- MCP is stateless (a server and transport per request); `/events` is the only long-lived connection.
