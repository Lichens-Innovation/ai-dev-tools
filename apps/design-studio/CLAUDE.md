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

| File                                          | What it does                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `server/design-project.ts`                    | `openProject`: `pages`, `palette`, `watch`. Errors are `Conflict`, `NotFound`, `Invalid` (`errors.ts`)                 |
| `server/page-html.ts`                         | Checks a page loads only from `design/assets`; rebases asset links for `proposals/screens`                             |
| `server/native-import.mjs`                    | Node's own `import()` for the project's `palette.ts` (Vite cannot transform it)                                        |
| `server/selection.ts`                         | In-memory editor selection: the browser pushes, MCP `get_selection` reads. Not part of DesignProject                   |
| `server/hub.ts`                               | Fan-out of watch events and `open_page` to the `/events` stream                                                        |
| `server/studio.ts`                            | The process-wide singleton (project at `PROJECT_ROOT`, default `/project`, selection, hub)                             |
| `palette/draft.ts`                            | Pure draft logic: a diff against the saved palette (`Draft`), merge, rebase, count, validation                         |
| `palette/palette-state.tsx`                   | `PaletteProvider`/`usePalette`: the shared draft, debounced server preview, save, `design-studio:token`                |
| `palette/theme.ts`                            | Themes an iframe (`data-theme`, `color-scheme`, draft css) or scopes the css for the studio's own pages                |
| `studio/shell-state.tsx`                      | `ShellProvider`: mode, side by side, sidebar, footer tab and height, remembered in localStorage per project            |
| `components/shell/`                           | Navbar, sidebar, page frame (one iframe per mode), palette footer with its Inspect tab (`inspect-tab`, `token-select`) |
| `components/palette/`, `components/tailwind/` | The `/palette` and `/tailwind` pages                                                                                   |
| `server/render.ts`                            | Safe static serving of `design/` for `/render/*`                                                                       |
| `inspector/`                                  | Token trace over the iframe CSSOM (`trace.ts`, pure), click picker, selection push to `/api/selection`                 |
| `editor/`                                     | Page file <-> editor: `page-document.ts` (body + `<style data-studio>`), `serialize.ts`, Style Manager                 |
| `editor/` (gestures)                          | `drop.ts` (pure drop -> layout), `gestures.ts` (free drag, keys, line-up), `clipboard.ts`, `component-ref.ts`          |
| `server/sketch.ts`                            | Pure sketch-file helpers: validate a scene, compact shapes for Claude, remove shapes (JSON only, no Excalidraw)        |
| `sketch/`                                     | `anchors.ts` (selectors, anchoring, pure + jsdom tests), `view.ts` (page frame -> Excalidraw view), `capture.ts` (PNG) |
| `components/editor/sketch-layer.tsx`          | The Excalidraw overlay, toolbar, autosave, anchoring loop, badges, Make real                                           |
| `components/editor/`                          | `PageEditor` (GrapesJS, lazy-loaded), `PageWorkspace` (toolbar, banners, save)                                         |

Rules of `DesignProject`:

- Pages are addressed by `{kind, name}` with `name` kebab-case, never by path. Nothing escapes `design/`.
- References are read only: there is no write for them. Only `saveProposal` writes, against a `baseHash` (stale = `Conflict`).
- Writes are atomic (tmp + rename). The watcher ignores `*.tmp`.
- `palette.save` imports the project's own `palette.ts` (manifest `palette.script`) and calls its exported functions, in the order its CLI does. If `palette.ts` changes its CLI flow, mirror it.
- The filesystem and `palette.ts` are used directly, with no ports. Tests copy `test/fixtures/project` to a temp dir.

## Palette in the UI

The browser never re-implements the engine: `palette.preview(draft)` (a `DesignProject` function, `previewPalette` server function) runs the project's own `palette.ts` and returns css, resolved tokens, semantic references, audit and Tailwind classes for a draft, without writing. The draft is a diff against the saved palette, kept in localStorage (`design-studio:<root>:draft`); Save sends it with the `baseHash` the inputs were read at. The project's tokens (`--bg`, `--primary`…) exist only inside iframes and `[data-studio-theme]`; the studio's own chrome uses the shared `--bg-elev`, `--ink`, `--line` tokens: do not mix them.

## Editor and token inspector

A reference is shown in the plain page frame (read only, click to inspect); Create proposal copies it and opens GrapesJS (BSD-3) on the proposal. The project CSS goes to the canvas as `canvas.styles` (never parsed into the editor); the editor owns only the body and the rules of one page-local `<style data-studio>` block. `selectorManager.componentFirst` makes edits `#id` rules in that block. Save writes the body plus that block through `saveProposal` with the `baseHash`; a `Conflict` offers Reload or Overwrite, and an SSE change on the open file shows a reload banner (the workspace ignores its own saved hashes).

`inspector/trace.ts` is pure and unit-tested in jsdom (`test/trace.test.ts`): winning declaration per property (importance, specificity, order, inline last), `var()` chains through `:root` and `[data-theme]` per mode, `literal`/`off-token` flags. Clicking a token dispatches `design-studio:token` (the palette footer listens). The trace is shown by the footer's Inspect tab, not in the editor: the page publishes its selection to `inspector/inspect-state.tsx` (`InspectProvider`, in the root layout), with `swap` (a proposal) or `createProposal` (a reference). `inspector/inspect.ts` is pure and unit-tested: `swapCandidates` (tokens of the property's kind, filtered by a search) and `colorEditFor` (the palette input at the end of a chain, `--bg`/`--text` mapped to their neutral inputs, derived steps refused). Picking an element with the footer closed opens it on Inspect. A swap in a proposal writes `var(--other)` into the data-studio block for that element; the color square edits the palette draft instead. The selection (page, selector, excerpt, trace) is pushed to the selection holder for MCP `get_selection`. jsdom drops `!important` on `var()` values, so tests use raw values there. Custom Style Manager types must be registered before `addSector`.

## Moving and adding in the editor

`editor/drop.ts` is pure and unit-tested (`test/drop.test.ts`): `resolveDrop` turns a pointer position over measured boxes (`Level`) into a `Drop` (`between` at an index, `push` end/centre, `align` for an only child), `dropStyle` into the declarations it writes (margins `auto`, `display:flex`, `justify-content`/`align-items`, never a positional property), `markerFor` into what the live marker shows. `editor/gestures.ts` measures the canvas, draws the ghost and marker in the frame document, and applies a drop with `performDrop` (move + style in one synchronous tick, so GrapesJS fuses it into one undo step); it also owns the keymaps (our own copy/paste replace `core:copy`/`core:paste`, Ctrl+D, Alt+arrows) and the line-up toolbar buttons. `test/gestures.test.ts` runs the real `grapesjs` headless in jsdom. `data-component` is plain markup: `component-ref.ts` adds it to the root of an inserted reference (`componentMarkup`) and names layer rows; copies keep it because they are attributes. The Add tab's components come from `DesignProject.pages.components()` (name from `design/index.json`, else the page name in Pascal case). The clipboard lives in localStorage (`design-studio:<root>:clipboard`), with ids remapped on paste so rules never collide.

Gotchas: GrapesJS builds canvas elements in the editor's window, so `instanceof HTMLElement` against the frame's window is false (use `nodeType`); do not call `editor.refresh()` in code the headless tests run; moved elements must not get an empty rule (it leaves an `id` in the file), so style is written only when it changes.

## Sketch layer and requests

`DesignProject` owns `sketch.{read,save}` (`<proposal>.excalidraw`, atomic, `baseHash` Conflict), `pages.createBlank` and `requests.{create,list,get,png,markSent,resolve}` (`design/requests/<id>.json` + `.png`, ids `rq-<8 hex>`, a `.gitignore` written there; updates are serialised so `sent` never overwrites `done`). Request events go out on `/events`. `sketch-layer.tsx` is client only (Excalidraw is dynamically imported, fonts come from `/excalidraw-assets/`): the canvas frame drives Excalidraw's scroll/zoom every frame (never the reverse), `anchors.ts` keeps shapes on their page elements (`customData.anchor`/`endAnchor`), and a sketch tool being active makes `gestures.ts` yield its keymaps (`ownsKeyboard`). The channel (`plugins/design/channel/design-channel.mjs`) consumes `/events`, `/api/requests` and `POST /api/requests/:id/sent`: keep them stable. Requests carry ids and file references only, never text from the page.

Gotcha: GrapesJS auto-ids (`i1a2`) are not kept in the saved file, so anchors never use them as selectors.

## Testing

`pnpm --filter design-studio test`. The fixture project ships a copy of the plugin's `palette.ts`; a test fails if it drifts from `plugins/design/skills/design-palette/scripts/palette.ts`, so copy it again when the plugin's changes. `vitest.config.ts` loads `native-import.mjs` as an external module: do not remove that, the palette import breaks inside Vitest's sandbox.

## Docker

`docker-compose.yml` mounts `PROJECT_DIR` at `/project` (rw) and publishes `STUDIO_PORT` (default 3009) on `127.0.0.1` only: the MCP endpoint writes into the project, so never publish it on all interfaces. `/render` sends `script-src 'none'`, since pages share the origin of `/mcp`. Always start it with a per-project name: `PROJECT_DIR=… docker compose -p design-<name> up --build`. The image holds the app (no source mount), so rebuild after a change. The container runs as `HOST_UID:HOST_GID` so files it writes into the project are yours.

The app is listed in `Dockerfile.lockfile-check` (repo root): a new app or workspace package needs its `package.json` copied there.

## Known gotchas

- `src/routeTree.gen.ts` is auto-generated by the Vite plugin: commit it, never hand-edit.
- Server-side runtime checks in `design-project.ts` look redundant to the type checker (values come from MCP/HTTP), hence the file-level lint disable.
- MCP is stateless (a server and transport per request); `/events` is the only long-lived connection.
