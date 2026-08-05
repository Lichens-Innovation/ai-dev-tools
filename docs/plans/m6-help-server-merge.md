# M6 — Fold help-server into the Maestro desktop app

## Context

`apps/help-server` is the same shape as the app Maestro replaced: a TanStack Start app in Docker
(port 3008), launched by a slash command, mounting the repo at `/app` and `~/.claude` read-only,
with all data access in `createServerFn` handlers. It surfaces installed plugins, the project
marketplace, curated plugins, rules, CLI commands, usage stats, and documentation.

Everything the M2 migration learned applies unchanged: 20 server functions, all thin filesystem
reads, plus two that shell out. The difference from M2 is that this one is additive — no config
writing, no orchestrator rendering, mostly read-only views. It is the easiest of the milestones and
should be the last, because it benefits from every seam the earlier ones settled.

Two of its utilities have no counterpart in the Maestro half and deserve attention:

- `stats.ts` runs `npx ccusage@latest` — a network-fetching subprocess.
- `chat.ts` runs the `claude` CLI against `/super-help`, persisting history to
  `os.tmpdir()/claude-chat-history.md`. It is a second, independently-grown spawn path for exactly
  the thing M4 builds a confirmation flow around.

---

## Approach

### 1. Move the node logic into `src/core/`

By this point `maestro-core` has been absorbed (see `core-absorption.md`), so help-server's
utilities land beside it:

| From | To | Notes |
|---|---|---|
| `utils/plugins.ts` | `core/plugins.ts` | `getInstalledPlugins` already via `@repo/claude-fs`; `getProjectMarketplace` reads `plugins/*/plugin.json` |
| `utils/marketplace.ts` | `core/curated.ts` | fetches two hardcoded marketplaces via the `@repo/claude-fs` cache |
| `utils/rules.ts` | merge into `core/discovery.ts` | **overlaps `discoverProjectRules`** — see below |
| `utils/docs.ts` | `core/docs.ts` | slug-validated loading, per-heading search sections |
| `utils/commands.ts` | `core/commands.ts` | parses a markdown table out of `docs/claude-code.md` |
| `utils/helpers.ts` | delete | path constants (`PROJECT_ROOT`, `PLUGINS_DIR`, …) are Docker-mount constants; they become project-root joins. `parseFrontmatter` already lives in `@repo/claude-fs` |

**The rules overlap is the one real design question.** `help-server/utils/rules.ts` reads
`rules/*.md` at the repo root for *display*; `core/discovery.ts`'s `discoverProjectRules` scans
every `.claude/rules/` for *assignment*. They answer different questions about overlapping files.
Decide deliberately whether help-server's rules tab shows the same set the `/rules` view manages —
if it does, unify on `discoverProjectRules`; if it does not, name them differently so the next
reader is not misled by two functions called "get rules".

### 2. New IPC channels

Follow the M2 pattern exactly: one `data:*` channel per view, returning everything that view needs
in a single round trip. The lesson from `/rules` in M2 — four server fns, three of which each
re-walked the project tree — applies directly to the dashboard, whose four tabs would otherwise
each fetch independently.

```
data:dashboard   → { installedPlugins, projectMarketplace, curated, rules, commands }
data:docs        → { slugs }        /  data:doc → { slug, content, sections }
stats:usage      → ccusage output   (spawns; see below)
```

Types go in `core/contracts.ts`, which is already the renderer-safe boundary.

### 3. Routes as top-level tabs

`/` in help-server is a tabbed dashboard (Command Center, Stats, Project Marketplace, Curated).
Maestro's `/` is the project picker. Land help-server's dashboard at `/tools` and its doc reader at
`/docs/$slug`, and add both to `TopNav` beside Workflows / Rules / Session Log / Tasks.

The doc reader already uses `react-markdown` + `remark-gfm` + `prose prose-neutral` from
`@repo/styles` — the same stack `/maestro-tasks` uses. Nothing to reconcile.

`ChatSidebar` becomes a slide-panel (`@repo/ui/slide-panel` already exists) rather than a route.

### 4. The two spawning utilities

**`chat.ts` must route through M4's bridge.** It currently spawns `claude` directly with no
preview and no confirmation, which contradicts the decision that governs M4. Rebuild it on
`claude:preview` / `claude:run`: the user sees the prompt, presses Run, sees streamed output. A
chat UI makes the confirmation feel heavier than in the create-\* flows, so consider a per-session
"don't ask again" — but the default must be to show, and the setting must be visible and revocable.

**`stats.ts` needs its own decision.** `npx ccusage@latest` downloads and executes a package from
the network on every invocation. That was already true in Docker; in a desktop app it is a more
pointed choice. At minimum surface what is being run before running it. Better: detect a locally
installed `ccusage` and prefer it, or pin the version rather than floating on `@latest`.

### 5. Then delete

`apps/help-server/`, its `Dockerfile` and `docker-compose.yml`, and
`plugins/ai-tools-manager/commands/help-server.md`. Re-home `apps/help-server/CLAUDE.md`'s content
into `apps/maestro/CLAUDE.md` — the same "move the docs before deleting the app" trap as M5.

`skills/super-help/` stays: it is a skill the CLI invokes, not app machinery.

---

## Critical files

| Concern | Path |
|---|---|
| Server fns to port | `apps/help-server/src/utils/*.ts` (20 across 8 modules) |
| Dashboard tabs | `apps/help-server/src/components/tabs/*.tsx` |
| Doc reader | `apps/help-server/src/routes/docs/$slug.tsx` |
| Chat panel to re-route through M4 | `apps/help-server/src/utils/chat.ts`, `src/components/ChatSidebar.tsx` |
| Stats spawn to reconsider | `apps/help-server/src/utils/stats.ts` |
| Docker constants to delete | `apps/help-server/src/utils/helpers.ts` |
| Rules overlap to resolve | `apps/help-server/src/utils/rules.ts` vs `core/discovery.ts` |
| Shared reads (unchanged) | `packages/claude-fs/src/index.ts` |

## Verification

**This plan is done — help-server is deleted (task `014`).** Step 1 below is no longer runnable and
is kept for the record; there is no container to bring up and no port 3008. Everything else is now
verified against the desktop app alone, in a window, via the `test-maestro-desktop` skill.

1. ~~**Both apps' data matches.** Run the Docker help-server and the desktop app side by side against
   the same machine; the plugin list, marketplace, curated tools, rules, and command table must be
   identical. Do this *before* deleting anything.~~
2. **Docs search still works** — `getAllDocsForSearch`'s per-heading sections and the highlight
   behaviour are easy to break in a port and not covered by types.
3. **No node in the renderer**, still — `test/isolation.test.ts` must pass unchanged with the new
   routes present. help-server's utils import `node:fs` freely; a stray one reaching a component
   is the exact failure this suite exists to catch.
4. **Chat asks first.** Confirm no `claude` process spawns from the chat panel until the user
   confirms, same assertion as M4 verification 2.
5. **Bundle size.** help-server adds `highlight.js`, `@tanstack/react-table`, `@base-ui/react`,
   `react-highlight-words`. The renderer was already 2.34 MB unsplit (review item 8); measure
   cold-start after the merge and revisit `autoCodeSplitting` if it regresses.
6. `grep -rn "help-server\|helper-server\|3008"` returns only intentional historical references.
