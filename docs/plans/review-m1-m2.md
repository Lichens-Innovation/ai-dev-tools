# Review — M1 (`maestro-core`) and M2 (Electron shell)

## Context

M1 and M2 landed together in one session: a new package (`packages/maestro-core`, ~14 modules,
58 tests) and a new app (`apps/maestro`, three-process Electron shell with the whole renderer
moved over). That is a lot of surface to have merged without a second pass, and two of the changes
reach outside the migration into shared code every app depends on.

This plan is the second pass. It is deliberately specific: the point is not "look at the diff" but
"here are the twelve things most likely to be wrong, ranked."

Nothing here blocks M3 except items **1** and **2**, which are known gaps rather than suspicions.

---

## Known gaps (not suspicions — these are confirmed)

### 1. `seeded` is plumbed to the renderer and never rendered

`WorkflowsData.seeded` / `RulesData.seeded` flow from `main/ipc.ts` through
`utils/maestro.ts` into both route loaders, and no component reads them.

Consequence: opening an unconfigured project shows a fully populated canvas — six seeded workflows,
five instances — with nothing on disk and no indication that a save is required to persist any of
it. A user who opens a project, looks around, and closes the app has written nothing but has no
reason to believe that.

Fix: a banner on `/workflows` and `/rules` when `seeded` is true — "starter configuration, not yet
saved" with the save button as the call to action. Small, but it is the first thing a new user sees.

### 2. No error path from a rejected IPC call

`ipcMain.handle(IPC.configSave, …)` throws `new Error("No project is open.")` when
`currentRoot()` is empty. `submitMaestroConfig` in the renderer does not catch, and neither route's
`handleSubmit` wraps the call — so the rejection surfaces as an unhandled promise rejection in the
console, the toast never fires, and `phase` stays `"saving"`, leaving the button spinning forever.

Every route reachable without a project has this shape. Fix: an `invoke` wrapper in the preload or
a small `callMain()` helper in the renderer that converts a rejection into a typed result, plus
`try/finally` around the `setPhase` calls so the button always resets.

---

## Worth scrutinising, in rough priority order

### 3. `packages/ui` gained `react-dom` + `@types/react-dom` — verify help-server still builds

`toast.tsx` imported `createPortal` from `react-dom` without the package ever declaring it. It
resolved by accident through the consuming apps' `node_modules`; electron-vite's stricter
resolution surfaced it. It is now a `peerDependency` + `devDependency`, matching how `react` was
already declared.

This is a fix to genuinely broken metadata, but it changes a package **both other apps consume**.
`apps/help-server` and `apps/ai-tools-manager` were not rebuilt after the change. Confirm both
still build, and confirm pnpm didn't resolve a second React copy into either (a duplicate
`react-dom` would break hooks at runtime, which no typecheck catches).

### 4. The `@repo/maestro-core/contracts` boundary is a convention, not an enforcement

`contracts.ts` exists so the renderer's type graph never reaches `fs` / `child_process` /
`import.meta.dirname`. It works — the web typecheck is clean — but nothing stops the next person
from writing `import type { SaveResult } from "@repo/maestro-core"` in `shared/ipc.ts` and
silently undoing it. The failure is quiet: types still resolve, `tsc` still passes if `@types/node`
happens to be in scope.

Consider a test that asserts `src/shared/`, `src/preload/`, and `src/renderer/` never import the
package barrel. (This gets more important, not less, after the core-absorption refactor, where the
boundary stops being a package export at all — see `core-absorption.md`.)

### 5. `tailSessionLog` — a single tail shared by a single subscriber

`main/ipc.ts` keys tails by `webContents.id`, and `startTail` stops any existing tail for that id
before starting a new one. `SessionLogProvider` is mounted once in `__root.tsx`, so today there is
exactly one subscriber per window and this is correct.

But the contract is fragile: a second `window.maestro.log.subscribe(...)` anywhere in the renderer
would silently steal the tail from the first, and _its_ unsubscribe would kill the tail for both.
Either document that subscribe is single-owner, or refcount it.

Also worth a real-session check: `tailSessionLog` starts with `sawFile = snapshot.length > 0`, so
an empty-but-existing log file is indistinguishable from an absent one. The first `reset` after
SessionEnd may not fire in that case.

### 6. `project-store` caching and the resolve-on-read filter

`getState()` caches in a module-level `cached`, then on every call filters out recent entries whose
`root` no longer exists and rewrites the file if anything changed. That is a `readdir`-free
`existsSync` per entry per call, and `getState()` is called by every IPC handler via
`currentRoot()`.

Two things to check: (a) the rewrite-on-read means opening the app with a since-deleted project
mutates `projects.json` as a side effect of a read, which is surprising; (b) `current !== cached.current`
is a reference comparison — correct as written, but only because the filter constructs a new object.

### 7. `readConfig` returning `null` for a missing file is a semantic change

The web app's `readConfig` returned a seeded default for a missing file, conflating "no config
yet" with "here is a starter". The port splits those. Every caller was updated, but the seeding
decision now lives in `main/ipc.ts` with a hardcoded `["backend"]` — M3 replaces that with repo
detection. Confirm no path silently writes a seeded config to disk that the user never approved.

### 8. Renderer bundle is 2.34 MB, unsplit

`autoCodeSplitting: false` in `electron.vite.config.ts`. For a local `file://` load this is
defensible — there is no network — but it costs startup parse time on every launch, and React Flow
plus dagre plus react-markdown are the bulk of it. Worth measuring cold-start before deciding;
worth revisiting after M6 adds help-server's routes (highlight.js, react-table).

### 9. The canvas lost its SSR guard — confirm visually

`workflow-canvas.tsx` was moved verbatim, including the `mounted` flag that existed purely to dodge
SSR. It is now dead weight but harmless. What has _not_ been verified is the thing that guard was
protecting: React Flow measuring nodes correctly on first paint, and dagre laying out a workflow
with no saved positions. **This needs a human looking at the window**, not a test.

Same for: the `FitViewEffect` debounce on workflow switch, drag-to-persist positions, and the
condition-edge label editor.

### 10. `discoverAgents` bundled-agents path resolution

`defaultBundledAgentsDir()` resolves `import.meta.dirname/../../../plugins/ai-tools-manager/agents`,
which holds when running from source in the monorepo. Under electron-vite the main process is
bundled to `out/main/index.js`, so `import.meta.dirname` is the **build output** directory, not
`packages/maestro-core/src`. Verify the bundled agents actually load in a built app (`pnpm build`
then run), not just in dev. The `MAESTRO_BUNDLED_AGENTS_DIR` escape hatch exists but nothing sets it.

### 11. Generated plugin libs — confirm no drift was introduced

`scripts/lib/maestro-session.cjs` and `maestro-skill-regions.cjs` are now generated. The parity
tests compare against snapshots of the hand-written originals, and the real `maestro-install.js` +
`maestro-inject-agent-context.js` were smoke-tested against a scratch project. Still worth: a
`git diff` review of the two generated files to confirm nothing semantic changed, and a check that
`build:plugin-libs` is idempotent (running it twice produces no diff).

### 12. Dead code left behind in the moved renderer

`utils/text.ts` was copied but the create-\* routes that used it were not. `chip-multi-select.tsx`
and `rule-tree.tsx` came across whole. Check for unused files and unused exports before they
calcify — `noUnusedLocals` catches locals, not whole modules.

---

## How to run this review

1. **Build the two untouched apps** to clear item 3:
   `pnpm --filter helper-server build && pnpm --filter ai-tools-manager build`
2. **Launch the desktop app and use it** — this is the only way to clear items 1 and 9:
   `pnpm --filter maestro dev`, open this repo and the scratch project, switch between them, edit a
   workflow, drag a node, save, close and reopen.
3. **Build and run the packaged output** to clear item 10:
   `pnpm --filter maestro build && pnpm --filter maestro start`
4. **Re-run the suites**: `pnpm --filter @repo/maestro-core test` (58) and
   `pnpm --filter maestro test` (8).
5. `git diff plugins/ai-tools-manager/scripts/lib/` for item 11, then run
   `pnpm --filter @repo/maestro-core build:plugin-libs` again and confirm a clean tree.

## Definition of done

Items 1 and 2 fixed. Items 3, 10, and 11 confirmed or filed. Items 4–9 and 12 either fixed, or
written down somewhere durable with a decision — not left as ambient unease.
