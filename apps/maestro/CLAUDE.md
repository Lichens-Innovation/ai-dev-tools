# maestro (desktop)

The Maestro desktop app — an Electron shell over `@repo/maestro-core`. Replaces the containerised
`apps/ai-tools-manager` web app: it opens a project folder, edits and saves the full Maestro
config with **no Claude session in the loop**, and live-tails the session log the Claude Code
hooks write.

## Why it exists

In the web app every write went through Claude. The app ran in Docker and could only reach the
project through a `/project` bind mount, so `submitMaestroConfig` wrote `maestro.json`
"for local dev" and the `/maestro-app` skill re-wrote it host-side to be safe. The two steps that
finish a save — `maestro-render-orchestrator.cjs` and `maestro-apply-rules.js` — are **pure node,
no LLM**, but had to run on the host, so they were Steps 3 and 4 of a SKILL.md. A Claude session
was acting as transport for `fs.writeFileSync` and `execFileSync`.

Here a save is one IPC call.

## Process layout

```
src/main/      node. Owns the filesystem, the project state, the log watcher.
src/preload/   the contextBridge. The ONLY path from renderer to node.
src/renderer/  a TanStack Router SPA. No node imports at all.
src/shared/    ipc.ts — the typed channel contract, imported by all three.
```

`src/shared/ipc.ts` is the seam that replaces `createServerFn`. Where the web app relied on a
build step stripping handler bodies out of the client bundle — and on a convention about which
helpers could be exported (see the old app's "Server-only code and the client bundle" section) —
the boundary is now the process split. That whole hazard class is gone: an accidental node import
in the renderer fails the build instead of blanking a route at runtime.

Types that cross the boundary come from `@repo/maestro-core/contracts`, **not** the package
barrel. The barrel re-exports `fs`, `child_process`, and `import.meta.dirname`; importing a type
from it pulls all of that into the renderer's type graph. `/contracts` is interfaces only.

## The save path

`config:save` → `saveConfig()` in `@repo/maestro-core`:

1. merge the edited slice into `maestro.json` and write it (2-space indent, **no trailing
   newline** — preserved so existing repos show no spurious diff);
2. re-render the orchestrator's `Maestro:HANDOFFS` table from it;
3. apply the rule assignments (move project rules, `vibe-rules load` installable ones).

The `SaveResult` carries the rendered success paths and the rule summary, so the toast reports
what actually changed on disk. Gone: `RESULT_FILE`, `aiToolsAction`, `hookSpecificOutput`,
`wait-ai-tools-result.sh`, and `/maestro-app` Steps 2–5.

## What still requires Claude Code

The **runtime** half — hook scripts that fire inside a session: `maestro-inject-agent-context`
(SubagentStart), `maestro-subagent-log` (SubagentStart/Stop), `maestro-session-log` (PreToolUse),
`maestro-validate-tasks` (PostToolUse), `maestro-session-cleanup` (SessionEnd),
`maestro-set-session-workflow.cjs`, `bash-validation.sh`.

They still need a session to *run*, but no longer to be **installed**: `/install` copies them into
`<project>/.claude/scripts/` and registers them in the project's own `.claude/settings.json`
(`installRuntime()` in `@repo/maestro-core`). See that package's README for why project-local
registration exists at all — the plugin's `${CLAUDE_PLUGIN_ROOT}` hooks resolve into a
version-keyed marketplace cache, so runtime fixes shipped without a `plugin.json` bump never
reached an installed project.

The split is the one the `maestro-architecture` skill already draws, at `maestro.json`.

## Routes

| Route | Purpose |
|---|---|
| `/` | Project picker + recent projects. The web app had no such page — a container was launched per-project, so there was nothing to choose. |
| `/workflows` | React Flow canvas. Writes the workflow slice. On an unconfigured project it also shows the detected implementation chain, its evidence, and chips to correct it. |
| `/rules` | Assign rules to the project root / directories. Writes the rules slice. |
| `/session-log` | Live view of `maestro_session.log.jsonl`. |
| `/maestro-tasks` | The queue `/to-maestro-tasks` wrote. Also the first consumer of the `claude -p` bridge: **Run with Claude** previews the invocation, confirms it, and streams it. |
| `/install` | Install / update / remove the project's Maestro runtime, and say what changed on disk. |
| `/create-skill`, `/create-subagent`, `/create-plugin`, `/create-marketplace` | The four creation forms, behind the top bar's **Create** menu. Split-pane: form left, live file preview right. |

## The create-\* routes

They are the last part of the web app to come across, and the only one where a model is genuinely
required — not to write files, but to author a **body**: the prose of a `SKILL.md`, an agent's
system prompt. So each submit is two operations, in this order:

1. `create:scaffold` writes everything deterministic — directory, frontmatter, plugin manifest,
   marketplace registration — and returns what it wrote. No model, and none reachable: the module
   behind it (`scaffold.ts` in `@repo/maestro-core`) calls nothing.
2. Whatever is left goes out as a `ClaudeRequest` through `claude:preview` and `ClaudeRunDialog`.

**The ordering is the design.** The artifact is on disk before Claude is mentioned, so cancelling
the confirmation — or having no CLI at all — still leaves the user with the thing they asked for.
The confirmation opens by itself only when `needsModel` says something is actually left to write
(auto mode, or a new marketplace's docs); a manual skeleton and a plugin manifest are complete as
written, and **Finish with Claude** on the result card stays available either way.

Per-route files are the schema, the fields and the preview. The chrome is shared:
`components/create-shell.tsx` (layout, header, shortcut map, submit row), `utils/create-flow.tsx`
(the scaffold → preview → dialog path), `components/create-result.tsx` (what landed on disk).

The `target` toggle survived; only its Docker half did not. Marketplace vs. project is a real
choice about where a skill lives — what went is the path ambiguity that existed *because* the
container could not reach outside its mount.

## The `claude -p` bridge

The app can run Claude on the user's behalf, and asks first. Three channels:

```
claude:preview  → { prompt, argv, cwd, targets, available, searched, token }   // spawns nothing
claude:run      → streams stdout/stderr, resolves with the outcome             // token only
claude:cancel   → kills the child's process group
```

`ClaudeRunDialog` is the user-facing half: full prompt (scrollable, selectable — never a summary),
exact argv, working directory, what may be written, then Copy prompt / Cancel / Run, then streamed
output with a Stop. See `@repo/maestro-core`'s README for why preview and run are two operations and
what breaks if they become one. Everything a route needs is `window.maestro.claude.preview(request)`
plus rendering `<ClaudeRunDialog>` with the result — a route that shells out on its own has opted
out of the confirmation, which is the whole point.

## Things that bite

- **Hash history, not browser history.** A packaged build loads the renderer over `file://`,
  where pushState paths don't resolve on reload. See `src/renderer/src/main.tsx`.
- **`__root.tsx` has no `shellComponent`.** TanStack Start rendered the whole `<html>` document,
  so the root route owned `<head>`/`<body>`/`<Scripts>` and the theme bootstrap. Those live in
  `src/renderer/index.html` now, along with the renderer CSP.
- **`@repo/maestro-core` must be bundled into main, not externalized.** It's a workspace *source*
  package with no build artifact, so `require` can't resolve it at runtime — hence the
  `externalizeDepsPlugin({ exclude: [...] })` in `electron.vite.config.ts`.
- **Project switches invalidate the router.** Every route loader reads the *current* project from
  main-process state, so `ProjectProvider` calls `router.invalidate()` on the `project:changed`
  broadcast. Without it a switch leaves stale data on screen.
- **Editor state must be keyed by `projectRoot`, or a switch writes one project into another.**
  The invalidation above only re-runs the *loader*. Any state seeded from loader data and then
  edited in place has to decide whether an incoming payload replaces it — and "did I already seed?"
  is the wrong question, because a project switch and a mid-edit re-render are both invalidations.
  Guarding on `config !== null` (`/workflows`) and on `useState(loaderData.…)` never re-running
  (`/rules`) each produced the same failure: the canvas kept rendering project A while the window
  was on B, and Save wrote A's config into B's `maestro.json`. `/workflows` keys `seedWorkflowStore`
  on `projectRoot` (and resets `activeWorkflowIdx`, which indexes the outgoing project's list);
  `/rules` remounts its editor with `key={projectRoot}`. Prefer the key — it re-initialises every
  derived piece at once. `test/workflow-store.test.ts` pins the store half; the failure is silent.
- **A save does not refresh loader data — invalidate after one.** Loaders run on navigation and
  on invalidation, and a save is neither: it doesn't navigate, and the `project:changed` broadcast
  above doesn't fire. So everything the loader computed stays pinned at its load-time value, and
  `seeded` is the visible one — after a successful save the banner kept telling the user their
  config was "not saved" while it sat on disk. `/rules` was worse, since a rules save *moves rule
  files*, leaving its tree and rule pool describing a layout that no longer exists. Both routes
  now call `router.invalidate()` on the success path, after the `!res.ok` bail-out. This is safe
  only because of the keying in the entry above — `/workflows` keeps its in-memory config
  (`seedWorkflowStore` bails on an unchanged `projectRoot`) and `/rules` doesn't remount
  (`key={projectRoot}` is unchanged) — so re-running a loader cannot discard in-flight edits.
  Verified in the window: no re-fit, no remount, and a node dragged before the save stays put.
  `test/isolation.test.ts` pins both call sites; no render test here would catch the regression.
- **The renderer CSP forbids inline script — including the theme bootstrap.** `index.html`
  declares `script-src 'self'`, so the pre-paint theme script lives in
  `src/renderer/public/theme-bootstrap.js` and is loaded as a parser-blocking `<script src>`.
  Inlining it back "because it's four lines" silently reintroduces a theme flash: the browser
  blocks it, and the theme is then applied only when `ThemeToggle`'s effect runs. The same policy
  blocked `@repo/styles`' Google Fonts `@import` on every load, which is why the fonts are now
  vendored into that package and served same-origin — do not restore the CDN `@import`, and see
  `packages/styles/README.md` before changing a weight. `test/isolation.test.ts` asserts the built
  renderer CSS references nothing off-origin.
- **React Flow does not inherit the app's theme.** It picks between its own `--xy-*` palettes from
  its `colorMode` prop. Unset, its Controls render a near-white icon on a near-white button in
  dark mode — invisible, and invisible to every test that isn't a screenshot. `workflow-canvas.tsx`
  drives `colorMode` off the `light`/`dark` class on `<html>` via a `MutationObserver`, because
  "auto" resolves against the OS and the toggle can change it while the canvas is mounted.
- **Hook scripts are copied into a project as `.cjs`, never `.js`.** The plugin runs them as
  `.js` because its directory has no package.json declaring a module type. A project's does, and
  `"type": "module"` makes node parse their `require()` as ESM — the hook then fails on *every
  tool call* with "require is not defined in ES module scope". Nothing catches this but running a
  copied script from inside such a project, which `test/install.test.ts` does.
- **Two things can register Maestro's hooks, and both firing is a visible bug.** A project
  installed from `/install` has them in its own settings; the `ai-tools-manager` plugin registers
  the same ones globally from its `hooks.json`. With both, every tool call is logged twice and
  every subagent gets its context injected twice. `InstallStatus.pluginHooksActive` detects it and
  the route says so — it does not "fix" it, because the fix is in the user's global configuration
  and the app does not write there.
- **Uninstall has two levels and the destructive one is never the default.** Plain uninstall
  unregisters the hooks and deletes the ephemeral session files, and **keeps `maestro.json`** —
  a user turning the hooks off has not asked to lose their workflow graph and rule assignments.
  Only purge deletes the skill, the copied scripts and the config, and it is reachable *only*
  through the confirmation dialog, which lists the exact files first. The `purge` flag is explicit
  at every hop — `uninstall(purge: boolean)` in the context takes no default, and the IPC handler
  reads `opts?.purge === true` — so no malformed or missing argument can escalate a call into a
  purge. `packages/maestro-core/test/uninstall.test.ts` asserts what each level *leaves*.
- **Staleness is content, never mtime.** `installedRuntimeId`/`shippedRuntimeId` are sha-256 over
  the runtime manifest. A `git clone` rewrites every mtime, so an mtime comparison would report a
  fresh checkout as stale and make the badge noise the user learns to ignore.
- **The seeded chain is detected, and only proposed while nothing is on disk.** `data:workflows`
  calls `detectImplAgents()` (in `@repo/maestro-core`) instead of the old hardcoded
  `defaultV3Config(["backend"])`, and returns the `RepoDetection` on the same payload as the seed —
  one round trip, so the evidence cannot describe a different chain than the canvas is showing.
  `DetectedChain` renders only when `seeded`: once `maestro.json` exists the chain is the user's
  saved answer, and re-proposing a detected one over a graph they built would be offering to
  overwrite their work. Correcting the chain goes back to main (`data:reseed`) to rebuild the seed
  with the *same* `defaultV3Config`, rather than duplicating the builder in the renderer — it is
  pure, but it lives behind the barrel that re-exports `fs`. The round trip is why
  `replaceConfig()` takes a project root and drops a result whose root no longer matches: a
  re-seed in flight across a project switch would otherwise land project A's starter graph on B's
  canvas, the same failure `seedWorkflowStore`'s guard exists for.
- **The create routes' preview and their scaffold must resolve the same path.** Both go through
  `resolveCreateTarget` in `@repo/maestro-core`, and the confirmation dialog names the file it
  returns. A second resolution anywhere — a path computed in the renderer, a `path.join` inlined
  into a prompt builder — makes the modal describe a file other than the one on disk, and the
  user is being asked to consent to the wrong thing. `test/create-preview.test.ts` and
  `test/scaffold.test.ts` in that package compare the two.
- **The renderer's `utils/text.ts` re-exports and must never implement.** `buildDesc` decides the
  `description:` frontmatter, and the form's live preview shows it *before* the file exists while
  the node-side scaffold writes it after. Two implementations means a preview that can silently
  stop matching the file — and it looks fine right up until someone edits one of them.
  `@repo/maestro-core/text` is the one home; note the **subpath**, since the barrel re-exports
  `fs`. `test/isolation.test.ts` fails on a re-implementation anywhere under `src/renderer`.
- **A create-* run's working directory is not always the open project.** A skill written into a
  marketplace repo, or a brand-new marketplace, lives outside it — and a headless run whose edits
  are all outside its cwd gets none of them auto-accepted by `--permission-mode acceptEdits`, with
  nobody to ask. `claude-preview.ts` derives the cwd from the same resolution that chose the path;
  the dialog shows it. Verified in the window: a marketplace-target skill runs in the marketplace.
- **The prompt is prose, never `/create-skill`.** A slash command in a headless run would fire the
  plugin's `UserPromptExpansion` hook, which launches the Docker app and blocks waiting for a form
  submission that can never arrive. The instructions the skill would have supplied are inlined into
  the prompt instead, and a test asserts no create prompt contains a slash command.
- **`claude:run` takes a token and nothing else, and the preload must keep it that way.** The
  bridge's guarantee — the only executable prompts are ones the user was shown — comes from the
  run channel having no argument that could describe a different run. A preload that "helpfully"
  forwarded the prompt or argv alongside the token would reopen that in a diff that reads as a
  convenience, and every test in `@repo/maestro-core` would still pass, because none of them can
  see this side of the wire. `test/isolation.test.ts` pins the call to `invoke(IPC.claudeRun,
  token)` for that reason. The same applies to `claude:preview`, which takes a **request** —
  main builds the prompt; the renderer never supplies one.
- **Preview tokens are dropped on a project switch** (`clearInvocations()` in `announce()`). A
  token names the outgoing project's cwd, so a modal left open across a switch would otherwise
  still have a live token and Run would spawn Claude against the repo the window has moved off —
  the same failure shape as the `seedWorkflowStore` keying above.
- **A cancelled run's child is detached, so quitting must kill it.** The child is spawned into its
  own process group (that is how Stop reaches the CLI's *own* children), which also means it
  outlives the app. `disposeIpc` calls `disposeClaudeRuns()`; without it, closing the window leaves
  Claude running against the user's repo with nothing left to stop it from.
- **`claude` is resolved explicitly, never off `process.env.PATH` alone.** A GUI-launched Electron
  app gets a PATH that does not include `~/.local/bin`, which is where the CLI installs — so the
  app reported "not installed" on machines where `which claude` answers instantly. This does not
  reproduce from a terminal, and no unit test in this app can see it. Verified by launching from a
  desktop entry; see `@repo/maestro-core`'s `claude-cli.ts`.
- **The log tail is retargeted on a project switch**, in `main/ipc.ts`. Otherwise a window keeps
  streaming the previously-opened repo's session log.
- **`window.maestro.log.subscribe` is single-owner.** Main keeps one tail per `webContents.id`
  and stops the old one before starting a new one, so a second subscriber steals the tail and the
  first unsubscribe stops it for both. The owner is `SessionLogProvider`; read from it with
  `useSessionLog()`. A test pins the call site to one file.
- **Every fallible main-process call goes through `callMain()`** (`renderer/src/utils/call-main.ts`).
  `ipcMain.handle` handlers throw — `config:save` throws when no project is open, and every route
  is reachable in that state. A bare `await` on a rejected channel is an unhandled rejection: no
  toast, and any `setPhase("idle")` after the await never runs, so the button spins forever. Pair
  it with `try/finally` around the phase reset.
- **`getState()` in `project-store.ts` must not write.** It is called by `currentRoot()` from
  every IPC handler; pruning-and-rewriting there meant an `existsSync` per remembered project per
  handler call and made merely opening the app mutate `projects.json`. Pruning happens once when
  the file is first read, and only real mutations persist.
- **`test/isolation.test.ts` guards the process boundary.** `nodeIntegration: false`,
  `contextIsolation: true`, one exposed namespace, no generic `invoke(channel, …)` escape hatch,
  no node builtins in the built renderer bundle, and — outside `src/main/` — no import of the
  `@repo/maestro-core` barrel, `@repo/claude-fs`, or any `node:` builtin. These are configuration
  and convention properties: they'd all regress silently without assertions.
- **The renderer bundle is code-split** (`autoCodeSplitting: true`). Measured 2026-07-31: unsplit
  was one 2,346 kB chunk; split is 593 kB shared + 772 kB `/workflows` (React Flow + dagre) +
  802 kB `/maestro-tasks` (react-markdown) + ~26 kB for the rest. The landing route is `/`, the
  project picker, which needs none of that — so startup parse drops by roughly 75%. What makes
  this safe over the packaged `file://` load is that assets resolve relatively (`base: "./"`);
  anything that regresses that leaves routes blank in a packaged build while `dev` — served over
  `http://localhost:5173` — stays perfectly happy. **`dev` does not exercise the `file://` path
  at all**: `main/index.ts` only calls `loadFile()` when `ELECTRON_RENDERER_URL` is unset. Verify
  route navigation with `build` + `start`, never with `dev` alone.

## Dev

### Linux sandbox fix (required after any install that re-extracts Electron)

```bash
sudo chown root:root node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox
```

Without it `dev` aborts with *"The SUID sandbox helper binary was found, but is not configured
correctly"*. pnpm doesn't preserve the setuid bit, and both `node_modules/electron` and
`apps/maestro/node_modules/electron` symlink into the store — so fix the store copy, not the
links. Do **not** work around it with `--no-sandbox`: the renderer's isolation from the OS is the
premise `test/isolation.test.ts` exists to defend. (`gits/farel` documents the same fix for an
npm layout.)

```bash
pnpm --filter maestro dev        # electron-vite dev, HMR on the renderer
pnpm --filter maestro build
pnpm --filter maestro typecheck  # both tsconfig projects
pnpm --filter maestro test
```

### Driving the window (canvas interactions, screenshots)

Nothing in `test/` can reach the canvas: React Flow measures the DOM, dagre lays out against real
dimensions, and drag-to-persist only means something with actual pointer events. To exercise that,
launch the **packaged** build with a debugging port and an isolated profile, then speak CDP to it:

```bash
cd apps/maestro
./node_modules/.bin/electron . --remote-debugging-port=9222 --user-data-dir=/tmp/maestro-probe
```

`http://127.0.0.1:9222/json/list` gives the renderer's WebSocket URL; Node 22's global `WebSocket`
speaks the protocol with no dependency added to the repo. `Runtime.evaluate` reads the DOM,
`Input.dispatchMouseEvent` (press → several moves → release) does a drag React Flow will honour,
`Page.captureScreenshot` with a `clip` gives a zoomed crop, and
`Page.addScriptToEvaluateOnNewDocument` installs a per-frame sampler *before* any page script runs
— that last one is how the `mounted` flag was settled. `window.maestro.project.open(path)` is
exposed to the renderer, so a probe can switch projects without the native folder dialog.

Use `electron .` rather than `pnpm start`, and never `dev`: `dev` serves the renderer over
`http://localhost:5173` and skips the `file://` path that ships.
