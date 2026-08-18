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
- **Byte-identity** (`test/render.test.ts`) — runs the snapshotted legacy renderer as a
  subprocess against a temp project and asserts the rendered `SKILL.md` matches ours byte for
  byte, plus that `maestro.json` keeps its canonical format (2-space indent, **no trailing
  newline**). A drift here means every project that upgrades gets a spurious diff in a committed
  file.
