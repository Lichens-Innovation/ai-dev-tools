---
name: rule-view
description: "Explains how the /rules view in ai-tools-manager is built end-to-end: the left rule selectors (on-disk project rules + installable vibe-rules), the center directory tree (rule-tree.tsx), the live afk.yaml preview, how assignments map to the AfkConfigV3 `rules` slice in .claude/afk.json, and how afk-apply-rules.js moves/installs the rule files on save. Use when the user is working inside apps/ai-tools-manager and asks how the rules view works, how rules get assigned to the project root or directory paths, how rule files get moved or installed, how vibe-rules integrate, why a rule isn't showing up, or why a rule assignment isn't reaching the YAML."
---

# Rule View

The `/rules` route (`src/routes/rules.tsx`) is a visual editor for assigning a project's **rules** to scopes — the project root and/or specific directory paths. The user picks which rules to work with (left pane), assigns each to a row of the project's directory tree (center), and watches the resulting `afk.yaml` render live (right pane). On save it persists the **rules slice** of `.claude/afk.json` (v3), and a host-side script then physically **moves or installs** each rule file into its assigned directory.

It is the rules half of the `/afk` config flow — the `/workflows` route owns the other half (workflows + instances), and the two share one `afk.json`. See the `workflow-view` skill for that side.

## Layout

```
┌──────────────────────────── TopNav (top-nav.tsx) ────────────────────────────┐
│ Workflows | Rules        (no workflow selector on this route)          <>  ☀ │
├───────────────┬────────────────────────────────────────────┬────────────────┤
│ Left pane     │ Center — RuleTree                           │ Right —        │
│ (rules.tsx)   │ (rule-tree.tsx)                             │ afk.yaml       │
│               │                                             │ preview        │
│ Available     │   ⊟ (project root)     [chip ×] [chip ×] +  │ (afk-yaml-     │
│  rules:       │   ▸ src               [chip ×]           +  │  preview.tsx)  │
│  [chips]      │   ▸ src/backend       [vibe chip ×]      +  │                │
│               │   ▸ apps               …                 +  │ derived live   │
│ Installable   │                                             │ from config,   │
│ (vibe-rules): │   (rows from getProjectTree)                │ read-only      │
│  [chips]      │                                             │                │
│  [Save rules] │                                             │                │
└───────────────┴────────────────────────────────────────────┴────────────────┘
   280px                          1fr                              460px
```

The grid is `280px 1fr 460px` with the preview open, `280px 1fr` when closed. The `<>` button in TopNav toggles `previewOpen`. The TopNav is shared with `/workflows` but rendered here **without** a `workflowSelector`, so the centered selector is absent.

## Data flow

```
Route loader: Promise.all([                       (src/routes/rules.tsx)
  getAfkConfig(),       → AfkConfigV3 + cwd        (src/utils/agents-framework-kickstarter.ts)
  getProjectTree(),     → TreeNode[]               (src/utils/afk-tree.ts)
  getProjectRules(),    → ProjectRule[]            (src/utils/afk-rules.ts — scans whole tree)
  getVibeRules(),       → string[]                 (src/utils/afk-vibe.ts — `vibe-rules list`)
])
        │
        ▼
RulesPage holds `config: AfkConfigV3` (source of truth for the YAML)
   + `selectedRuleIds: string[]` — seeded from config.rules.map(r => r.id)
   + derived `ruleSource: Record<id, "project"|"vibe-rules">`
        │   left pane edits selectedRuleIds (+ prunes config.rules); tree edits config.rules
        ▼
RuleTree renders the project-root row + one row per tree dir; each row shows the
  assignment for its path and a hover "+" picker to assign a selected rule (one per rule)
        │   onAssign / onUnassign → setConfig (mutates config.rules only)
        ▼
AfkYamlPreview renders afk.yaml from `config` via afkConfigToYaml() (derived, read-only)
        │
        ▼ (Save rules)
submitAfkConfig({ sliceType: "rules", slice: { cwd, rules: config.rules } })
  • merges the rules slice into afk.json (preserves workflows/instances)
  • writes <cwd>/.claude/afk.json AND <cwd>/afk.yaml
  • writes /tmp/result.json → "AFK v3 config data: {JSON}" + verbatim afk.yaml  for the skill
    (with aiToolsAction:"afk-config", sliceType:"rules" so the /ai-tools dispatcher can route it)
        │
        ▼ (host-side, run by the /afk skill — directly, or via the /ai-tools dispatcher loop)
afk-apply-rules.js  → moves project rule files / `vibe-rules load`s installable rules
```

## File-by-file map

| Concern | File |
|---|---|
| Route, both rule selectors, save, assign/unassign handlers | `src/routes/rules.tsx` |
| The directory tree + per-row chips + add-rule picker | `src/components/rule-tree.tsx` |
| Rule chip multi-select (used by both left-pane sections) | `src/components/chip-multi-select.tsx` |
| Top bar — nav links, preview toggle (no workflow selector here) | `src/components/top-nav.tsx` |
| Live afk.yaml render (read-only, shared with /workflows) | `src/components/afk-yaml-preview.tsx` |
| The single afk.yaml serializer (`yaml` package) | `src/utils/afk-yaml.ts` |
| Types + `getAfkConfig` loader + `submitAfkConfig` server fn | `src/utils/agents-framework-kickstarter.ts` |
| Directory tree loader (`getProjectTree`, walkDir) | `src/utils/afk-tree.ts` |
| Project-rule loader (`getProjectRules`, scans every `.claude/rules/`) | `src/utils/afk-rules.ts` |
| Installable-rule loader (`getVibeRules`, `vibe-rules list`) | `src/utils/afk-vibe.ts` |
| Source of project rules | `<cwd>/**/.claude/rules/*.md` |
| **Host-side apply step** (move project files / `vibe-rules load`) | `plugins/ai-tools-manager/scripts/afk-apply-rules.js` |
| vibe-rules pre-compute for Docker (writes `vibeRules` into marketplace JSON) | `plugins/ai-tools-manager/scripts/launch-ai-tools-manager-app.sh` |
| Consuming prompt (writes afk.yaml, renders orchestrator, runs apply step) | `plugins/ai-tools-manager/skills/afk/SKILL.md` (scaffolding lives in `afk-install/SKILL.md`) |

## The data model (the `rules` slice)

The view edits exactly one field of the shared `AfkConfigV3` (`src/utils/agents-framework-kickstarter.ts`):

```ts
AfkConfigV3 { version: 3, …workflow fields…, rules: AfkRuleV3[] }   // only `rules` here

AfkRuleV3 { id, scope?: "project", paths?: string[], source?: "project" | "vibe-rules" }
```

An `AfkRuleV3` is **one assignment of a rule to one location** — not a rule definition, and (post this feature) at most one per rule id:
- **Project-root assignment** → `{ id, scope: "project" }` (no `paths`).
- **Directory assignment** → `{ id, paths: ["<dirPath>/**"] }` (no `scope`).
- **`source`** records where the rule comes from, so the host-side apply step knows what to do:
  - `"project"` — an on-disk `.claude/rules/<file>.md`; the file is **moved** into the assigned directory.
  - `"vibe-rules"` — a rule from the vibe-rules store; **installed** via `vibe-rules load`.

The rule **definitions** are separate shapes, loaded but never written into `afk.json`:

```ts
ProjectRule { id, description, body, dir }       // from <cwd>/**/.claude/rules/<file>.md; `dir` = current location
TreeNode    { path, name, depth }                // a directory, relative to cwd
// vibe-rules: just a string[] of ids from `vibe-rules list`
```

## Left pane — two rule selectors (rules.tsx + chip-multi-select.tsx)

Two `ChipMultiSelect` sections feed one shared `selectedRuleIds` pool:

- **Available rules** — on-disk project rules from `getProjectRules()`. It scans **every** `.claude/rules/` in the tree (not just the root), so a rule already moved into a subdirectory still shows up. Each file is parsed for frontmatter (`id = fm.name || filename`, plus `description`/`body` — currently only `id` is rendered) and tagged `source: "project"`.
- **Installable rules (vibe-rules)** — ids from `getVibeRules()` (`vibe-rules list`). Tagged `source: "vibe-rules"`. These don't exist in the project yet; assigning one installs it on save.

Source bookkeeping:
- `ruleSource: Record<id, "project"|"vibe-rules">` is derived: project ids first, then vibe ids **not already** a project id (a project rule wins a name collision, since it's a real file). The vibe section only lists `vibeOnlyIds` (resolving to `"vibe-rules"`) so a shared name never appears in both sections.
- `setGroupSelection(groupIds, next)` toggles selection within one section while leaving the other's intact, and **prunes `config.rules`** to the still-selected ids — so de-selecting a chip unassigns that rule everywhere.
- `selectedRuleIds` is **seeded** on mount from `config.rules.map(r => r.id)`.

**Save rules** → `handleSubmit` → `submitAfkConfig`. On success the page swaps to a `SuccessState`.

## Center — directory tree (rule-tree.tsx)

`RuleTree` renders a flat, indented list: a synthetic **`(project root)`** row (`dirPath = ""`, `⊟`), then one `TreeRow` per `TreeNode` from `getProjectTree()` (`▸`, indented by `depth * 16 + 8`px). `getProjectTree` (`afk-tree.ts`) walks from `cwd`, **maxDepth 4**, skipping `node_modules`/`.git`/`dist`/`build`/`.next`/`.turbo`/`.output`.

Each `TreeRow`:
- **Computes its own assignment** by filtering `ruleAssignments` (= `config.rules`): root matches `scope === "project" && no paths`; a dir matches `paths` containing `"<dirPath>/**"` or the bare `dirPath`.
- Renders one chip per assignment, tinted by source — **project rules** in the primary color, **vibe-rules** in amber with a tiny `vibe` badge (from `a.source ?? ruleSource[a.id]`). The `×` calls `onUnassign(id)`.
- Shows a hover-revealed `+` that opens an inline `<select>` of selected rules not already on this path; **Add** calls `onAssign`.

**One location per rule.** `handleAssign` (in `rules.tsx`) removes **every** prior assignment of that id before appending the new one (and stamps `source` from `ruleSource`). So a rule assigned to the root and then added to a directory **moves** — the root chip disappears and the directory chip appears. `handleUnassign` filters purely by id. The glob convention `"<dirPath>/**"` is written in `rule-tree.tsx`'s `handleAdd` and read back by `pathAssignments`; the two must stay in lockstep.

## Right pane — afk.yaml preview (afk-yaml-preview.tsx)

Identical component to the `/workflows` preview: a **read-only** `FilePreview` rendering `afkConfigToYaml(config)` (`src/utils/afk-yaml.ts`) at `<cwd>/afk.yaml`. The `rules` block renders each `AfkRuleV3` as `{ id, scope?, paths?, source? }`, omitting empty fields.

## Persistence (submitAfkConfig)

Saving sends only the **rules slice** (`{ cwd, rules }`) with `sliceType: "rules"`. The server fn reads the existing `afk.json`, overwrites **just** `rules` (so the `/workflows` slice survives), writes `.claude/afk.json` + `afk.yaml`, and writes the result file with `additionalContext` = `AFK v3 config data: {…}` **plus the verbatim afk.yaml**. The consuming `/afk` SKILL.md writes those files on the host, re-renders the orchestrator, then runs the apply step below (on a first run, `/afk-install` scaffolds the orchestrator first).

## Runtime — applying placements (afk-apply-rules.js)

`plugins/ai-tools-manager/scripts/afk-apply-rules.js` runs **host-side** after `afk.json` is written (the container can't reach project paths and `vibe-rules` is a host CLI). It reads the `rules` slice and, per assignment:

- **`source: "project"`** → finds the rule's `.claude/rules/<file>.md` by scanning the tree (matching the frontmatter `name`/basename to the id), then **moves** it into `<assignedDir>/.claude/rules/`. If it's already there (e.g. assigned to the root where it lives), it's a no-op (`unchanged`).
- **`source: "vibe-rules"`** → runs `vibe-rules load <id> claude-code -t <assignedDir>/.claude/rules/<id>.md` (creating the parent dir first). vibe-rules **appends** a `<id>…</id>` block, so the script first checks for that tag and **skips** if already present — re-runs don't duplicate.
- **Removed / unassigned rules** → left untouched. The script **never deletes** rule files; cleanup is the user's choice.

It is idempotent and prints a JSON summary: `{ moved, installed, unchanged, skipped, missing, errors }`. The editor token is `claude-code` (not `claude`), and `-t` takes a **file** path.

Under Docker the UI can't call `vibe-rules` itself, so `launch-ai-tools-manager-app.sh` pre-computes `vibe-rules list` on the host into `marketplace-data.json` (`vibeRules`), and `getVibeRules` reads it from there (mirroring `readCwd`).

## Things that bite

- **Save only touches the rules slice.** Don't widen `submitAfkConfig`'s rules branch to write `workflows`/instances — that's the `/workflows` route's slice, and a stray write will clobber it.
- **`rules` entries are assignments, not definitions, and now one-per-id.** `handleAssign` deletes prior assignments of the same id, so the model holds at most one location per rule. Code that assumed multiple assignments per id no longer applies.
- **De-selecting a rule deletes its assignment.** `setGroupSelection` prunes `config.rules` to the selected ids. Unchecking a chip to "hide" a rule removes the path it was assigned to.
- **The move is a real `fs.renameSync` at apply time, not at save time in the app.** The app only records the assignment; nothing moves until `afk-apply-rules.js` runs (via the skill). Editing the app's `submitAfkConfig` won't move files — it can't (Docker/path/CLI). Change the script instead.
- **vibe-rules `load` appends, so installs must be guarded.** The script checks for the `<id>` tag before loading; if you change the target filename or the tag format, re-runs will start duplicating blocks. Re-confirm against `vibe-rules`' actual output (`<id>…</id>` wrapper) if you touch this.
- **The editor token is `claude-code`.** `vibe-rules load <id> claude` errors with "Unsupported rule type: claude". And `-t` is a file path whose parent dir must exist — the script `mkdir -p`s it.
- **`getProjectRules` scans the whole tree (maxDepth 4).** A rule nested deeper than 4 levels, or under an ignored dir, won't appear in the picker even though its assignment may persist in `afk.json`. Same depth/ignore list as the tree walk — keep them consistent.
- **A rule assigned in afk.json but missing from disk is stranded.** `selectedRuleIds` is seeded from `config.rules`, but the chips only render ids the loaders return. If the file was deleted (project) or removed from the store (vibe-rules), the chip can't render, yet the assignment persists until something prunes it — and `afk-apply-rules.js` reports it under `missing`/`errors`.
- **Name collisions resolve to project.** If the same id exists both on disk and in `vibe-rules list`, `ruleSource` calls it `"project"` and the vibe section hides it. The on-disk file is moved; the vibe-rules version is ignored.
- **Re-assigning a vibe-rule leaves the old install behind.** Project rules are *moved* (single file follows the assignment); vibe-rules are *installed* at the assigned path. The config holds one location per rule, but since the apply step never deletes, moving a vibe-rule to a new directory installs a fresh copy there and leaves the previous `.claude/rules/<id>.md` in place — by design (cleanup is the user's call).
- **The YAML pane is derived, not editable.** To change what it shows, change `config` (or the rendering in `afk-yaml-preview.tsx`).
