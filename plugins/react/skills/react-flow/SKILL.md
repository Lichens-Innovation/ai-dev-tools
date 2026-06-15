---
name: react-flow
description: "Setup and usage guide for @xyflow/react (React Flow v12) in a Vite/ESM project. Use when adding React Flow to a project, debugging invisible nodes, wiring custom node types, handling state sync between React Flow and parent components, or building interactive graph canvases."
---

# React Flow (@xyflow/react v12)

Reference for setting up and correctly using React Flow in a Vite/ESM environment. Covers the non-obvious gotchas that cause invisible nodes, broken layouts, and React warnings.

## Setup checklist

```bash
yarn add @xyflow/react dagre
```

**Three imports required — all three, every time:**

```ts
import { ReactFlow, ReactFlowProvider, Background, Controls, ... } from "@xyflow/react";
import "@xyflow/react/dist/style.css";   // ← mandatory; nodes are invisible without it
import dagre from "dagre";               // ← ESM static import; never require()
```

`style.css` contains `.react-flow__node { position: absolute }` and the handle/controls rules. Without it every node collapses to zero size — the Background dots, Panel, and attribution still render, making it look like a partial load rather than a missing import.

`dagre` must be a top-level ESM import. `require("dagre")` works in Node/Docker but throws `ReferenceError: require is not defined` in Vite's ESM environment.

## Minimal working canvas

```tsx
import { ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Node components must be module-level constants ──────────────────
// If defined inside the parent component they are recreated each render
// and React Flow remounts every node (selection lost, flicker).

function MyNode({ data }: NodeProps & { data: { label: string } }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <div className="px-3 py-2 rounded border bg-white shadow-sm text-sm">
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

const NODE_TYPES = { myNode: MyNode };  // module-level — never recreated

export default function Canvas() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: "1", type: "myNode", position: { x: 0, y: 0 }, data: { label: "Hello" } },
  ]);
  const [edges, setEdges] = useState<Edge[]>([]);

  return (
    <div style={{ width: "100%", height: 500 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
          onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
```

## Handle placement rule

Handles must be **siblings** of the content div inside a `<>` fragment — never children of a flex/grid container. React Flow positions handles relative to the node's bounding box; if they're inside a flex container, they anchor to the container's height instead of the node edge and land between elements.

```tsx
// ✅ Correct — handles are fragment siblings
function GoodNode() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" style={{ top: "50%" }} />
      <div className="w-40 rounded border bg-white px-3 py-2">content</div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

// ❌ Wrong — handles inside flex column split the node visually
function BadNode() {
  return (
    <div className="flex flex-col gap-2">
      <Handle type="source" position={Position.Left} id="left" />  {/* lands mid-column */}
      <div>content</div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
```

For custom buttons that overlap a handle (e.g. a `+` button at the node's bottom center), position the button **inside a `relative` wrapper** at `bottom: -10, left: 50%, transform: translateX(-50%)` with `z-10`. The Handle (React Flow's drag target) and the button coexist at the same spot; `z-10` keeps the button on top.

```tsx
function NodeWithAddButton({ data }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <div className="relative w-40 rounded border bg-white px-3 py-2">
        content
        <button
          type="button"
          style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)" }}
          className="w-5 h-5 rounded-full border-2 z-10 ..."
          onClick={(e) => { e.stopPropagation(); data.onAddNext?.(); }}
        >+</button>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}
```

## State sync with a parent component

React Flow calls `onNodesChange` during its own commit phase (node dimension measurement). If you call parent `setState` synchronously inside a `setNodes` functional updater it triggers React's "Cannot update a component while rendering a different component" warning.

**Pattern: use refs + skip internal change types**

```tsx
export default function Canvas({ onChange }: { onChange: (nodes: Node[], edges: Edge[]) => void }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // Refs hold latest state so callbacks never go stale without needing deps
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, nodesRef.current);
    setNodes(next);
    // `dimensions` = RF measuring node size (commit phase) — skip to avoid warning
    // `select`     = selection state — local to RF, no need to bubble up
    const isStructural = changes.some((c) => c.type !== "dimensions" && c.type !== "select");
    if (isStructural) onChange(next, edgesRef.current);
  }, [onChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const next = applyEdgeChanges(changes, edgesRef.current);
    setEdges(next);
    onChange(nodesRef.current, next);
  }, [onChange]);

  // ...
}
```

## Auto-layout with dagre

```ts
import dagre from "dagre";  // ESM import — not require()

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  // Use fixed dimensions matching your node's rendered size
  for (const n of nodes) g.setNode(n.id, { width: 180, height: 60 });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    // dagre gives center coords; RF expects top-left
    return { ...n, position: { x: pos.x - 90, y: pos.y - 30 } };
  });
}

// Run only when nodes have no saved position (first load / new graph)
// Works correctly with a single node — no need to guard on nodes.length > 1
const hasPositions = nodes.length > 0 && nodes.every((n) => n.position != null);
if (!hasPositions) nodes = applyDagreLayout(nodes, edges);
```

## Imperative fitView when content changes

`fitView` as a ReactFlow prop only fires on mount. To re-center after switching the active graph or adding nodes, call it imperatively via `useReactFlow` — which must be used inside a child of `ReactFlowProvider`.

```tsx
// Module-level helper component (stable reference)
function FitViewEffect({ key }: { key: string }) {
  const { fitView } = useReactFlow();
  const prevRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (key !== prevRef.current) {
      prevRef.current = key;
      setTimeout(() => fitView({ padding: 0.4 }), 50); // wait for nodes to be measured
    }
  }, [key, fitView]);
  return null;
}

// Inside your canvas component, inside ReactFlowProvider:
<ReactFlowProvider>
  <FitViewEffect key={activeGraph.id} />
  <ReactFlow ...>
    ...
  </ReactFlow>
</ReactFlowProvider>
```

The 50 ms delay lets React Flow measure node dimensions before `fitView` calculates bounds.

## Custom edge types

```tsx
function MyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "#f97316", strokeWidth: 1.5 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 border border-orange-300 nodrag nopan"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const EDGE_TYPES = { myEdge: MyEdge };  // module-level
```

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Canvas is blank — dots and panel render but no nodes | Missing `import "@xyflow/react/dist/style.css"` | Add the import to the file that renders `<ReactFlow>` |
| `ReferenceError: require is not defined` | `require("dagre")` in Vite/ESM | Use `import dagre from "dagre"` at the top of the file |
| Handles land between node elements, node looks split | Handles inside a flex/grid container | Move handles outside as `<>` fragment siblings |
| "Cannot update a component while rendering" warning | `onChange` (parent setState) called inside `setNodes` updater | Use refs + call `onChange` outside the setter; skip `dimensions`/`select` changes |
| `fitView` doesn't re-center when switching graphs | `fitView` prop only fires on mount | Use `FitViewEffect` with `useReactFlow().fitView()` imperatively |
| Every node flickers / loses selection on state change | `NODE_TYPES`/`EDGE_TYPES` defined inside the component | Move them to module level as `const` |
| Single-node graph not laid out by dagre | Guard `nodes.length > 1` before calling layout | Remove the guard — dagre handles single nodes correctly |
| `Edge type "X" not found. Using fallback type "default"` | Edge created with `type: "myEdge"` but `EDGE_TYPES` doesn't include `myEdge` | Register every type string you assign to edges in the `EDGE_TYPES` constant |
| Canvas blinks / nodes jump while dragging | `onNodesChange` → parent `setState` → new prop → sync effect rebuilds RF state mid-drag | (a) Store emitted object in a ref; skip sync effect when `workflow === lastEmittedRef.current`. (b) Only call `pushChange` for `position` changes when `c.dragging === false` (drag-end), not every mousemove |
