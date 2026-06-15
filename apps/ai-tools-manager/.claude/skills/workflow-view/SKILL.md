---
name: workflow-view
description: "Explains how the /workflows view in ai-tools-manager is built end-to-end: the React Flow canvas (workflow-canvas.tsx), the left agents/skills pane and top workflow selector, the live afk.yaml preview, and how the diagram maps to the AfkConfigV3 model written to .claude/afk.json. Use when the user is working inside apps/ai-tools-manager and asks how the workflow view/canvas works, how nodes and edges map to afk.yaml, how the success vs condition paths are built, how workflow instances and per-instance skills work, or why a workflow change isn't reaching the YAML."
---

# Workflow View

The `/workflows` route (`src/routes/workflows.tsx`) is a visual editor for a project's agent workflows. The user picks which bundled subagents and project skills to make available (left pane), wires reusable **workflow instances** (agent + skills) into an editable graph (center canvas), and watches the resulting `afk.yaml` render live (right pane). On save it persists the workflow slice of `.claude/afk.json` (v3).

It is the workflow half of the `agents-framework-kickstarter` flow — the `/rules` route owns the other half (rules), and the two share one `afk.json`.

## Layout

```
┌──────────────────────────── TopNav (top-nav.tsx) ───────────────────────────┐
│ Workflows | Rules        ◀ workflow selector (name + ✎ + ＋ + ✕) ▶      <> ☀│
├───────────────┬────────────────────────────────────────────┬────────────────┤
│ Left pane     │ Center — WorkflowCanvas                    │ Right —        │
│ (workflows    │ (workflow-canvas.tsx, @xyflow/react)       │ afk.yaml       │
│  .tsx)        │                                            │ preview        │
│               │   ● Claude Main Session  (synthetic)       │ (afk-yaml-     │
│  Agents ☑     │        │ success (bottom→top)              │  preview.tsx)  │
│   backend     │   ▭ agent node  + skill chips + ⋮          │                │
│   test …      │        ◇ human step (Review)               │ derived live   │
│  ＋ Agent     │        ⋯ condition edges (orange dashed)   │ from config,   │
│               │                                            │ read-only      │
│  Skills ☑     │   [ ＋ Add Agent | ＋ Add condition ] panel │                │
│  ＋ Skill     │                                             │               │
│  [Save]       │                                            │                │
└───────────────┴────────────────────────────────────────────┴────────────────┘
   280px                          1fr                              460px
```

The grid is `280px 1fr 460px` with the preview open, `280px 1fr` when closed (`workflows.tsx`, `gridTemplateColumns`). The `<>` button in TopNav toggles `previewOpen`.

## Data flow

```
Route loader: getAfkConfig()                    (src/utils/agents-framework-kickstarter.ts)
  • reads <cwd>/.claude/afk.json → AfkConfigV3  (or blankV3Config())
  • also returns cwd, bundledAgents, projectSkills
        │
        ▼
WorkflowsPage holds `config: AfkConfigV3` in useState (the single source of truth)
        │   passes slices down as props (incl. workflow_instances + main_session_loaded_skills)
        ▼
WorkflowCanvas mirrors the active workflow into React Flow state (rfNodes/rfEdges)
  • workflowToRfNodes / workflowToRfEdges  on the way in
  • rfNodesToAfkNodes / rfEdgesToAfkEdges  on the way out → onChange(workflow)
        │   every edit calls onChange → updateWorkflow → setConfig
        │   instance + main-session edits go via onInstancesChange / onMainSessionSkillsChange
        ▼
AfkYamlPreview renders afk.yaml from `config` via afkConfigToYaml() (derived, read-only)
        │
        ▼ (Save workflows)
submitAfkConfig({ sliceType: "workflows", slice })
  • merges the workflow slice into existing afk.json (preserves `rules`)
  • writes <cwd>/.claude/afk.json AND <cwd>/afk.yaml (via afkConfigToYaml)
  • writes /tmp/result.json  → "AFK v3 config data: {JSON}" + verbatim afk.yaml  for the skill
```

## File-by-file map

| Concern                                                                  | File                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Route, left pane, save, workflow CRUD                                    | `src/routes/workflows.tsx`                                                 |
| The canvas (React Flow nodes/edges, all interactions)                    | `src/components/workflow-canvas.tsx`                                       |
| Reuse/create instance picker + skill checklist (shared by canvas modals) | `src/components/instance-picker.tsx`, `src/components/skill-checklist.tsx` |
| Top bar — nav links, workflow selector, preview toggle                   | `src/components/top-nav.tsx`                                               |
| Live afk.yaml render (read-only)                                         | `src/components/afk-yaml-preview.tsx`                                      |
| The single afk.yaml serializer (`yaml` package)                          | `src/utils/afk-yaml.ts`                                                    |
| Types + loader + submit server fns                                       | `src/utils/agents-framework-kickstarter.ts`                                |
| Shared `readCwd` + `parseFrontmatter`                                    | `src/utils/afk-fs.ts`                                                      |
| Bundled subagents (source of the Agents list)                            | `plugins/ai-tools-manager/agents/*.md`                                     |
| Project skills (source of the Skills list)                               | `<cwd>/.claude/skills/*/SKILL.md`                                          |
| Consuming prompt (writes afk.yaml)                                       | `plugins/ai-tools-manager/skills/agents-framework-kickstarter/SKILL.md`    |

## The data model (AfkConfigV3)

The whole view edits one object (`src/utils/agents-framework-kickstarter.ts`):

```ts
AfkConfigV3 {
  version: 3
  agents_available: string[]                  // left pane "Agents" checkboxes
  skills_available: string[]                  // left pane "Skills" checkboxes (plain ids)
  main_session_loaded_skills: string[]        // green node's attached skills (replaces main_session)
  workflow_instances: AfkInstanceV3[]         // project-scoped reusable nodes (agent + skills)
  workflows: AfkWorkflowV3[]                   // one per entry in the top selector
  rules: AfkRuleV3[]                           // NOT edited here — owned by /rules
}

AfkInstanceV3 { name, agent, skills: string[] }            // referenced by name from agent nodes
AfkWorkflowV3 { name, nodes: AfkNodeV3[], edges: AfkEdgeV3[] }   // success_path is DERIVED, never stored
AfkNodeV3     { id, type: "agent"|"human_review", instance?, position? }
AfkEdgeV3     { from, to, kind: "success"|"condition", label?, sourceHandle?, targetHandle? }
```

Key points:

- **Instances carry the agent + skills, nodes just reference them.** An agent node's `instance` field (and its `id`, which equals the instance name) points at a `workflow_instances` entry. Skills are stored once per instance, not per node — so the same instance reused across workflows shares one skill list. Editing an instance updates every placement.
- **`main-session` is synthetic.** `workflowToRfNodes` always prepends a non-deletable `main-session` node, and `rfNodesToAfkNodes` filters it back out — so it never appears in `nodes[]`. But `rfEdgesToAfkEdges` does **not** filter edges, so edges _from_ it persist with `from: "main-session"`. It is the implicit entry point every workflow starts from; the success path that reaches the terminal node marks the task complete. Main-session's skills live in `config.main_session_loaded_skills`, not on a node.
- **`success_path` is derived, never stored.** `computeSuccessPath` walks the success edges from `main-session`; `afkConfigToYaml` renders it into afk.yaml for humans, but it is absent from `afk.json`.

## Left pane (workflows.tsx)

- **Agents** checkboxes come from `bundledAgents` — read from `plugins/ai-tools-manager/agents/*.md` frontmatter by `readBundledAgents()`. Toggling edits `config.agents_available`. `＋ Agent` `window.prompt`s for a manual id (for agents not bundled).
- **Skills** checkboxes come from `projectSkills` — read from `<cwd>/.claude/skills/*/SKILL.md` by `readProjectSkills()`. Toggling edits `config.skills_available` (a plain `string[]` of skill ids). `＋ Skill` prompts for a manual id.
- `skills_available` is the menu of skills the canvas can attach to instances and the main session — only a skill checked here can be attached.
- **Save workflows** → `handleSubmit` → `submitAfkConfig`.

## Center canvas (workflow-canvas.tsx)

Built on `@xyflow/react` (React Flow), gated behind a `mounted` flag to dodge SSR. Three node types and two edge types are registered as **module-level constants** (`NODE_TYPES`/`EDGE_TYPES`) so React Flow never remounts nodes.

**Nodes**

- `mainSession` — green rounded card (`w-48 rounded-2xl border-2 border-green-400`), `deletable: false`. Has a `⋮` kebab (Add Skill) in the header and skill chips inside the card body. A bottom-center `+` button (`onAddNext`) opens the "Add step" modal. Handles (`left`, `right`, `bottom`) are fragment siblings of the card div — **not inside it** — so they anchor to the node bounding box, not to the card's flex flow.
- `agentNode` — card showing the instance name (primary) and `@agent` (secondary), skill chips from the referenced instance, side `+` buttons (left/right) for conditions, a bottom-center `+` button (`onAddNext`) for adding the next step, and a `⋮` kebab menu (Edit instance / Delete). Orange normally; **green when it is the success-path terminal** (see `findSuccessTerminalId`).
- `humanStep` — amber diamond rendering "Review" (`human_review`). Wrapped in a `relative` div so the bottom-center `+` button (`onAddNext`) can be absolutely positioned below the diamond.

**Edges**

- `successEdge` — the solid straight path, `bottom → top`. Following it on success is the happy path; reaching the terminal node = task complete.
- `conditionEdge` — orange dashed + animated, drawn from a `left`/`right` handle → `top`, with a label. Used to branch back to an earlier step or off to a secondary path. The label box is always rendered with an inline `✎` edit button — it shows the label text, or a dashed `no label` placeholder when empty — so a missing label can still be filled in (see **Edit condition label**).

**Layout** — `applyDagreLayout` (dagre, `rankdir: "TB"`) runs whenever the workflow's nodes have no saved `position` (including brand-new empty workflows with only the synthetic main-session node). Once positions exist in `afk.json` they're honored, and any drag persists back into each node's `position`.

**`FitViewEffect`** — a small module-level component rendered inside `ReactFlowProvider` that calls `useReactFlow().fitView()` imperatively (50 ms debounce) whenever `workflow.name` changes. This handles viewport re-centering when switching between workflows, since `fitView` as a ReactFlow prop only fires on mount.

**State sync pattern** — `handleNodesChange` and `handleEdgesChange` read latest state via `rfNodesRef`/`rfEdgesRef` (updated each render) instead of using functional updater form. `pushChange` (→ `onChange` → parent `setConfig`) is guarded by two rules:

- **Skip `dimensions` and `select`** — React Flow internal events; pushing them triggers "setState during render" on the parent.
- **Push `position` only on drag-end** (`c.dragging === false`) — pushing on every mousemove would cause `setConfig` → new `workflow` prop → sync effect rebuilds RF state mid-drag → blink. `handleEdgesChange` still pushes on every change (no drag).
- **Echo guard** — `pushChange` stores the emitted `AfkWorkflowV3` object in `lastEmittedRef`. The sync `useEffect` skips re-building RF state when `workflow === lastEmittedRef.current`, preventing the parent's echoed update from resetting the canvas.

### Interactions

- **Add Agent** (bottom Panel bar) — walks the success path from `main-session` to the terminal node (`findSuccessTerminalId`), then opens the Add step modal anchored at the terminal so the new step extends the path.
- **Add step** (bottom `+` on every node) — every node has a bottom-center `+` button that calls `openAddStep(nodeId)`. This opens the **Add step modal**: a segmented **Agent / Human Review** picker. For Agent it renders the shared `InstancePicker` (`src/components/instance-picker.tsx`) — a **Reuse instance / New instance** toggle. Reuse lists unplaced instances; New takes a subagent + instance name + a `SkillChecklist`. Human Review needs no extra input. Confirming calls `confirmAddStep()` → `resolveInstanceFromPicker` to get/create the instance, places the node at `y + 160` below the source, and adds a `success` edge `source.bottom → new.top`. State: `addStepSourceId`, `addStepType`, `addStepPicker`; reset by `resetAddStep()`.
- **Add condition** — two entry points, both opening the condition modal:
  1. Bottom-bar "Add condition" enters `__picking__` mode (crosshair cursor, source `+` buttons pulse); click a node to pick the source.
  2. A node's own left/right `+` button opens the modal for that node directly.
     The modal takes a label and a target — an existing node, or (via the same `InstancePicker`) a reused/new instance to seed a node. Confirm creates a `condition` edge from the source's `right` handle → target `top`.
- **Edit condition label** — every condition edge renders an inline `✎` button beside its label (threaded in via `enrichedEdges`, which injects `onEditLabel` into each `conditionEdge`'s `data`). Clicking opens the edit-label modal (`openEditLabel` → `confirmEditLabel`, state `editLabelEdgeId`/`editLabelValue`); Enter saves, Esc cancels. Saving keeps `e.label` and `data.afkEdge.label` in sync — `rfEdgesToAfkEdges` reads `e.label` first but falls back to `afk.label`, so both must be set, and an emptied label clears both (reverting to the `no label` placeholder).
- **Attach skills per instance** — agent node `⋮` → Edit instance opens a modal with a subagent `<select>` and a `SkillChecklist` (drawn from `availableSkills`). Saving rewrites that `workflow_instances` entry via `onInstancesChange`, so all placements update. The main-session node's `⋮` → Add Skill edits `main_session_loaded_skills` via the same `SkillChecklist`.
- **Edit instance** — agent node `⋮` → Edit instance (see above) is how you change an instance's agent or skills; the node id stays the instance name.
- **Single success edge per node** — `replaceSuccessEdgeFrom` strips any existing outgoing success edge before adding a new one (in `onConnect` and `confirmAddStep`), enforcing one success successor per node.
- **Instance placed once per workflow** — `placedInstanceNames` (memoised from the canvas) gates the reuse list and `resolveInstanceFromPicker`, so an instance can't appear twice in the same diagram.
- **Manual wiring** — `onConnect`: dragging from a `left`/`right` handle makes a condition edge; from `bottom` makes a success edge.
- **Delete** — kebab → Delete removes the node and every incident edge (the instance definition stays in `workflow_instances`).

Each of these computes the next nodes/edges and calls `pushChange` → `onChange` → `setConfig`, so the YAML preview and persisted model stay in lockstep.

## Top selector (top-nav.tsx)

The centered control drives `config.workflows` through a custom dropdown (hand-rolled with an outside-click handler, not a native `<select>`):

- The trigger shows the active workflow name; clicking opens the menu.
- Each menu row switches the active workflow (`onSelect` → `activeWorkflowIdx`) and carries a trailing 🗑 button. Delete does **not** fire immediately — it opens a confirmation modal; only its **Delete** button calls `onRemove(i)` (dismissable via Cancel, backdrop, or Escape).
- **+ Add workflow** is pinned at the bottom of the menu (`onAdd` → `confirmCreateWorkflow` pushes a blank `{ name, nodes: [], edges: [] }`).
- The `✎` pencil beside the trigger renames the active workflow (`renameWorkflow`).

`WorkflowSelectorProps` is unchanged — `onRemove(i)` deletes the clicked row (not necessarily the active one). One workflow is edited at a time.

## Right pane — afk.yaml preview (afk-yaml-preview.tsx)

A **read-only** `FilePreview`. It calls `afkConfigToYaml(config)` (`src/utils/afk-yaml.ts`, backed by the `yaml` package) and splits the result into lines — a derived view, never an editor, and the _exact_ text the skill writes to `afk.yaml`. It shows the _full_ config including `rules` (even though rules are edited on `/rules`) and the derived `success_path` per workflow, at the target path `<cwd>/afk.yaml`. Empty sections render as empty YAML lists.

## Persistence (submitAfkConfig)

Saving sends only the **workflow slice** (`agents_available`, `skills_available`, `main_session_loaded_skills`, `workflow_instances`, `workflows`) with `sliceType: "workflows"`. The server fn reads the existing `afk.json`, overwrites just those fields (so `/rules`' `rules` survive), writes `.claude/afk.json` and `afk.yaml` (via `afkConfigToYaml`), and writes the result file with `additionalContext` containing `AFK v3 config data: {…}` **plus the verbatim afk.yaml text**. The consuming `agents-framework-kickstarter` SKILL.md writes those files on the host and runs `afk-install-orchestrator.js`. The `SubagentStart` hook (`inject-agent-skills.js`) reads `.claude/afk.json` (v3) at each subagent start to inject that instance's skills + condition-edge handoff rules.

## Things that bite

- **The YAML pane is derived, not editable.** To change what it shows, change `config` (or the rendering in `afk-yaml-preview.tsx`) — typing into it is impossible by design.
- **`main-session` lives in edges but not nodes.** Code that consumes `workflows[].edges` must treat `"main-session"` as a valid `from` that has no matching entry in `nodes[]`. Filtering edges by "node exists" will silently drop the entry edge.
- **Skills live on the instance, not the node.** A node only stores `instance` (+ id + position); the agent and skills come from the `workflow_instances` entry. Editing an instance updates every node that references it across all workflows.
- **`success_path` is derived — never write it to `afk.json`.** It's computed by `computeSuccessPath` and only emitted into `afk.yaml`. Persisting it would duplicate state that can drift from the edges.
- **Save only touches the workflow slice.** Don't widen `submitAfkConfig`'s workflow branch to write `rules` — that's the `/rules` route's slice, and a stray write will clobber it.
- **An instance can only hold skills that are checked in the left pane.** The skill checklist lists `availableSkills` (= `skills_available` ids). Unchecking a skill in the left pane after attaching it leaves a dangling id on the instance.
- **`NODE_TYPES`/`EDGE_TYPES` must stay module-level.** Moving them inside the component recreates the maps each render and React Flow remounts every node (loses selection, flickers).
- **Layout auto-runs for any workflow without saved positions** — including empty ones (only main-session). The old guard `nodes.length > 1` was removed; dagre handles single-node graphs correctly.
- **Don't call `pushChange` inside a state updater.** React Flow emits `dimensions` changes during its commit phase (node measurement). If `pushChange` runs inside `setRfNodes(nds => { pushChange(...); return nds })`, it triggers `setConfig` on the parent during render and React warns. Always call `pushChange` outside the setter and skip it for `dimensions`/`select` change types.
- **Register every edge `type` string in `EDGE_TYPES`.** If you create an edge with `type: "successEdge"` but omit it from `EDGE_TYPES`, React Flow warns on every render and falls back to the default edge. Both `successEdge` (solid, `#94a3b8`) and `conditionEdge` (orange dashed) are registered at module level.
- **Don't push position changes mid-drag.** Calling `pushChange` on every `position` change (every mousemove) causes `setConfig` → new `workflow` prop → sync effect rebuilds RF state → canvas blinks. Guard with `c.dragging === false` so positions only propagate on drop.
- **Handles must be siblings of the content div, not children.** Placing handles inside a flex/grid container makes React Flow position them relative to the container's height, causing them to land between elements instead of at the node's edge. Render handles in a `<>` fragment alongside the content `<div>`, as in `AgentNodeComponent` and the current `MainSessionNode`.
- **`@xyflow/react` base CSS must be explicitly imported.** React Flow v12 does not auto-inject styles. Without `import "@xyflow/react/dist/style.css"` nodes collapse to zero size (`.react-flow__node { position: absolute }` is missing). This import lives at the top of `workflow-canvas.tsx`.
