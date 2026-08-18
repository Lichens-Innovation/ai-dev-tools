# maestro (desktop)

The Maestro desktop app — an Electron shell over the node-side Maestro logic in `src/core/`. It
opens a project folder, edits and saves the full Maestro config with **no Claude session in the
loop**, and live-tails the session log the Claude Code hooks write.

It **replaced** `apps/ai-tools-manager`, which was deleted in M5 along with its image, its
per-project container and port, its `/tmp` channel files, and the ~470 lines of bash whose only job
was to show a window. If you find a doc still describing a container to launch or a result file to
wait on, it is stale — say so rather than following it.

In M6 it also absorbed `apps/help-server`, the second and last of this repo's containerised web
apps: its dashboard is `/tools`, its doc reader is `/docs`, its chat is a panel on the bridge, and
its node logic is the last five modules of `src/core/`. That app, its `Dockerfile`,
its `docker-compose.yml` and the `/help-server` slash command that started them are gone —
**there is no server to start and no port 3008**. `plugins/ai-tools-manager/skills/super-help/`
stayed: it is a skill the CLI invokes, not app machinery, and the chat panel still asks for it by
name. This file is where that app's CLAUDE.md was re-homed; the ported modules and components each
carry a `PORTED FROM` header naming their original.

## Why it exists

In the web app every write went through Claude. The app ran in Docker and could only reach the
project through a `/project` bind mount, so `submitMaestroConfig` wrote `maestro.json`
"for local dev" and the `/maestro-app` skill re-wrote it host-side to be safe. The two steps that
finish a save — `maestro-render-orchestrator.cjs` and `maestro-apply-rules.js` — are **pure node,
no LLM**, but had to run on the host, so they were Steps 3 and 4 of a SKILL.md. A Claude session
was acting as transport for `fs.writeFileSync` and `execFileSync`.

Here a save is one IPC call.

## Architecture docs live in `.claude/skills/`

Six of them, moved here when the web app was deleted. They are the long-form reference; this file
is the short one.

| Skill                        | Covers                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `maestro-architecture`       | the **runtime** — install pipeline, orchestrator + hook lifecycle, the four config/state files, the HANDOFF routing contract |
| `workflow-view`              | `/workflows` — the React Flow canvas and how the diagram maps to `maestro.json`                                              |
| `rule-view`                  | `/rules` — the two rule selectors, the directory tree, and how a save moves rule files                                       |
| `log-view`                   | `/session-log` — the three panes, how entries become instances, and how the hooks write the log it reads                     |
| `create-skills-architecture` | the four `create-*` flows — scaffold, confirmation dialog, consuming prompts                                                 |
| `updating-maestro`           | how a runtime change actually reaches a project, on either delivery path                                                     |

## Process layout

```
src/core/      ALL node-side Maestro logic, framework-free. No React, no Electron.
src/main/      electron. Owns the project state, the log watcher, the IPC handlers.
src/preload/   the contextBridge. The ONLY path from renderer to node.
src/renderer/  a TanStack Router SPA. No node imports at all.
src/shared/    ipc.ts — the typed channel contract, imported by all three.
```

`src/main/ipc.ts` is a list of thin adapters over `src/core/`; the logic is tested under
`test/core/` with no Electron runtime, which is what keeps a 200-test suite running in about a
second.

## `src/core/` — the node side

| Module                                  | What it owns                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `types.ts`                              | The `MaestroConfigV3` model persisted at `<project>/.claude/maestro.json`              |
| `contracts.ts`                          | Every type that crosses a process boundary. **Renderer-safe** — interfaces only        |
| `text.ts`                               | Pure string helpers. **Renderer-safe** — the ONE home; `utils/text.ts` re-exports it   |
| `success-path.ts`                       | Success-path derivation, node labels, agent→skill resolution (pure)                    |
| `skill-regions.ts`                      | Managed/rendered region markers in the orchestrator `SKILL.md` (pure)                  |
| `config.ts`                             | Read / merge-slice / write of `maestro.json`                                           |
| `render.ts`                             | Rewrites the `Maestro:HANDOFFS` table from `maestro.json`                              |
| `save.ts`                               | The three-step save the `config:save` channel is a wrapper around                      |
| `seed.ts` / `label-layout.ts`           | The starter workflows an unconfigured project opens with (pure)                        |
| `detect.ts`                             | Which implementation agent(s) the repo needs, and the evidence for it                  |
| `discovery.ts` / `fs-scan.ts`           | The agents, skills, rules and directory tree a project can pick from                   |
| `install.ts` / `uninstall.ts`           | Installs the runtime into a project, reports staleness, removes it                     |
| `session-runtime.ts` / `session-log.ts` | Ephemeral session file, append-only log, the tail                                      |
| `claude-cli.ts`                         | Where the `claude` CLI is, decided with `fs` and not with PATH alone                   |
| `claude-preview.ts`                     | Builds the prompt and issues a token. **Cannot spawn**                                 |
| `claude-tokens.ts`                      | The single-use, expiring, purpose-tagged authorisation between preview and run         |
| `claude-run.ts`                         | The only module that spawns Claude, and only for a token preview issued                |
| `ccusage.ts`                            | Usage stats — resolve `ccusage`, preview the command, run the previewed one            |
| `marketplaces.ts`                       | The user's local plugin marketplaces, read from `~/.claude/` at call time              |
| `scaffold.ts`                           | The deterministic half of the four create-\* flows, all-or-nothing                     |
| `tasks.ts`                              | The `/maestro-tasks` queue                                                             |
| `plugins.ts` / `curated.ts`             | Installed plugins, the project's own marketplace, and the curated marketplaces' cache  |
| `commands.ts` / `docs.ts`               | The CLI command table parsed out of `docs/claude-code.md`; the docs reader's node side |
| `plugin-entries/`                       | esbuild entry points for the plugin's generated CJS libs — see below                   |

The last four came from `apps/help-server` (`docs/plans/m6-help-server-merge.md`) and landed here
rather than in a package, deliberately: this milestone sits _after_ the core absorption so that
writing them into `packages/` and moving them a week later never happens. help-server's
`utils/helpers.ts` did not come across at all — its `PROJECT_ROOT`/`PLUGINS_DIR`/`DOCS_DIR` were
Docker-mount constants derived from `process.cwd()`, and here every path is joined onto the **open
project**, which is the only reason these views work against a project that is not this repo.

It was `packages/maestro-core` until it was folded in here (`docs/plans/core-absorption.md`).
The package existed so "the same code could serve two
consumers that cannot share a runtime", and that reason expired: the plugin's hook scripts are not
a runtime consumer — they get **generated bundles**, not imports — so the coupling is at build
time, and esbuild does not care which directory its entry point sits in. What was left was one
importing workspace plus a `package.json`, a `tsconfig.json`, a `vitest.config.ts`, a dependency
edge, an export surface, and a `pnpm install` on every change.

### Generated plugin libs — **do not hand-edit**

```bash
pnpm --filter maestro build:plugin-libs
```

Bundles `src/core/plugin-entries/*.ts` to CJS and writes them over:

- `plugins/ai-tools-manager/scripts/lib/maestro-session.cjs`
- `plugins/ai-tools-manager/scripts/lib/maestro-skill-regions.cjs`
- `plugins/ai-tools-manager/scripts/lib/maestro-seed.cjs`

**Those three files are generated. Do not hand-edit them** — edit the TypeScript source and re-run
the build. They are committed because a project installs them by file copy, so they must exist in
the repo rather than being produced at install time. (`lib/maestro-tasks.cjs` in the same directory
is _not_ generated; it is hand-written and has no banner.)

This script is load-bearing and **fails quietly**: if it stops producing correct output, the
committed `.cjs` files keep working and every test keeps passing — the symptom is that an edit to
`success-path.ts` stops reaching the plugin and the hooks go on running the old behaviour. So after
touching it, read `git diff plugins/ai-tools-manager/scripts/lib/` rather than trusting a green
suite. Two of its settings exist for exactly that reason and are not incidental:

- **`absWorkingDir`** — esbuild stamps a `// <path>` comment above each bundled module, relative
  to its working directory, so the output depends on where the build was launched from.
- **`tsconfig`** — esbuild walks up from the entry point to find one, and `strict` there is what
  makes it emit `"use strict";` at the top of a CJS bundle. During the move out of `packages/`
  that walk started finding `apps/maestro/tsconfig.json` (a solution file: `files: []`, references
  only) and the bundles silently came out non-strict.

The export surface of each bundle must stay identical to what the hook scripts `require()`;
`test/core/parity.test.ts` asserts the name lists.

`src/shared/ipc.ts` is the seam that replaces `createServerFn`. Where the web app relied on a
build step stripping handler bodies out of the client bundle — and on a convention about which
helpers could be exported (see the old app's "Server-only code and the client bundle" section) —
the boundary is now the process split. That whole hazard class is gone: an accidental node import
in the renderer fails the build instead of blanking a route at runtime.

Types that cross the boundary come from `src/core/contracts.ts`, **not** `src/core/index.ts`. The
barrel re-exports `fs` and `child_process`; importing a type from it pulls all of that into the
renderer's type graph. `contracts.ts` is interfaces only.

That used to be enforced by a package export — `src/core` was `packages/maestro-core`, and the
renderer imported `@repo/maestro-core/contracts`, so reaching for the barrel looked different
enough to catch in review. Both are relative paths now and differ by one word, so the enforcement
is a test: the **src/core boundary** block in `test/isolation.test.ts` resolves every specifier
under `src/{shared,preload,renderer}` on the filesystem and fails on anything that lands in
`src/core` other than `contracts` or `text`. It names the file and the module it found.

## The save path

`config:save` → `saveConfig()` in `src/core/save.ts`:

1. merge the edited slice into `maestro.json` and write it (2-space indent, **no trailing
   newline** — preserved so existing repos show no spurious diff);
2. re-render the orchestrator's `Maestro:HANDOFFS` table from it;
3. apply the rule assignments (move project rules, `vibe-rules load` installable ones).

The `SaveResult` carries the rendered success paths and the rule summary, so the toast reports
what actually changed on disk. Gone: `RESULT_FILE`, `aiToolsAction`, `hookSpecificOutput`,
`wait-ai-tools-result.sh`, and `/maestro-app` Steps 2–5.

## Form architecture (the four create-\* routes)

All four follow one pattern, inherited from the web app and still accurate:

- **State**: `react-hook-form` + `zod` (via `@hookform/resolvers/zod`). The schema lives at the top
  of the route file; the inferred type drives `useForm<T>`.
- **UI primitives**: `@repo/ui` — `Button`, `Field`, `Input`, `Textarea`, `ChipInput`, `Select`,
  `ModePill`, `ThemeToggle`, `ShortcutsDialog`, `FilePreview`, `SyntaxLine`. Icons from
  `lucide-react`.
- **Layout**: split pane — form left, live `FilePreview` right showing the file that will be
  generated. Per-route preview components compose `FilePreview` with their own `lines: string[]`.
- **Submit feedback**: the window is long-lived and the user creates repeatedly, so a form is never
  replaced by a terminal success view. Each submit fires a `toast` (`@repo/ui/toast`) and the route
  stays mounted; the create forms `reset()` for the next artifact.
- **Keyboard shortcuts**: ⌘N (jump to field), ⌘↵ (submit), `?` (help), Esc (close). The map lives in
  the route and is rendered by `create-shell.tsx`.
- **`target` toggle (skill & subagent only)**: a second `ModePill` picks `marketplace` or `project`.
  In project mode the marketplace/plugin selectors are hidden and the file is written under
  `<projectRoot>/.claude/`.

### Adding a route / form

1. Create `src/renderer/src/routes/<name>.tsx` mirroring `create-plugin.tsx` (no mode) or
   `create-skill.tsx` (auto/manual + target). Define the zod schema, wire `useForm` + `Controller`,
   render with `Field`/`Input`/`Select`/`ChipInput` from `@repo/ui`, and wrap it in `create-shell`.
2. Add a `scaffold<X>` function to `src/core/scaffold.ts` and a prompt builder to
   `claude-preview.ts`. Both must resolve the path through `resolveCreateTarget`.
3. Create the preview component under `src/renderer/src/components/`.
4. Add the channel to `src/shared/ipc.ts` and the handler to `src/main/ipc.ts` — the renderer must
   never touch `fs`.
5. Write the consuming prompt at `plugins/ai-tools-manager/skills/<name>/SKILL.md`, documenting the
   payload shape and the file(s) Claude should finish.

There is **no hook to register** for a new form. The `UserPromptExpansion` entries that used to
launch one per route are gone with the container; a route is reached from the top bar's **Create**
menu, and the prompt reaches Claude through the bridge.

## What still requires Claude Code

The **runtime** half — hook scripts that fire inside a session: `maestro-inject-agent-context`
(SubagentStart), `maestro-subagent-log` (SubagentStart/Stop), `maestro-session-log` (PreToolUse),
`maestro-validate-tasks` (PostToolUse), `maestro-session-cleanup` (SessionEnd),
`maestro-set-session-workflow.cjs`, `bash-validation.sh`.

They still need a session to _run_, but no longer to be **installed**: `/install` copies them into
`<project>/.claude/scripts/` and registers them in the project's own `.claude/settings.json`
(`installRuntime()` in `src/core/install.ts`). Why project-local registration exists at all: the
plugin's `${CLAUDE_PLUGIN_ROOT}` hooks resolve into a version-keyed marketplace cache, so runtime
fixes shipped without a `plugin.json` bump never reached an installed project.

The split is the one the `maestro-architecture` skill already draws, at `maestro.json`.

## Routes

| Route                                                                        | Purpose                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                          | Project picker + recent projects. The web app had no such page — a container was launched per-project, so there was nothing to choose.                            |
| `/workflows`                                                                 | React Flow canvas. Writes the workflow slice. On an unconfigured project it also shows the detected implementation chain, its evidence, and chips to correct it.  |
| `/rules`                                                                     | Assign rules to the project root / directories. Writes the rules slice.                                                                                           |
| `/session-log`                                                               | Live view of `maestro_session.log.jsonl`.                                                                                                                         |
| `/maestro-tasks`                                                             | The queue `/to-maestro-tasks` wrote. Also the first consumer of the `claude -p` bridge: **Run with Claude** previews the invocation, confirms it, and streams it. |
| `/install`                                                                   | Install / update / remove the project's Maestro runtime, and say what changed on disk.                                                                            |
| `/create-skill`, `/create-subagent`, `/create-plugin`, `/create-marketplace` | The four creation forms, behind the top bar's **Create** menu. Split-pane: form left, live file preview right.                                                    |
| `/tools`                                                                     | help-server's tabbed dashboard. Three tabs are one `data:tools` round trip; **Usage Stats** is not — it previews a command and runs it only when asked (below).   |
| `/docs`, `/docs/$slug`                                                       | The documentation reader over the open project's `docs/`, with per-heading search that deep-links and highlights.                                                 |

### The top bar is grouped, not a list

Four top-level links (Workflows, Rules, Session Log, Maestro Tasks) — the things a user came to
_do_, all of which write — then a divider, then two menus: **Library** (Tools, Docs, Runtime) for
everything that only reads, and **Create**. Folding `/install` into Library is what kept the bar
from overflowing when help-server's two sections arrived, and it is safe only because the runtime
staleness badge moved onto the Library **button**: the badge is the one item in the bar nobody goes
looking for, so it has to be visible from whatever route the user is already on.

### Adding a tab to `/tools`, or a doc page

Re-homed from `apps/help-server/CLAUDE.md`, which is where these two recipes lived until that app
was deleted. Both changed shape in the move — a tab is an IPC round trip rather than a
`createServerFn`, and a doc is read from the **open project** rather than a Docker mount — but the
work is the same shape.

**A tab.** Four of the five steps are in `src/core/` and `src/main/`; only the last is a component.

1. Write the read in a `src/core/*.ts` module, taking `projectRoot` as an argument — never
   `process.cwd()`, which under Docker was always this repo and here is wherever the app happened to
   be launched from. This is what makes the dashboard work against a project that is not this one.
2. Put the type it returns in `src/core/contracts.ts` (interfaces only) and widen `ToolsData`.
3. Fold it into the **existing** `data:tools` handler in `src/main/ipc.ts` rather than adding a
   channel. help-server's dashboard made one server-fn call per tab; this is one round trip
   precisely so four tabs cannot each re-walk the project tree.
4. Add the component under `src/renderer/src/components/tabs/` and an entry to `TABS` in
   `routes/tools.tsx`.

Unless the tab **runs something** — then it is not loader data at all, and needs a preview/run
channel pair and a purpose-tagged token, like Usage Stats above.

**A doc page.** Drop a `.md` file into the open project's `docs/`. The slug is the filename;
`listDocs()` and `searchDocs()` in `src/core/docs.ts` pick it up with no registration anywhere.
Heading anchors come from `slugifyHeading()`, which the search index and the reader must go on
sharing — a second slugifier means search hits that scroll nowhere.

**`src/renderer/src/routeTree.gen.ts` is generated** by the router plugin: commit it, never
hand-edit it. help-server said the same about its own copy; it is the one piece of that app's stack
that came across unchanged.

## The create-\* routes

They are the last part of the web app to come across, and the only one where a model is genuinely
required — not to write files, but to author a **body**: the prose of a `SKILL.md`, an agent's
system prompt. So each submit is two operations, in this order:

1. `create:scaffold` writes everything deterministic — directory, frontmatter, plugin manifest,
   marketplace registration — and returns what it wrote. No model, and none reachable: the module
   behind it (`src/core/scaffold.ts`) calls nothing.
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
choice about where a skill lives — what went is the path ambiguity that existed _because_ the
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
output with a Stop. See `src/core/claude-preview.ts` and `src/core/claude-run.ts` for why preview
and run are two operations and what breaks if they become one. Everything a route needs is `window.maestro.claude.preview(request)`
plus rendering `<ClaudeRunDialog>` with the result — a route that shells out on its own has opted
out of the confirmation, which is the whole point.

Tokens carry a **purpose** (`claude-tokens.ts`). The usage-stats reader below shares this store —
one expiry rule, one single-use rule, one place to clear on a project switch — but not its tokens:
without the tag, a stats preview would hand the renderer something `claude:run` would claim, and
the app would spawn `npx` while every message on screen said Claude.

### The help chat is a bridge consumer, not a second spawn path

help-server ran its chat by calling `execFile("claude", ["-p", prompt, …])` from a server
function, once per message, with no preview and no confirmation. That is precisely the thing the
bridge exists to prevent, so the port rebuilt it rather than moving it:
`utils/chat-context.tsx` previews a `{ kind: "help-chat", message, history }` request and runs the
token that comes back. `components/chat-panel.tsx` is a view of that context and may not touch
`window.maestro.claude` at all.

Four things about it are decisions rather than styling:

- **The confirmation is inline in the transcript**, not `ClaudeRunDialog`. In a chat the answer
  belongs in the conversation, so the consent does too — a modal would put the prompt in one place
  and the streamed reply behind a dialog the user has to dismiss. It shows the same list: full
  prompt verbatim, exact argv, working directory.
- **The chat runs without `--permission-mode acceptEdits`** (`CLAUDE_ASK_FLAGS`). That flag exists
  so a create-\* run can finish the file it was started for; a question is not an authoring job,
  and pre-accepting edits for one would give a chat message the same write authority as a form the
  user filled in deliberately. `targets` is empty because nothing is writable, not because nobody
  worked it out.
- **History travels on the request**, not in main's memory. It is then part of the string the
  preview displays, so "the user saw exactly what ran" stays literally true on the tenth message.
  It is capped (ten turns, clipped) for the same reason: a prompt too long to read is one nobody
  reads.
- **"Don't ask again" defaults to asking, dies with the session, and is on screen.** It is
  `useState(true)` in the context — nothing persists it, and a project switch resets it along with
  the transcript. The checkbox renders in both states, so it can always be turned back on, and the
  prompt is kept under each answer even when the confirmation is off: not being interrupted is not
  the same as not being told what ran. `test/isolation.test.ts` pins all three properties.

### Running a tool from the network — the usage-stats decision

`/tools`' Usage Stats tab is the one feature whose tool may be **fetched from npm and executed**.
help-server ran `npx --yes ccusage@latest <view> --json` on every view of it, silently. Under
Docker that was already true; on a desktop app pointed at the user's own machine it is a more
pointed choice, so it did not survive the move unchanged. `src/core/ccusage.ts` carries the
argument in full; the shape of it:

1. **A local copy wins.** The open project's `node_modules/.bin` first (a repo that pinned ccusage
   has already made this decision), then the same expanded directory list `claude` is resolved
   against — a GUI-launched app's PATH is not the user's PATH.
2. **A remote fetch is pinned**, to `PINNED_CCUSAGE_VERSION` in that file. `@latest` means the
   app's behaviour changes without the app changing: a release published this afternoon runs
   tonight, with output `reduceUsage` has never seen and a supply chain nobody reviewed. Bumping
   it is a diff, and the reduction is written against that version.
3. **It is shown first.** `stats:preview` resolves and returns the exact argv plus
   `network: true/false`, and spawns nothing; `stats:run` accepts only the token preview issued.
   So "the user was told a package would be fetched and executed" is a property of the wiring.
4. **It degrades in the preview.** A machine with neither `ccusage` nor `npx` gets a message naming
   the tool and where it was looked for, while the Run button is still un-pressed — not an ENOENT
   after a spawn.

What was **not** done, and why: the fetch was not removed. ccusage parses `~/.claude`'s own JSONL,
and reimplementing that here would be a second reader of someone else's file format, drifting in
silence. It was also not vendored — a dependency of the app is one the app ships, and a user who
never opens this tab should not carry it.

## Things that bite

- **Hash history, not browser history.** A packaged build loads the renderer over `file://`,
  where pushState paths don't resolve on reload. See `src/renderer/src/main.tsx`. **Corollary: a
  route cannot also use the URL fragment.** The whole route already lives in `location.hash`, so a
  second `#` in it is not something the router or `querySelector` can be trusted to split — which
  is why the docs reader carries the heading to scroll to as the `at` SEARCH param and scrolls by
  element id, where help-server read `window.location.hash`. For the same reason `/docs/$slug`
  intercepts in-page `#anchor` links in rendered markdown: left alone, one would rewrite the route
  and throw the reader out of the app.
- **`components={{ text: … }}` in react-markdown highlights nothing.** `components` is keyed by
  ELEMENT name, and `text` is the **SVG** `<text>` element, not a markdown text node. It
  type-checks (it is a real JSX intrinsic), it renders, and the body highlight silently never
  happens — help-server shipped it that way, and the port inherited it until a window probe counted
  zero `<mark>` elements in an article opened from a search hit. Text nodes are reachable from a
  rehype plugin, so `utils/highlight.ts` marks the hast tree instead; that also means a term inside
  a link, a list item or a table cell lights up, which the per-element approach could not do.
- **A doc slug is renderer input, and the reader treats it as such.** `isValidDocSlug` in
  `src/core/docs.ts` rejects anything containing `/`, `\` or `.` _before_ the path is joined. The
  slug arrives as a route param, so `../../../etc/passwd` is a file `readDoc` would otherwise be
  perfectly happy to open and render. help-server validated it with a regex for exactly this
  reason — keep the check if you touch that function, and keep it before the `path.join`, not
  after.
- **Two functions answer to "get the rules", and they are not the same set.**
  `discoverRuleLibrary` reads `<project>/rules/*.md` — what the project publishes, shown on
  `/tools`. `discoverProjectRules` reads every `.claude/rules/` in the tree — what is assigned to a
  directory, shown on `/rules`, and what a save MOVES. A project can have either without the other,
  so they were deliberately not unified; the names and the return types (`RuleLibraryEntry` with
  `title`/`paths` vs `ProjectRule` with `id`/`dir`) are what keep the next reader from assuming one
  view manages the other's files.
- **The chat's state cannot live in the panel — `TopNav` remounts on every navigation.** The
  toggle and the panel are rendered by the top bar, which each route mounts for itself, so a
  transcript held in `chat-panel.tsx` would be discarded the moment the user clicked Docs to look
  something up. Worse, `runningToken` is the only handle on a run in flight: losing it leaves
  Claude running with no Stop to press. Hence `ChatProvider` in `__root.tsx`, inside
  `ProjectProvider` (a project switch ends the chat session) and above the `Outlet`.
- **`__root.tsx` has no `shellComponent`.** TanStack Start rendered the whole `<html>` document,
  so the root route owned `<head>`/`<body>`/`<Scripts>` and the theme bootstrap. Those live in
  `src/renderer/index.html` now, along with the renderer CSP.
- **`@repo/claude-fs` must be bundled into main, not externalized.** It's a workspace _source_
  package with no build artifact, so `require` can't resolve it at runtime — hence the
  `externalizeDepsPlugin({ exclude: [...] })` in `electron.vite.config.ts`. The node-side Maestro
  logic used to be a second such package; it is `src/core/` now, ordinary app source that gets
  bundled without anyone having to ask.
- **Project switches invalidate the router.** Every route loader reads the _current_ project from
  main-process state, so `ProjectProvider` calls `router.invalidate()` on the `project:changed`
  broadcast. Without it a switch leaves stale data on screen.
- **Editor state must be keyed by `projectRoot`, or a switch writes one project into another.**
  The invalidation above only re-runs the _loader_. Any state seeded from loader data and then
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
  config was "not saved" while it sat on disk. `/rules` was worse, since a rules save _moves rule
  files_, leaving its tree and rule pool describing a layout that no longer exists. Both routes
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
  `"type": "module"` makes node parse their `require()` as ESM — the hook then fails on _every
  tool call_ with "require is not defined in ES module scope". Nothing catches this but running a
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
  Only purge deletes the skill, the copied scripts and the config, and it is reachable _only_
  through the confirmation dialog, which lists the exact files first. The `purge` flag is explicit
  at every hop — `uninstall(purge: boolean)` in the context takes no default, and the IPC handler
  reads `opts?.purge === true` — so no malformed or missing argument can escalate a call into a
  purge. `test/core/uninstall.test.ts` asserts what each level _leaves_.
- **Staleness is content, never mtime.** `installedRuntimeId`/`shippedRuntimeId` are sha-256 over
  the runtime manifest. A `git clone` rewrites every mtime, so an mtime comparison would report a
  fresh checkout as stale and make the badge noise the user learns to ignore.
- **The seeded chain is detected, and only proposed while nothing is on disk.** `data:workflows`
  calls `detectImplAgents()` (in `src/core/detect.ts`) instead of the old hardcoded
  `defaultV3Config(["backend"])`, and returns the `RepoDetection` on the same payload as the seed —
  one round trip, so the evidence cannot describe a different chain than the canvas is showing.
  `DetectedChain` renders only when `seeded`: once `maestro.json` exists the chain is the user's
  saved answer, and re-proposing a detected one over a graph they built would be offering to
  overwrite their work. Correcting the chain goes back to main (`data:reseed`) to rebuild the seed
  with the _same_ `defaultV3Config`, rather than duplicating the builder in the renderer — it is
  pure, but it lives behind the barrel that re-exports `fs`. The round trip is why
  `replaceConfig()` takes a project root and drops a result whose root no longer matches: a
  re-seed in flight across a project switch would otherwise land project A's starter graph on B's
  canvas, the same failure `seedWorkflowStore`'s guard exists for.
- **The create routes' preview and their scaffold must resolve the same path.** Both go through
  `resolveCreateTarget` in `src/core/scaffold.ts`, and the confirmation dialog names the file it
  returns. A second resolution anywhere — a path computed in the renderer, a `path.join` inlined
  into a prompt builder — makes the modal describe a file other than the one on disk, and the
  user is being asked to consent to the wrong thing. `test/create-preview.test.ts` and
  `test/scaffold.test.ts` in that package compare the two.
- **The renderer's `utils/text.ts` re-exports and must never implement.** `buildDesc` decides the
  `description:` frontmatter, and the form's live preview shows it _before_ the file exists while
  the node-side scaffold writes it after. Two implementations means a preview that can silently
  stop matching the file — and it looks fine right up until someone edits one of them.
  `src/core/text.ts` is the one home; note that module rather than the barrel, which re-exports
  `fs`. `test/isolation.test.ts` fails on a re-implementation anywhere under `src/renderer`.
- **A create-\* run's working directory is not always the open project.** A skill written into a
  marketplace repo, or a brand-new marketplace, lives outside it — and a headless run whose edits
  are all outside its cwd gets none of them auto-accepted by `--permission-mode acceptEdits`, with
  nobody to ask. `claude-preview.ts` derives the cwd from the same resolution that chose the path;
  the dialog shows it. Verified in the window: a marketplace-target skill runs in the marketplace.
- **The prompt is prose, never `/create-skill`.** Historically a slash command in a headless run
  fired the plugin's `UserPromptExpansion` hook, which launched the Docker app and blocked on a form
  submission that could never arrive. That hook is gone, but the rule stands: a slash command
  re-enters the skill from the top instead of finishing the scaffold, and re-derives fields the
  payload already carries. The instructions the skill would have supplied are inlined into the
  prompt, and a test asserts no create prompt contains a slash command.
- **`claude:run` takes a token and nothing else, and the preload must keep it that way.** The
  bridge's guarantee — the only executable prompts are ones the user was shown — comes from the
  run channel having no argument that could describe a different run. A preload that "helpfully"
  forwarded the prompt or argv alongside the token would reopen that in a diff that reads as a
  convenience, and every test under `test/core/` would still pass, because none of them can
  see this side of the wire. `test/isolation.test.ts` pins the call to `invoke(IPC.claudeRun,
token)` for that reason. The same applies to `claude:preview`, which takes a **request** —
  main builds the prompt; the renderer never supplies one.
- **Preview tokens are dropped on a project switch** (`clearInvocations()` in `announce()`). A
  token names the outgoing project's cwd, so a modal left open across a switch would otherwise
  still have a live token and Run would spawn Claude against the repo the window has moved off —
  the same failure shape as the `seedWorkflowStore` keying above.
- **A cancelled run's child is detached, so quitting must kill it.** The child is spawned into its
  own process group (that is how Stop reaches the CLI's _own_ children), which also means it
  outlives the app. `disposeIpc` calls `disposeClaudeRuns()`; without it, closing the window leaves
  Claude running against the user's repo with nothing left to stop it from.
- **`claude` is resolved explicitly, never off `process.env.PATH` alone.** A GUI-launched Electron
  app gets a PATH that does not include `~/.local/bin`, which is where the CLI installs — so the
  app reported "not installed" on machines where `which claude` answers instantly. This does not
  reproduce from a terminal, and no unit test in this app can see it. Verified by launching from a
  desktop entry; see `src/core/claude-cli.ts`.
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
  `src/core/index.ts` barrel, `@repo/claude-fs`, or any `node:` builtin. These are configuration
  and convention properties: they'd all regress silently without assertions.
- **The renderer bundle is code-split** (`autoCodeSplitting: true`). Measured 2026-07-31: unsplit
  was one 2,346 kB chunk; split is 593 kB shared + 772 kB `/workflows` (React Flow + dagre) +
  802 kB `/maestro-tasks` (react-markdown) + ~26 kB for the rest. The landing route is `/`, the
  project picker, which needs none of that — so startup parse drops by roughly 75%.
  Re-measured 2026-08-04 after help-server was folded in, by counting the chunks the packaged app
  actually requests (CDP `Network.requestWillBeSent`; `file://` module loads produce no
  `PerformanceResourceTiming` entries, so the obvious way to measure this returns an empty array
  and reads as "nothing loaded"): the landing route pulls 14 chunks / 1,107 kB and **none of the
  new code**; `/tools` adds 117 kB; `/docs/$slug` adds 558 kB, of which 555 kB is the react-markdown
  chunk now SHARED with `/maestro-tasks` rather than duplicated into it. help-server's
  `@tanstack/react-table`, `react-highlight-words` and `highlight.js` were deliberately not carried
  across — the tables filter with a `useMemo` and the highlighter is `utils/highlight.ts` — so the
  fold-in added no runtime dependency. What makes
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

Without it `dev` aborts with _"The SUID sandbox helper binary was found, but is not configured
correctly"_. pnpm doesn't preserve the setuid bit, and both `node_modules/electron` and
`apps/maestro/node_modules/electron` symlink into the store — so fix the store copy, not the
links. Do **not** work around it with `--no-sandbox`: the renderer's isolation from the OS is the
premise `test/isolation.test.ts` exists to defend. (`gits/farel` documents the same fix for an
npm layout.)

```bash
pnpm --filter maestro dev        # electron-vite dev, HMR on the renderer
pnpm --filter maestro build
pnpm --filter maestro typecheck  # both tsconfig projects
pnpm --filter maestro test       # test/ and test/core/ as one suite
pnpm --filter maestro build:plugin-libs   # after ANY edit under src/core/plugin-entries' graph
```

`test/core/` is the former `packages/maestro-core/test/`, and it is where the differential tests
live: parity against the last hand-written `.cjs` implementations (snapshotted under
`test/core/fixtures/legacy/`, deliberately _not_ read from `plugins/…/scripts/lib/`, which
`build:plugin-libs` overwrites — that comparison would be tautological), a byte-identity check on
the rendered `SKILL.md`, and the import-graph walk that proves `claude-preview.ts` cannot spawn.

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
`Page.addScriptToEvaluateOnNewDocument` installs a per-frame sampler _before_ any page script runs
— that last one is how the `mounted` flag was settled. `window.maestro.project.open(path)` is
exposed to the renderer, so a probe can switch projects without the native folder dialog.

Use `electron .` rather than `pnpm start`, and never `dev`: `dev` serves the renderer over
`http://localhost:5173` and skips the `file://` path that ships.
