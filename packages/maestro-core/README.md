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
- **Byte-identity** (`test/render.test.ts`) — runs the snapshotted legacy renderer as a
  subprocess against a temp project and asserts the rendered `SKILL.md` matches ours byte for
  byte, plus that `maestro.json` keeps its canonical format (2-space indent, **no trailing
  newline**). A drift here means every project that upgrades gets a spurious diff in a committed
  file.
