# Outcome — review of M1 (`maestro-core`) and M2 (Electron shell)

Worked through `review-m1-m2.md`, 2026-07-30. Twelve items: seven fixed, four confirmed clean,
one recorded as a measured decision.

Item 9 was the last open one and needed a rendered window. Done 2026-07-31 — the canvas was driven
over CDP in the packaged build, the `mounted` flag was measured and removed, and four defects
turned up that only a running window shows (one of them data loss on a project switch). See
"Canvas interactions, verified in a running window" and the section after it. Two findings are
recorded rather than fixed — one under "Still open", one under `FitViewEffect`.

A **second pass the same day** re-drove every criterion with an automated CDP probe rather than by
hand. It found one criterion that the first pass had recorded as met without measuring it (the
seeded banner after a save) and one stale-loader defect behind it, fixed both, and now passes
23/23. The correction is noted inline where the wrong claim was made.

Suites after all passes: `@repo/maestro-core` **72** (was 58), `maestro` **21** (was 8).

---

## Fixed

### 1. `seeded` is now rendered

New `components/seeded-banner.tsx`, shown on `/workflows` and `/rules` when the loader reports
`seeded`. The two routes word the consequence differently on purpose — `/workflows` hands back a
starter graph ("the workflows below are a starter configuration and are not saved"), `/rules`
hands back a *blank* config, so "starter configuration" would have been wrong there and it says
assignments start empty instead.

### 2. Rejected IPC calls now surface

New `renderer/src/utils/call-main.ts`: `callMain(op)` returns `{ ok: true, value } | { ok: false,
error }`, and `mainErrorMessage` strips Electron's `Error invoking remote method 'config:save':
Error: …` framing so a toast shows the sentence the main process actually threw. Applied to both
`handleSubmit`s, `closeMaestroTask`, and all three `ProjectProvider` mutations — a project switch
that silently does nothing was the worst of the set, since every route's data then belongs to the
wrong repo. `setPhase` resets moved into `try/finally`.

It lives in the renderer rather than the preload deliberately: the preload's `ipcRenderer.invoke`
calls are enumerated one channel per line and `test/isolation.test.ts` asserts exactly that, so a
generic wrapper there would read like the escape hatch that test exists to forbid.

### 4. The `/contracts` boundary is now enforced

`test/isolation.test.ts` walks `src/shared/`, `src/preload/`, and `src/renderer/` and asserts none
of them import the `@repo/maestro-core` barrel, `@repo/claude-fs`, or any `node:` builtin. Three
assertions; all pass today.

### 5. Tail ownership documented and pinned

`log.subscribe` is single-owner by construction (main keys one tail per `webContents.id` and stops
the old one first). Documented on `MaestroApi.log.subscribe`, on the `tails` map in `main/ipc.ts`,
and in `CLAUDE.md`; a test asserts the call site is exactly
`renderer/src/utils/session-log-context.tsx`. Refcounting was the alternative and was rejected —
with a single owner it would be unexercised code, and a test that fails the moment a second
subscriber appears is the cheaper guard.

The `sawFile` worry turned out to be a non-bug, but a genuinely confusing one. `sawFile` tracks
"have we emitted entries a consumer needs to be told to drop", not "does the file exist" — so
seeding it from `snapshot.length > 0` is correct, and the suppressed reset for an empty log is a
no-op. New `test/session-log.test.ts` (7 tests) pins every transition: append, SessionEnd delete,
empty-file delete, new session after reset, truncation, and unsubscribe.

### 6. `getState()` no longer writes

Pruning of vanished projects moved out of `getState()` and into a `prune()` applied once when
`projects.json` is first read. `getState()` is called by `currentRoot()` from every IPC handler,
so the old shape meant an `existsSync` per remembered project per handler call *and* made merely
opening the app rewrite the file. Dead entries now persist in the file until the next real
mutation writes it, which is the right trade: reads don't mutate. The `current !== cached.current`
reference comparison the review flagged is gone with it.

### 10. Bundled agents were broken in every launched build — fixed

This was worse than the review guessed. `defaultBundledAgentsDir()` resolved
`import.meta.dirname/../../../plugins/…`, which is right from `packages/maestro-core/src` but
lands on `apps/plugins/…` from `apps/maestro/out/main` — and electron-vite bundles main to `out/`
for **`dev` as well as `build`**, so the function returned `null` and the Maestro subagents were
silently missing from the picker in every launched window, not just packaged ones.

Replaced with `findUpBundledAgents(start)`, which walks up until it finds
`plugins/ai-tools-manager/agents`; depth-independent, so source, `dev`, and `build` all resolve.
`MAESTRO_BUNDLED_AGENTS_DIR` still wins when set and existing, for packaged builds that ship the
plugin in resources.

Verified four ways: a new `test/discovery.test.ts` (7 tests) drives the resolver from the
built-bundle depth and the source depth; the built bundle's own emitted resolver, extracted from
`out/main/index.js` and run at `out/main/`, prints
`/home/superadmin/gits/ai-dev-tools/plugins/ai-tools-manager/agents`; and finally the Maestro
subagents appear in the `/workflows` agent list in a running window.

### 12. Dead code removed

- `utils/text.ts`: dropped `firstSentence`, `joinOxford`, `buildDesc`, `clip` — all four served
  only the unported `create-*` routes. `stripNamespace` and `titleFromName` are live (session-log
  origin labels); the review's guess that the whole module was dead was half right. M4 re-copies
  what it needs from `apps/ai-tools-manager/src/utils/text.ts`.
- Removed the `log:snapshot` channel end to end (renderer helper, preload, shared contract, main
  handler). `subscribe` emits the full snapshot as its first `init`, so a second way to ask for
  the same bytes was surface with no consumer.
- `chip-multi-select.tsx` and `rule-tree.tsx` are both live on `/rules`; nothing to do.

---

## Confirmed, no change needed

### 3. `packages/ui` gaining `react-dom` broke nothing

`pnpm --filter helper-server build` and `pnpm --filter ai-tools-manager build` both succeed. No
duplicate React: `node_modules/.pnpm` holds exactly one `react@19.2.0` and one
`react-dom@19.2.0_react@19.2.0`, and all four workspaces (`help-server`, `ai-tools-manager`,
`maestro`, `ui`) symlink to those same two. Note the filter name is `helper-server`, not
`help-server` as the plan had it — the directory and the package name disagree.

### 7. Nothing writes a seeded config behind the user's back

`writeConfig` has exactly one caller (`saveConfig`), which has exactly one caller
(`ipcMain.handle(IPC.configSave)`), which only fires from the Save button. The seed exists purely
in memory in the `workflowsData` loader until the user saves. The hardcoded `["backend"]` is still
there for M3 to replace with repo detection.

### 11. Generated plugin libs: no semantic drift, and idempotent

Read the full diff of both files. Everything is esbuild's CJS wrapper plus the TS source's
idioms — `(x && x.y) || []` became `x?.y ?? []`, `new Set()` gained `/* @__PURE__ */`, the
two multi-line warning strings concatenate to byte-identical text, `—` is `—`. The only
behavioural difference I could construct is `||` → `??` in `readSession`, which changes what
happens for a session file containing literal `0`/`false`/`""` — not a reachable state. Exports
are the same sets, reordered.

`build:plugin-libs` run twice produces identical md5s. (`maestro-tasks.cjs` is *not* generated —
only the two the review names are.)

---

### 8. Renderer bundle is now code-split

Measured both ways rather than arguing from priors:

| | startup parse | on navigation |
|---|---|---|
| `autoCodeSplitting: false` (was) | 2,346 kB | — |
| `autoCodeSplitting: true` (now) | 593 kB shared + ~5 kB | 772 kB `/workflows`, 802 kB `/maestro-tasks`, 26 kB `/session-log`, 15 kB `/rules` |

The landing route is `/`, the project picker, which needs neither React Flow/dagre nor
react-markdown — so splitting cuts startup parse by roughly 75%. Enabled, and the app runs.

**Confirmed in a packaged run**, which is the only thing that proves it: `main/index.ts` calls
`loadURL()` when `ELECTRON_RENDERER_URL` is set and `loadFile()` otherwise, so `dev` serves over
`http://localhost:5173` and never touches `file://`. The failure splitting could introduce — a
route whose chunk won't load rendering blank — is specific to the packaged load. Checked with
`build` + `start`: all five routes render, none blank. Relative asset paths (`base: "./"`) are
what make that work; a regression to `base: "/"` would break the packaged app while leaving `dev`
perfectly happy. Revisit sizes after M6 adds help-server's routes (highlight.js, react-table).

### 9. The canvas `mounted` flag — REMOVED (superseded, see "Canvas interactions" below)

Originally left in place pending a rendered-window check. That check has now been done and the
flag is gone; the measurements are under "Canvas interactions, verified in a running window".

---

## Found by launching it — not on the review's list

Both of these blocked startup outright, which is why no item in the review predicted them: the
app had never been run.

### `electron` was bundled into main and preload, so the app could not start

`externalizeDepsPlugin` derives externals from package.json `dependencies`; `electron` is a
devDependency, correctly, since the runtime comes from the Electron binary rather than shipping in
the app. Uncovered, the npm package's Node-side shim got inlined — a module whose whole body is
`module.exports = getElectronPath()` — which ran at import time, found no `path.txt` beside the
bundle, and threw *"Electron failed to install correctly, please delete node_modules/electron and
try installing again."* The message points at node_modules for what is purely a bundling bug.

Fixed with an explicit `rollupOptions.external` on both the main and preload builds. The plugin's
own `include` option is the documented lever for this and does **not** work under vite 8.0.0 /
electron-vite 4 — it mutates `config.build` from inside the `config` hook, which no longer reaches
the resolved ssr environment. Verified empirically before falling back to `external`.

`test/isolation.test.ts` now asserts both built bundles import `electron` and contain no
`getElectronPath`. That suite exists for exactly this class of silent config regression, and this
one is invisible until someone launches the app.

### Electron's `chrome-sandbox` needs setuid root under pnpm

Environment, not code: pnpm doesn't preserve the setuid bit, so `dev` aborts with *"The SUID
sandbox helper binary was found, but is not configured correctly."* Fix documented in
`apps/maestro/CLAUDE.md` under Dev — `chown root:root` + `chmod 4755` on the copy in the pnpm
store (both `node_modules/electron` and `apps/maestro/node_modules/electron` are symlinks into
it). `gits/farel` carries the same note for an npm layout.

Deliberately **not** worked around with `--no-sandbox`: renderer isolation from the OS is the
premise `test/isolation.test.ts` spends four assertions defending.

---

## Canvas interactions, verified in a running window

Closes `.claude/maestro-tasks/001-verify-workflow-canvas-interactions.md`, and with it the last
of item 9. Cleared earlier in a packaged run (`build` + `start`): all five routes render, and the
Maestro subagents appear in the `/workflows` agent list — items 8 and 10 closed.

### How it was exercised

Electron was launched on the packaged `file://` build (`out/main/index.js`, not `dev` — `dev`
serves over `http://localhost:5173` and does not exercise the load path that ships) with
`--remote-debugging-port` and an isolated `--user-data-dir`, and driven over CDP: real
`Input.dispatchMouseEvent` press/move/release for drags, real clicks for the modals, and
per-animation-frame sampling of the React Flow viewport transform and node geometry. Two throwaway
project fixtures: one with a `maestro.json` holding a workflow whose nodes carry **no** positions
plus a second positioned workflow, one with no `.claude/maestro.json` at all. No dependency was
added to the repo — Node 22's global `WebSocket` is enough to speak CDP.

### The `mounted` flag is removed

Its only live claim was about first paint: that deferring React Flow's first render by one commit
is what gives the container real dimensions before React Flow measures it, and before dagre lays
out a workflow with no saved positions. Measured directly, by installing a per-frame sampler with
`Page.addScriptToEvaluateOnNewDocument` (so it runs before any page script) and cold-loading
straight into `/workflows`. Three runs per build:

| | with `mounted` | without |
|---|---|---|
| container size on the first frame React Flow exists | 1254×702 (3/3) | 1254×702 (3/3) |
| frames with a zero-size container | 0 | 0 |
| frames with a zero-size node | 0 | 0 |
| frames with nodes stacked at the origin | 0 | 0 |
| dagre positions on the first frame nodes exist | correct | correct |
| settled viewport transform | `translate(487.593px, 101px) scale(0.670227)` | identical |

Identical on every metric the flag claimed to protect. `firstNodesAt` was 76/88/91 ms with it and
107/84/74 ms without — overlapping ranges, i.e. load noise, not an effect of the flag. The
"Loading canvas…" placeholder never survived a single sampled frame even with the flag in place,
which is the tell: the deferral it buys is sub-frame. React runs layout effects after the DOM is
mutated and the browser has already computed layout by then, so React Flow's measurement never
saw a zero-size container in the first place. The flag, its `useEffect`, and the placeholder
branch are gone.

### Acceptance criteria, all met

Dagre lays out an unpositioned workflow across 7 distinct positions with zero overlapping pairs
and the whole graph inside the viewport. Workflow switches re-fit in a single transform step with
**zero** transform changes recorded while the outgoing node set was still mounted — the deferred
`fitView` does not fire against the workflow being replaced. A dragged node's position reaches
`maestro.json` to within a rounding step and is still there after save → close → reopen. The
condition-edge label editor opens, accepts a label, renders it, and the label survives the
round trip. The seeded banner shows on `/workflows` for a project with no `maestro.json`.

**Correction, 2026-07-31 (second pass).** The last clause of that paragraph originally also
claimed the banner "disappears once saved". It did not — that half of the criterion was recorded
as met without being measured. Re-driven with an automated CDP probe it failed on the first run;
see "The seeded banner never went away after a save" below. The probe now covers all 23 assertions
in this section and passes 23/23 against the fix.

---

## Found by driving the canvas — not on the review's list

### Switching projects kept the previous project's config, and Save wrote it to the new project

The worst of this pass, and a data-loss bug rather than a display one. `/workflows` seeds a
module-level store guarded by `if (config !== null) return` — intended so that a router
invalidation mid-edit doesn't discard unsaved canvas work. But a **project switch** is also a
router invalidation, and the loader then arrives with a *different project's* config, which that
guard also refuses. Observed: open project A, open project B, and the canvas keeps rendering A's
workflows while the top bar correctly says B — then pressing Save writes A's workflows into B's
`.claude/maestro.json`. Reproduced end to end; B's file came back holding A's workflow names and
A's edge labels.

`/rules` had the same defect by a different mechanism: `useState(loaderData.config)` initialisers
only run on mount, and the route component stays mounted across a switch. There the rule *pool*
comes straight from loader data and updates, while the *assignments* derived from it do not — a
rule the incoming project assigns renders unchecked, and Save writes the outgoing project's
assignments.

Fixed differently in each place, because the state lives in different places. `/workflows` keys
the store on `projectRoot` and replaces the config (and resets `activeWorkflowIdx`, which indexes
the outgoing project's list and can otherwise point past the end of the incoming one) when it
changes. `/rules` splits the route component in two and remounts the editor with
`key={projectRoot}`, which re-initialises every piece of derived state at once rather than
requiring each to be synced by hand. The store isn't React state, so it can't use a key; the
route component can't use the store's guard without hoisting its state out of React. New
`test/workflow-store.test.ts` pins the store half — five tests, two of which fail against the old
implementation (verified by reverting it).

### The renderer CSP blocked its own theme bootstrap

`src/renderer/index.html` declared `script-src 'self'` and then, eleven lines below, ran the
theme bootstrap as an inline `<script>`. It was blocked on every load — the comment
"Applied before first paint so the app never flashes the wrong theme" described something that
never executed once. The theme was applied only later, when `@repo/ui`'s `ThemeToggle` mounted
and ran its effect, which is exactly the flash the bootstrap exists to prevent.

Moved to `src/renderer/public/theme-bootstrap.js` and referenced as a parser-blocking
`<script src>`, so `script-src 'self'` covers it with no `'unsafe-inline'` and no per-edit CSP
hash to keep in sync. Confirmed in the window: `<html>` now carries a resolved `dark`/`light`
class before React mounts, and the violation is gone from the console.

### React Flow's own controls were invisible in dark mode

React Flow ships light and dark palettes behind `--xy-*` variables and selects between them from
its own `colorMode` prop; it does not inherit the app's theme. Unset, it stayed light while the
app was dark, so the Controls buttons rendered `rgb(250,250,247)` icons on an `rgb(254,254,254)`
button — zoom in, zoom out, fit view and lock all effectively invisible. A screenshot is the only
way to notice this, which is why it survived the port from the web app.

`colorMode` is now driven from the `light`/`dark` class the theme bootstrap sets and `ThemeToggle`
updates, via a `MutationObserver` rather than a one-shot read — "auto" resolves against the OS and
the toggle can change it while the canvas is mounted. Verified both ways: dark gives
`rgb(248,248,248)` on `rgb(43,43,43)`, light gives `rgb(28,25,23)` on `rgb(254,254,254)`, and
flipping the app toggle moves the canvas with it.

---

### The seeded banner never went away after a save

Found on the second pass, by re-driving the canvas with an automated probe instead of by hand.
Open a project with no `.claude/maestro.json`, press **Save workflows**, watch the save succeed
and the toast name the file it wrote — and the banner above the canvas keeps saying the workflows
are *"a starter configuration and are **not saved** — press Save workflows to write them."* It
stays until the route is left and re-entered.

`seeded` is decided by the loader from whether `maestro.json` existed **when the route loaded**,
and nothing re-runs a loader after a save: saving doesn't navigate, and the `project:changed`
broadcast that `ProjectProvider` invalidates on doesn't fire for a save either. So the flag is
frozen at its load-time value for the life of the route. The banner is the only visible symptom,
but the staleness is general — every field of loader data is pinned the same way.

`/rules` had it identically, and worse in kind: a rules save *moves rule files on disk*
(`applyRules` relocates project rules and installs vibe-rules ones), so its `tree` and
`projectRules` pool describe a layout the save has already invalidated.

Both now call `router.invalidate()` on the success path, after the `!res.ok` bail-out so a
rejected save doesn't re-run the loader. The invalidation is safe in both places for reasons that
already exist in the code and were verified in the window rather than assumed: `/workflows` keeps
its in-memory config because `seedWorkflowStore` bails when `projectRoot` is unchanged, so a
loader re-run cannot discard unsaved canvas edits; `/rules` is keyed on `projectRoot`, which is
also unchanged, so its editor doesn't remount and the current assignments survive. Measured across
the invalidation with a per-frame sampler: one distinct viewport transform, one distinct node
transform, one distinct node set — no re-fit, no remount, and a node dragged *before* the save is
still exactly where the user left it after it.

`test/isolation.test.ts` gains two assertions, in that file's existing source-assertion idiom —
both routes must use `useRouter` and call `router.invalidate()` *after* the `!res.ok` guard.
Confirmed to fail against the unfixed source by reverting it. There is no render test in this app
that would have caught this, which is why the guard is at the source level.

### Recorded, not fixed: `FitViewEffect`'s timer is never cleared

`setTimeout(() => fitView(...), 50)` in `workflow-canvas.tsx` has no `clearTimeout` cleanup, so a
workflow switch followed by navigation away inside 50 ms leaves the timer to fire against a
torn-down React Flow instance. Left alone deliberately — driven five times in the window
(switch → navigate away after 10 ms → return), it produces no exception and no console error, and
no visible effect: React Flow's `fitView` after teardown is a no-op. Adding the cleanup would be
correct but would change working code on a theoretical argument, which is the opposite of how the
`mounted` flag above was settled.

---

## Closed after this review

### `@repo/styles` pulled fonts from Google's CDN, and the renderer CSP blocked it — now vendored

**Was:** `packages/styles/shared-styles.css` opened with
`@import url('https://fonts.googleapis.com/css2?family=Inter…')`. Under the renderer's
`style-src 'self' 'unsafe-inline'` that was blocked on every load — the one console error left in
a clean run — and the app rendered in fallback fonts. Left open here because every option looked
like a decision this review had no standing to make.

**Decided:** self-host. The CSP is unchanged, and the three families are vendored into
`packages/styles/fonts/` and served same-origin. Widening the CSP was rejected for the reason
recorded above — it contradicts the policy's own stated intent and makes a desktop app's
typography depend on the network — and dropping the import was rejected because it changes the
look of every app in the monorepo. Files are fetched from Google's CSS API by
`packages/styles/scripts/vendor-fonts.mjs`, so they are byte-for-byte what the CDN was serving and
the typography is exactly what the `@import` intended. All three are SIL OFL 1.1; each `OFL.txt`
is committed beside the binaries. Provenance and the refresh procedure are in
`packages/styles/README.md`.

Only the referenced faces ship — Inter 300–700 upright, Bodoni Moda 600/700 italic, IBM Plex Mono
300–600 upright, Latin cuts only. Inter and Bodoni Moda turned out to be variable fonts served as
one file per style: a naive vendoring wrote five identical copies of Inter, so the script groups
faces by resolved file and emits a `font-weight: 300 700` range instead. 12 files, ~372 kB.

Verified by driving windows, not by the absence of an error:

| | before | after |
|---|---|---|
| CSP violations (packaged `file://`) | 3 `style-src-elem` blocks | **0** |
| Off-origin requests | 2 to `fonts.googleapis.com` | **0** |
| `<h1>` painted with | Ubuntu Sans | **Inter** |
| Mono text painted with | Liberation Mono | **IBM Plex Mono** |

"Painted with" is `CSS.getPlatformFontsForNode` — the fonts the engine actually resolved for the
glyphs it drew. `getComputedStyle().fontFamily` reads identically in both columns, which is why
the original bug survived so long. The before column was produced by temporarily restoring the
CDN `@import` and rebuilding, to prove the probe was not passing vacuously.

Checked over HTTP as well as `file://` — help-server serves `url(/assets/…)` where Maestro's
packaged build serves `url(./…)`, and all 12 files load in both. help-server was the find that
mattered: its `.display-title` was the only consumer of `--font-serif`, which named `'Domine'` —
a family nothing ever loaded — while the CDN import fetched Bodoni Moda. So display headings had
been falling back to Georgia independently of the CSP. `--font-serif` now names `'Bodoni Moda'`,
and `Command Center` on the help-server landing page paints in it.

`apps/maestro/test/isolation.test.ts` gained two assertions: the built renderer CSS references
nothing off-origin, and the woff2 files are emitted beside it.

---

## Still open

### Seeded starter graph: condition labels overlap nodes

In the starter configuration handed to an unconfigured project, several condition-edge labels
render on top of the nodes below them. These are the seed's own coordinates in `seed.ts`, not a
canvas defect — the labels are draggable and carry a `label_offset` once moved. Cosmetic, and
untouched here because it belongs with M3's repo-detection rework of the seeded chain.
