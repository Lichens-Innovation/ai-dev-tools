# M4 — The `claude -p` bridge and the create-\* routes

## Context

Four routes did not come across in M2: `/create-skill`, `/create-subagent`, `/create-plugin`,
`/create-marketplace`. They are the only part of the app where an LLM is genuinely required — not
to write files, but to *author a body*: the prose of a `SKILL.md`, an agent's system prompt, a
plugin README.

The deterministic half already exists. `apps/ai-tools-manager/src/utils/scaffold.ts` creates the
directory, frontmatter, skeleton, plugin manifest, and registration, and reports
`{ scaffolded, path, remaining, reason }`. The consuming skills were already rewritten to "finish
only the remaining content when `scaffolded: true`". So the split is done; what is missing is a way
to run the finishing step without switching to a terminal.

The decision on how, taken when this migration was planned:

> Spawn `claude -p` headless, **but ask the user before the spawn and display the prompt that will
> be annexed to the spawned Claude session.** Calling the Anthropic API directly is a future
> version.

That constraint shapes the whole milestone. The bridge is a two-phase operation — *preview*, then
*run* — and preview must be incapable of spawning anything.

---

## Approach

### 1. Port the deterministic scaffold into core

`apps/ai-tools-manager/src/utils/scaffold.ts` → `packages/maestro-core/src/scaffold.ts`, dropping
`mountedProjectPath` (there is no container mount, so the "target outside the mounted repo
degrades to `scaffolded: false`" branch disappears entirely — every path on the host is reachable).

`create-result.ts` does **not** come across. Its entire job was writing the `/tmp/result.json`
envelope with `aiToolsAction` + `hookSpecificOutput` for a hook to read. There is no hook and no
result file; the scaffold functions return their summary directly.

Reuse `text.ts` (`buildDesc`, `firstSentence`, `joinOxford`, `clip`, `titleFromName`) — already
copied into `apps/maestro/src/renderer/src/utils/text.ts` for the previews, so decide one home for
it and import from there rather than keeping two copies.

### 2. Port the four routes

They are the most self-contained work in the migration: `react-hook-form` + `zod`, a split-pane
layout with a live `FilePreview`, and per-route preview components. Nothing SSR-dependent. The only
real change is the submit path — `submit<X>Form` server fn → `window.maestro.create.scaffold<X>()`.

Drop the `target` toggle's marketplace/project *path* ambiguity where it was Docker-specific, but
keep the toggle itself: writing into a marketplace vs. the open project is a real user choice.

Marketplace data (`getMarketplaceData`, `getMarketplaceList`, `getMarketplaceDefaults`) currently
reads the Docker precompute file first. On the host, read `~/.claude/` directly via
`@repo/claude-fs` — `getKnownMarketplaces`, `getLocalMarketplaces`, `getMarketplacePluginsFromPath`
already exist. This deletes the last consumer of `/tmp/ai-tools-marketplace.<key>.json`, which
matters for M5.

### 3. The bridge — preview and run as separate operations

Two IPC channels, deliberately not one:

```
claude:preview  → { prompt, argv, cwd, targets[], available }   // pure; spawns nothing
claude:run      → streams stdout/stderr; requires a token from preview
```

`claude:preview` builds the prompt and returns it. It has no access to `spawn`. `claude:run`
accepts the token `preview` issued and refuses anything else, so a renderer bug cannot invent a
prompt and execute it — the only executable prompts are ones the user was shown.

`available` reports whether `claude` resolves on `PATH`. Note that a GUI app on macOS and Linux
does **not** inherit a login shell's `PATH`; resolve it explicitly rather than trusting
`process.env.PATH`, or the CLI will appear missing on machines where it is installed.

### 4. The confirmation modal

Non-negotiable behaviour, per the decision above:

1. shows the **full prompt text**, scrollable, selectable — not a summary;
2. shows the **exact argv** (`claude -p …`), the working directory, and the files the run may touch;
3. offers **Copy prompt** / **Cancel** / **Run**;
4. spawns only on Run;
5. streams stdout into the modal while running, with a **Stop** that kills the child;
6. when `claude` is unavailable: says so plainly, hides Run, keeps Copy prompt so the user can
   paste it into a session themselves.

Copy-prompt is not a fallback nicety — it is the escape hatch that keeps the app useful without the
CLI, and it must work in every state including mid-failure.

### 5. Where else the bridge gets used

- **M3's repo detection** gains an optional "refine with Claude" that routes through this same
  modal. The heuristic must remain the default and must stand alone.
- **M6's help-server chat tab** already shells out to `claude` for `/super-help`. It should reuse
  this infrastructure rather than growing a second spawn path — one place that spawns a model, one
  confirmation UI.

---

## Critical files

| Concern | Path |
|---|---|
| Scaffold to port | `apps/ai-tools-manager/src/utils/scaffold.ts` |
| Routes to port | `apps/ai-tools-manager/src/routes/create-{skill,subagent,plugin,marketplace}.tsx` |
| Preview components | `apps/ai-tools-manager/src/components/{skill,subagent}-template-preview.tsx`, `{plugin,marketplace}-manifest-preview.tsx` |
| Marketplace loaders to de-Dockerise | `apps/ai-tools-manager/src/utils/marketplace.ts` |
| Result envelope to delete | `apps/ai-tools-manager/src/utils/create-result.ts` |
| Prompts describing the contract | `plugins/ai-tools-manager/skills/create-*/SKILL.md` |
| Shared reference doc | `docs/ai-tools-create-shared.md` |
| Text helpers (pick one home) | `apps/maestro/src/renderer/src/utils/text.ts` |

## Verification

1. **Scaffold without any model.** Fill each of the four forms, submit, confirm the directory,
   frontmatter, manifest, and registration land on disk — and that no process was spawned.
2. **Nothing spawns before Run.** Open the modal, leave it open, `ps` for a `claude` process — none.
   Cancel — still none. This is the security property; assert it in a test against the main-process
   handler, not just by hand.
3. **argv matches what was shown.** Press Run, capture the child's argv, diff against the modal's
   displayed argv. They must be identical, including the prompt.
4. **Missing CLI.** Rename `claude` off `PATH`; confirm the modal reports it, hides Run, and
   Copy prompt still yields the exact prompt.
5. **GUI `PATH`.** Launch the packaged app from a desktop launcher (not a terminal) and confirm the
   CLI is still found — the failure mode this catches does not reproduce from a shell.
6. **Stop works.** Start a run, press Stop, confirm the child is killed and no partial file is left
   in a state the scaffold summary claimed was complete.
7. **The finished artifact is real.** Run one create-skill end to end and confirm the resulting
   `SKILL.md` is a skill Claude Code actually discovers.
