# @repo/maestro-core

All node-side Maestro logic, framework-free. No React, no TanStack, no Electron.

This package exists so the same code can serve two consumers that cannot share a runtime:

1. **The Maestro desktop app's main process** — imports this package directly and exposes it to
   the renderer over IPC.
2. **The plugin's standalone Claude Code hook scripts** — run under bare `node` inside a user's
   project with no `node_modules`, so they cannot import a workspace package. They get generated
   CJS bundles instead (see below).

Before this package existed, the config/render/rules logic lived in `.cjs` scripts that a Claude
session shelled out to, purely because the containerised web app couldn't reach the host
filesystem. None of it needs an LLM — it is `fs.writeFileSync` and `execFileSync` with a walk over
a graph.

## Modules

| Module | What it owns |
|---|---|
| `types.ts` | The `MaestroConfigV3` model persisted at `<project>/.claude/maestro.json` |
| `success-path.ts` | Success-path derivation, node labels, agent→skill resolution (pure) |
| `skill-regions.ts` | Managed/rendered region markers in the orchestrator `SKILL.md` (pure) |
| `config.ts` | Read / merge-slice / write of `maestro.json` |
| `render.ts` | Rewrites the `Maestro:HANDOFFS` table from `maestro.json` |
| `session-runtime.ts` | Ephemeral session file + append-only log helpers |
| `install.ts` | Installs/updates the runtime into a project, and reports whether it is stale |
| `uninstall.ts` | Removes it again, at two levels — the mirror of `install.ts` |
| `seed.ts` | The starter workflows an unconfigured project's canvas opens with (pure) |
| `detect.ts` | Which implementation agent(s) the repo needs, and the evidence for it |
| `claude-cli.ts` | Where the `claude` CLI is, decided with `fs` and not with PATH alone |
| `claude-preview.ts` | Builds the prompt and issues a token. **Cannot spawn** |
| `claude-tokens.ts` | The single-use, expiring authorisation between preview and run |
| `claude-run.ts` | The only module that spawns Claude, and only for a token preview issued |
| `marketplaces.ts` | The user's local plugin marketplaces, read from `~/.claude/` at call time |
| `scaffold.ts` | The deterministic half of the four create-* flows, all-or-nothing |
| `text.ts` | Pure string helpers. The **one** home — the renderer imports the same module |

### `install.ts` — the project owns its runtime

The plugin's `hooks/hooks.json` registers the session hooks from `${CLAUDE_PLUGIN_ROOT}`, which
resolves into the **marketplace cache** — a copy keyed by `plugin.json`'s version. Any edit to
`hooks/` or `scripts/` that ships without a version bump is therefore invisible to every installed
project. `installRuntime()` copies the hook scripts into `<project>/.claude/scripts/` and registers
them in the **project's own** `.claude/settings.json` against `$CLAUDE_PROJECT_DIR`, which retires
that failure mode and makes "update this project's runtime" a file copy.

Three invariants, each with tests in `test/install.test.ts`:

- **Project-local, never global.** Every write is under `projectRoot`. `~/.claude` is read (to
  notice the plugin is installed too, which would double-fire every hook) and never written.
- **Merge, never clobber.** `settings.json` is hand-edited by users. Unknown keys and other
  people's hooks survive; an unparseable file **aborts the install** rather than being replaced
  with `{}` — which is what the legacy script did.
- **Idempotent.** Presence is keyed on the script's basename inside the command string, so a
  re-quoted command doesn't produce a second entry that fires the hook twice.

Staleness is content-addressed (`installedRuntimeId` vs `shippedRuntimeId`, sha-256 over the
manifest) and never mtime-based — a `git clone` rewrites every mtime, and two checkouts of one
commit must agree.

### `uninstall.ts` — two levels, and the default is the safe one

Install writes files the app owns; uninstall deletes files the **user** may have hours of work in.
That asymmetry is the design:

- **Default** — unregister the hooks, delete the ephemeral session files, and **keep
  `maestro.json`**. Someone who wants the hooks to stop firing has not asked to throw away their
  workflow graph and rule assignments.
- **Purge** (`{ purge: true }`) — also delete the orchestrator skill (and its `.bak`), the copied
  scripts, the installed handoff protocols, and the config.

Collapsing the two, or defaulting to the destructive one, turns "stop the hooks" into silent data
loss — so `uninstallPlan()` exists to let a UI **name the files** before it deletes them, and the
`purge` flag is explicit at every hop (renderer → IPC handler → core).

Hook removal mirrors registration and inherits its trap: a command is Maestro's only if it points
into `.claude/scripts/` **and** names a script we register. Path alone would claim a user's own
script living there; name alone would claim `~/bin/maestro-session-log.cjs`. Entries and events are
pruned only where we emptied them, an unparseable `settings.json` **aborts the uninstall** the same
way it aborts an install, and directories are removed only when the deletions left them empty.

Purge targets come from the runtime manifest **plus** a sweep of the two directories the app owns
(`.claude/scripts/`, `.claude/templates/handoffs/`), so a project installed by an older release
isn't left with orphans of scripts that release shipped. `.claude/handoffs/` is the user's override
location and is never touched.

`success_path` is **derived**, never stored — `successPathSteps()` is the sole source of truth for
"what steps this workflow has, in order".

### `detect.ts` — the seed reads the repo

`defaultV3Config()` takes the implementation-agent chain as a parameter, and the app used to pass
the constant `["backend"]`. A frontend project therefore opened on a canvas whose happy path was
wrong about its own codebase. `detectImplAgents(root)` replaces the constant.

Three constraints shape it:

- **No model, no network.** It runs on the first open of *every* project, so an LLM refinement
  (deferred to the confirmation modal in a later milestone) cannot be a prerequisite. It is
  `readdirSync` + `JSON.parse`.
- **Bounded, not a tree walk.** It reads the root and its workspace members — `workspaces` globs,
  `pnpm-workspace.yaml`, plus the `apps/*`, `packages/*`, `services/*` conventions — capped at 48
  directories. Cost tracks the number of packages, not the number of files: measured at 1–3 ms on a
  64,000-file checkout of this repo.
- **It returns its reasons.** `evidence` is a list of lines like ``"`fastify` in
  apps/api/package.json → backend"``, which the canvas shows beside the chain. The heuristic is
  occasionally wrong; the evidence is what lets a user see *why* and correct it. Correcting it
  re-seeds the graph, and nothing is on disk until Save.

`react` is deliberately not a frontend marker on its own — React Native and Expo apps depend on it
too, so `react-dom` is the web tell and bare `react` only counts when nothing in the same manifest
says native. Non-JavaScript manifests (`pyproject.toml`, `go.mod`, `Cargo.toml`, `*.csproj`, …) are
their own signal class, because a dependency-only detector would fall straight through to the
default on a repo that is perfectly clear about what it is. An unrecognised repo still gets
`["backend"]`, but flagged `fallback: true` and labelled as a default rather than a conclusion —
an empty chain would seed a workflow with no implementation step at all.

### The `claude -p` bridge — preview and run are two operations

The app may spawn `claude -p` on the user's behalf, **but it asks first and shows the prompt it will
send**. That was the decision taken when this migration was planned, and it is why the bridge is
four modules instead of one function.

```
previewClaudeRun(root, request) → { prompt, argv, cwd, targets, available, searched, token }
runPreviewedClaude(token, events) → streams stdout/stderr, resolves with how it ended
```

**Preview cannot spawn.** Not "does not" — `claude-preview.ts` imports no `child_process`, and
neither does anything it imports; `test/claude.test.ts` walks its transitive import graph and fails
on the file that introduces one. Availability is therefore decided with `fs` (the file exists and
carries `+x`), which is what lets preview answer "is the CLI installed?" while remaining incapable
of starting anything.

**Run cannot invent.** `runPreviewedClaude` takes a token and *nothing else* — no prompt, no argv,
no cwd. There is consequently no argument by which a caller could make the run differ from the
preview the user confirmed, which is a stronger guarantee than validating that it doesn't. Tokens
are single-use, expire after ten minutes, and live only in this process's memory. The property all
of that buys: **the only executable prompts are ones the user was shown.** Collapsing preview and
run into one "run this prompt" call removes it while looking like a simplification.

The prompt is built here, from a `ClaudeRequest` — a small union describing *what the user asked
for* — never from text the caller supplies. So the set of prompts the app can execute is the set of
cases in one `switch`, and a renderer bug cannot widen it.

**PATH is not trusted.** A GUI app does not inherit a login shell's PATH: a Linux desktop launcher
and macOS `launchd` both hand the process something much shorter, and the installer puts `claude` in
`~/.local/bin` — on every shell's PATH and almost no GUI app's. So `claude-cli.ts` searches PATH
*plus* the known install locations (including `~/.nvm/versions/node/*/bin`, which has to be read),
and returns the list of directories it looked in so a "not found" can name them. The failure this
prevents does not reproduce from a terminal, which is why the search list is data rather than a
constant hidden in a resolver.

Cancellation kills the **process group**: the child is spawned `detached`, because the CLI spawns
its own children and signalling only the process we started leaves them running with the UI
reporting the run as stopped.

### `scaffold.ts` — the create-* flows, minus the model

The four `create-*` routes split in two. Everything deterministic — the directory, the frontmatter,
the plugin manifest, the marketplace registration — happens here the instant the form is submitted;
only the *body* of a skill or an agent needs a model, and that goes out through the bridge above as
a `ClaudeRequest`. So the artifact is on disk before Claude is mentioned, and a user with no CLI
installed still gets everything but the prose.

```
scaffoldCreate(root, request, opts) → { scaffolded, name, path, written[], remaining, needsModel, reason? }
resolveCreateTarget(root, request, opts) → { name, path, marketplacePath }
```

**One resolution of where things go.** `resolveCreateTarget` is called by the writer *and* by
`claude-preview.ts`, so the file the confirmation names is the file on disk. Two resolutions would
be a modal describing a different artifact than the one being edited.

**No destination crosses the process boundary.** A request carries a marketplace *name* the user
picked out of `listMarketplaces()`; this module turns it back into a path. `target: "project"` means
the open project, which only the main process knows. The single exception is
`create-marketplace.targetDir` — the whole point of that form — which is validated as absolute and
shown before anything is written.

**Writes are all-or-nothing.** The web app's version wrote a plugin manifest, then best-effort
created `skills/`, then best-effort registered the plugin, and reported success if the *first* one
landed — so a `marketplace.json` it could not rewrite left a plugin on disk that no marketplace knew
about, under a summary saying it was fine. Here each flow declares its complete list of steps, the
pre-check refuses to clobber anything that exists, and a failure part-way rolls back the files and
directories it created and restores any JSON it had rewritten. `test/scaffold.test.ts` pins that.

### `marketplaces.ts` — and why it doesn't call `@repo/claude-fs`

`claude-fs` has these readers, and this module deliberately does not use them. It fixes `CLAUDE_DIR`
from `process.env.HOME` at module-evaluation time, so a test cannot point it at a fixture; and
`claude-preview.ts`'s no-spawn guarantee is enforced by an import-graph walk that follows only
*relative* imports, so a hop into a workspace package would leave the graph unwalked. Everything here
takes an explicit `home` — the same lever `claude-cli.ts` uses — and is a relative import.

Only `source: "directory"` marketplaces are offered. A GitHub-sourced one resolves into the plugin
cache, which the next `claude plugin marketplace update` overwrites, so a skill written there would
vanish without ever having been somewhere the user could commit it.

## Generated plugin libs

```bash
pnpm --filter @repo/maestro-core build:plugin-libs
```

Bundles `src/plugin-entries/*.ts` to CJS and writes them over:

- `plugins/ai-tools-manager/scripts/lib/maestro-session.cjs`
- `plugins/ai-tools-manager/scripts/lib/maestro-skill-regions.cjs`

**Those two files are generated — do not hand-edit them.** Edit the TypeScript source and
re-run the build. They are committed because a project installs them by file copy, so they must
exist in the repo rather than being produced at install time.

The export surface of each bundle must stay identical to what the hook scripts `require()`; a
test in `test/parity.test.ts` asserts the name lists.

## Tests

```bash
pnpm --filter @repo/maestro-core test
```

Two kinds:

- **Parity** (`test/parity.test.ts`) — differential tests against the *last hand-written* `.cjs`
  implementations, snapshotted under `test/fixtures/legacy/`. They are deliberately **not**
  imported from `plugins/…/scripts/lib/`: `build:plugin-libs` overwrites those with bundles
  generated from this package, which would make the comparison tautological.
- **Differential install** (`test/install.test.ts`) — runs the snapshotted `maestro-install.js`
  from a symlinked plugin root and asserts its whole output tree is a byte-identical subset of
  ours, then covers what the port adds: hook registration, idempotency over five runs, settings
  preservation, the refusal path, and executing the copied hook scripts with a synthetic payload.
- **Uninstall** (`test/uninstall.test.ts`) — asserts what is **left behind** at each level, not
  only what went: the config after a default uninstall, the user's hooks and keys after either, a
  same-named script outside `.claude/scripts/`, `.claude/handoffs/`, and that install-after-
  uninstall returns a working installation.
- **The bridge** (`test/claude.test.ts`) — the token contract including its negative cases (forged,
  replayed, expired), that the child's argv and cwd are exactly what the preview returned, that
  output streams rather than arriving at the end, that a cancel kills the CLI's *own* child, and
  that a non-zero exit and a failed spawn are distinguishable. Plus the structural one no
  behavioural test can make: preview's import graph contains no `child_process`. Runs execute a
  fake `claude` script in a temp directory, which is what makes any of it fast and deterministic.
- **Byte-identity** (`test/render.test.ts`) — runs the snapshotted legacy renderer as a
  subprocess against a temp project and asserts the rendered `SKILL.md` matches ours byte for
  byte, plus that `maestro.json` keeps its canonical format (2-space indent, **no trailing
  newline**). A drift here means every project that upgrades gets a spurious diff in a committed
  file.
