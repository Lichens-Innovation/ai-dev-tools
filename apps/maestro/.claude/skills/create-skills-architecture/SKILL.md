---
name: create-skills-architecture
description: "Explains how the four create-* flows (create-skill, create-subagent, create-plugin, create-marketplace) work end-to-end: the desktop app's form routes, the deterministic scaffold in @repo/maestro-core, the claude -p confirmation dialog, and the consuming SKILL.md prompts. Use when the user is working inside apps/maestro or plugins/ai-tools-manager and asks how a create flow works, where to add a new field, why a form change isn't reaching the prompt, why the confirmation dialog did or didn't open, or how target=project differs from target=marketplace."
---

# Create-Skills Architecture

Four creation flows share one pipeline: `create-skill`, `create-subagent`, `create-plugin`,
`create-marketplace`. Each is a route in the Maestro desktop app, a scaffold function in
`@repo/maestro-core`, and a `SKILL.md` prompt the app hands to `claude -p`.

## End-to-end pipeline

```
User opens the Maestro desktop app → top bar Create ▾ → Skill
        │
        ▼
src/renderer/src/routes/create-skill.tsx
  • react-hook-form + zod govern state and validation (schema at the top of the route)
  • split pane: form left, live FilePreview right — the file that WILL be generated
  • the preview's description comes from @repo/maestro-core/text's buildDesc, the same
    implementation the scaffold uses, so preview and file cannot disagree
        │ submit
        ▼
utils/create-flow.tsx  — the submit path all four routes share
        │
        ├─1─▶ window.maestro.create.scaffold(request)     IPC `create:scaffold`
        │       → scaffoldSkill/Subagent/Plugin/Marketplace in @repo/maestro-core
        │         writes the directory, the frontmatter, the plugin manifest, the
        │         marketplace registration — everything deterministic
        │       ← { path, name, needsModel, ... }
        │       NO MODEL, and none reachable: the module behind it calls nothing.
        │
        └─2─▶ only when needsModel:
              window.maestro.claude.preview(request)      IPC `claude:preview`
                → builds the prompt (prose, never a slash command), resolves the argv,
                  the cwd, and the files it may write; returns a TOKEN. Spawns nothing.
              ClaudeRunDialog shows the full prompt, exact argv, cwd, targets
                → Copy prompt / Cancel / Run
              window.maestro.claude.run(token)            IPC `claude:run`
                → streams stdout/stderr; `claude:cancel` kills the child's process group
        │
        ▼
The headless run reads plugins/ai-tools-manager/skills/create-<name>/SKILL.md
and finishes only what the scaffold left — authoring a body, enriching a README.
```

**The ordering in 1–2 is the design.** The artifact is on disk before Claude is mentioned, so
cancelling the confirmation — or having no CLI installed at all — still leaves the user with the
thing they asked for. `needsModel` decides whether the dialog opens by itself: an auto-mode body or
a brand-new marketplace's docs need one; a manual-mode skeleton and a plugin manifest are complete
as written. **Finish with Claude** on the result card stays available either way.

There is no hook in this path, no result file, and no blocking wait. `/create-skill` typed into a
session is a different thing entirely: the skill prompt with no payload and nothing pre-scaffolded,
which the SKILL.md handles by gathering the fields conversationally.

## File-by-file map

Renderer paths are relative to `apps/maestro/`.

| Concern | File |
|---|---|
| Form (route): schema, fields, preview, shortcut map | `src/renderer/src/routes/create-<name>.tsx` |
| Shared chrome: layout, header, shortcuts, submit row | `src/renderer/src/components/create-shell.tsx` |
| The scaffold → preview → dialog path, shared by all four | `src/renderer/src/utils/create-flow.tsx` |
| What landed on disk, plus **Finish with Claude** | `src/renderer/src/components/create-result.tsx` |
| The confirmation: prompt, argv, cwd, targets, streamed output | `src/renderer/src/components/claude-run-dialog.tsx` |
| Live file preview components | `src/renderer/src/components/{skill,subagent}-template-preview.tsx`, `{plugin,marketplace}-manifest-preview.tsx` |
| The typed channel contract | `src/shared/ipc.ts` (`create:options`, `create:scaffold`, `claude:preview`, `claude:run`, `claude:cancel`) |
| Main-process handlers | `src/main/ipc.ts` |
| **Deterministic scaffold** + `resolveCreateTarget` | `scaffold.ts` in `packages/maestro-core/` |
| Prompt + argv + cwd construction, and the token | `claude-preview.ts`, `claude-tokens.ts` in `packages/maestro-core/` |
| Spawn, stream, cancel, dispose | `claude-run.ts`, `claude-cli.ts` in `packages/maestro-core/` |
| Marketplace discovery for the selectors | `marketplaces.ts` in `packages/maestro-core/` |
| `buildDesc` and friends — ONE implementation | `text.ts` in `packages/maestro-core/` |
| Shared UI primitives | `packages/ui/src/` |
| Consuming prompt | `plugins/ai-tools-manager/skills/create-<name>/SKILL.md` |
| Shared prompt contract the four SKILL.md link to | `docs/ai-tools-create-shared.md` |

## The four flows compared

| | create-skill | create-subagent | create-plugin | create-marketplace |
|---|---|---|---|---|
| Mode toggle (auto / manual) | yes | yes | no | no |
| Target toggle (marketplace / project) | yes | yes | no | no |
| Chip-array fields | `useWhen` | `triggers`, `tools` | `keywords` | — |
| File generated | `SKILL.md` | `AGENTS.md` or `<name>.md` | `plugin.json` | `marketplace.json` |
| Preview type | YAML frontmatter + markdown | YAML frontmatter + markdown | JSON | JSON |
| Dialog opens on submit | auto mode only | auto mode only | no | yes |

`create-skill` and `create-subagent` are deeply parallel — they share the description-building
algorithm (`buildDesc`: first sentence of the idea + Oxford-joined chips, clipped to 140 chars).

## Mode dispatch (skill & subagent)

- **Auto mode**: the payload carries `idea` and the chip arrays. The scaffold writes the frontmatter
  with the computed description and a placeholder body; the prompt authors the body in place.
- **Manual mode**: the payload carries `description` verbatim (plus chips). The scaffold writes a
  minimal skeleton the user will fill in, and nothing is left for a model — hence no dialog.

## Target dispatch (skill & subagent)

The `target` toggle changes where the file lands:

- `target: "marketplace"` — the payload carries `{ marketplacePath, plugin }`; the file goes to
  `<marketplacePath>/plugins/<plugin>/{skills,agents}/<name>/…`.
- `target: "project"` — the file goes to `<projectRoot>/.claude/skills/<name>/SKILL.md` (skill) or
  `<projectRoot>/.claude/agents/<name>.md` (subagent — single file, no enclosing directory).

The toggle survived the container's retirement; only its Docker half did not. Marketplace vs.
project is a real choice about where a skill lives. What went is the *path ambiguity* that existed
only because the container could not write outside its mount — there is no longer any target the
app can see but cannot reach.

## Common edits — where to make them

| Want to… | Edit |
|---|---|
| Add a field to a form | the route's zod schema **and** `scaffold.ts` **and** the prompt builder in `claude-preview.ts` **and** the matching `SKILL.md` — all four must agree on the payload shape |
| Change validation rules | the zod schema at the top of the route |
| Change the live preview | the `<name>-preview.tsx` component |
| Change the description algorithm | `text.ts` in `@repo/maestro-core` — affects skill & subagent, preview and file, at once |
| Change keyboard shortcuts | the route's `SHORTCUT_SECTIONS` and `create-shell.tsx` |
| Add a new shared UI primitive | new file in `packages/ui/src/`, then an export in `packages/ui/package.json` |
| Add a new create-* flow | new route + a `scaffold*` function + a preview builder + a `SKILL.md`; wire it into the Create menu in `top-nav.tsx` |

## Things that bite

- **Don't change the payload in just one place.** A field rename must hit the form schema, the
  scaffold, the prompt builder, *and* the consuming `SKILL.md` — otherwise data silently drops.
- **Preview and scaffold must resolve the same path.** Both go through `resolveCreateTarget` in
  `@repo/maestro-core`, and the confirmation dialog names the file it returns. A second resolution
  anywhere — a path computed in the renderer, a `path.join` inlined into a prompt builder — makes the
  modal describe a file other than the one on disk, and the user is consenting to the wrong thing.
  `test/create-preview.test.ts` and `test/scaffold.test.ts` in that package compare the two.
- **The renderer's `utils/text.ts` re-exports and must never implement.** `buildDesc` decides the
  `description:` frontmatter; the form's preview shows it before the file exists and the node-side
  scaffold writes it after. Two implementations means a preview that silently stops matching the
  file, and it looks fine right up until someone edits one of them. Import the **subpath**
  (`@repo/maestro-core/text`) — the barrel re-exports `fs`. `test/isolation.test.ts` fails on a
  re-implementation anywhere under `src/renderer`.
- **The prompt is prose, never `/create-skill`.** A slash command in a headless run would re-enter
  the skill from the top instead of finishing the scaffold — and historically it fired the plugin's
  `UserPromptExpansion` hook, which launched the Docker app and blocked forever on a form submission
  that could never arrive. That hook is gone, but the rule stands: inline the instructions. A test
  asserts no create prompt contains a slash command.
- **`claude:run` takes a token and nothing else.** The bridge's guarantee — the only executable
  prompts are ones the user was shown — comes from the run channel having no argument that could
  describe a different run. A preload that "helpfully" forwarded the prompt or argv alongside the
  token reopens that in a diff that reads as a convenience, and every test in `@repo/maestro-core`
  still passes, because none of them can see that side of the wire. `test/isolation.test.ts` pins
  the call to `invoke(IPC.claudeRun, token)`.
- **A create-\* run's working directory is not always the open project.** A skill written into a
  marketplace repo, or a brand-new marketplace, lives outside it — and a headless run whose edits
  are all outside its cwd gets none of them auto-accepted by `--permission-mode acceptEdits`, with
  nobody to ask. `claude-preview.ts` derives the cwd from the same resolution that chose the path,
  and the dialog shows it.
- **Preview tokens are dropped on a project switch.** A token names the outgoing project's cwd, so a
  modal left open across a switch would otherwise still have a live token and **Run** would spawn
  Claude against the repo the window has moved off.
- **A cancelled run's child is detached, so quitting must kill it.** The child is spawned into its
  own process group — that is how Stop reaches the CLI's own children — which also means it outlives
  the app. `disposeIpc` calls `disposeClaudeRuns()`.
- **Scaffold can still fail.** A bad path or a refused overwrite yields `scaffolded: false` with a
  `reason`, and the consuming skill must create the artifact itself. Always branch on the `scaffold`
  object; never assume the file exists.
