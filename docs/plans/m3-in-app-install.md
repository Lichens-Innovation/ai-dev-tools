# M3 — In-app install / update / uninstall

## Context

Right now the desktop app can edit a project's Maestro config but cannot *install* Maestro into a
project. `saveConfig` already degrades gracefully — a project with no orchestrator skill saves the
config and returns a `"maestro/SKILL.md not found"` warning — but the only way to fix that is to
run `/maestro-install` from a Claude session.

The installer is pure node (`plugins/ai-tools-manager/scripts/maestro-install.js`, 214 lines: copy
a template, sync managed regions, copy scripts, merge a hook into `settings.json`, add a gitignore
section). Only one step of `/maestro-install` needs a model at all — "analyze the repo to pick the
implementation agents" — and that is a seeding hint, not a correctness requirement.

There is a second prize here. The `updating-maestro` skill exists to warn about a real trap: the
marketplace caches the plugin per `plugin.json` version, so any edit to `hooks/`, `scripts/`, or
`templates/` that ships without a version bump is **invisible to every installed project**. Skills
still resolve from the stale cache, but hooks and scripts don't exist there. If the desktop app
installs hooks into the *project's* `.claude/settings.json` pointing at *project-local* script
copies, that failure mode stops existing — and "update the hooks in this project" becomes a button
that re-copies files.

**Outcome:** open a project with no `.claude/`, click Install, and get a fully wired Maestro
without a Claude session — plus a visible "scripts out of date" badge when the app ships newer
runtime scripts than the project has.

---

## Approach

### 1. Port the installer into core — `install.ts`

Port `maestro-install.js` to `packages/maestro-core/src/install.ts`, reusing `syncManagedRegions`
and `replaceRegion` from `skill-regions.ts` (already ported in M1). Behaviour is unchanged:

| Step | Behaviour to preserve exactly |
|---|---|
| Orchestrator skill | absent → copy whole; has markers → re-sync `STEPS`/`PRINCIPLES`, preserve the rendered `HANDOFFS` body; no markers → back up to `SKILL.md.bak`, write template, report `action: "migrated"` |
| Runtime scripts | copy into `<project>/.claude/scripts/` (always refreshed) |
| `settings.json` | merge, never clobber other keys or other users' hooks |
| `.gitignore` | the `# Maestro` section with `**/.claude/maestro_session*.{json,jsonl}` globs |

The four `action` values (`installed` / `synced` / `unchanged` / `migrated`) are load-bearing —
the skills surface `migrated` to offer re-applying prose from the `.bak`, and the app must too.

Differential test against the snapshotted original, same pattern as
`test/save.test.ts`'s apply-rules test: run both against fresh temp projects, diff the resulting
trees byte for byte.

### 2. Extend it — register the runtime hooks project-locally

Today `maestro-install.js` only merges the `bash-validation.sh` PreToolUse hook into the project;
`SubagentStart`, `PreToolUse` logging, `PostToolUse`, and `SessionEnd` come from the **plugin's**
`hooks/hooks.json` via `${CLAUDE_PLUGIN_ROOT}`. Extend the installer to also register those four in
the project's `.claude/settings.json`, pointing at `$CLAUDE_PROJECT_DIR/.claude/scripts/…`.

This is the change that retires the marketplace-cache trap. It needs care:

- **Idempotency**: re-running must not duplicate matchers. Key on the script basename.
- **Coexistence**: a project that *also* has the plugin installed would run each hook twice.
  Detect that (plugin hooks reference `${CLAUDE_PLUGIN_ROOT}`) and either skip registration or
  offer to remove the plugin's. Decide this explicitly — double-logging every tool call is a
  visible bug, and double-injecting skills into a subagent is a subtle one.
- `maestro-uninstall.js` must learn to remove them, or uninstall silently leaves the project
  running hooks that point at deleted scripts.

### 3. Staleness detection

Hash each script the app would install and compare against the project's copy. Surface as
`InstallStatus.scriptsOutOfDate: string[]`. `InstallStatus` already exists in `shared/ipc.ts` with
`orchestratorSkill` / `scriptsDir` / `configFile`; extend it rather than adding a channel.

### 4. Repo detection replaces the hardcoded seed

`main/ipc.ts` currently seeds with `defaultV3Config(["backend"])`. Replace with a heuristic in
`packages/maestro-core/src/detect.ts`:

- workspace globs / `apps/` / `packages/` layout,
- `package.json` dependencies (react, next, vue, svelte → frontend; express, fastify, nest, prisma
  → backend; both → `["backend", "frontend"]`),
- non-JS markers (`pyproject.toml`, `go.mod`, `Cargo.toml`, `*.csproj`) → backend,
- fallback `["backend"]`.

Return `{ implAgents, evidence: string[] }` so the UI can show *why* — "detected `react` and
`express` in package.json" — rather than an unexplained choice the user has to trust. An **optional**
LLM refine is deferred to M4's confirmation modal; the heuristic must stand alone.

### 5. Uninstall

Port `maestro-uninstall.js`. Preserve the two-level contract: default removes hooks + session
files and **keeps `maestro.json`**; `--purge` also removes the orchestrator skill, copied scripts,
and the config. In the UI, purge must be a separate, clearly-labelled destructive action behind a
confirmation naming the files it will delete.

### 6. UI

A new `/install` route (or a panel on `/`, reachable when a project is open):

- status: orchestrator skill / scripts / config / hooks registered, each with a check or cross;
- detected impl agents with the evidence line, editable before install;
- **Install** / **Update scripts** / **Uninstall** actions;
- the `migrated` case surfaced with the `.bak` path and an offer to open it;
- a "scripts out of date" badge, also shown in `TopNav` so it is visible from any route.

New IPC: `install:run`, `install:uninstall`, `install:detect`. `install:status` already exists.

---

## Critical files

| Concern | Path |
|---|---|
| Installer to port + extend | `plugins/ai-tools-manager/scripts/maestro-install.js` |
| Uninstaller to port | `plugins/ai-tools-manager/scripts/maestro-uninstall.js` |
| Region helpers to reuse | `packages/maestro-core/src/skill-regions.ts` |
| Template being installed | `plugins/ai-tools-manager/templates/maestro/SKILL.md` |
| Hook definitions to mirror | `plugins/ai-tools-manager/hooks/hooks.json` |
| Status handler to extend | `apps/maestro/src/main/ipc.ts` (`IPC.installStatus`) |
| Hardcoded seed to replace | `apps/maestro/src/main/ipc.ts` (`defaultV3Config(["backend"])`) |
| Contract to extend | `apps/maestro/src/shared/ipc.ts` (`InstallStatus`) |

## Verification

1. **Differential install.** Fresh temp project → run the ported installer and the snapshotted
   original into two copies → the trees must be byte-identical (`settings.json`, `.gitignore`,
   `.claude/scripts/`, `.claude/skills/maestro/SKILL.md`).
2. **Idempotency.** Install twice; second run reports `unchanged` and produces no diff. Register
   hooks twice; `settings.json` gains no duplicate matcher.
3. **Migration path.** Seed a project with a pre-managed-regions `SKILL.md`; confirm `.bak` is
   written, `action: "migrated"` is reported, and the UI surfaces it.
4. **End-to-end, no Claude.** Empty directory → Install → Save a workflow → confirm
   `maestro.json`, a rendered `HANDOFFS` table, `.claude/scripts/`, and hook entries all exist.
5. **The hooks actually fire.** Run a real Claude Code session in that project and confirm
   `maestro_session.log.jsonl` fills and the SubagentStart injection lands — proving project-local
   registration is equivalent to the plugin's. This is the step that validates the whole premise;
   do not skip it.
6. **Double-registration.** In a project that *also* has the plugin installed, confirm the decided
   behaviour (skip or offer removal) and that no tool call is logged twice.
7. **Uninstall.** Default leaves `maestro.json`; `--purge` removes everything the install created
   and nothing else.
