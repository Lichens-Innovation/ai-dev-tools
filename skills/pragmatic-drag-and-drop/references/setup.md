# Setup and shared helpers

Do this once per project, the first time drag and drop is added. File paths are examples: follow the project's own folder layout, aliases and naming rules.

## Install

Check `package.json` first; install only what is missing, with the project's package manager.

| Package | Needed for |
|---|---|
| `@atlaskit/pragmatic-drag-and-drop` | core: `draggable`, `dropTargetForElements`, `monitorForElements`, `combine`, `reorder` |
| `@atlaskit/pragmatic-drag-and-drop-hitbox` | closest edge (top/bottom/left/right) of a drop target |
| `@atlaskit/pragmatic-drag-and-drop-react-drop-indicator` | the drop line (`.../box` for boxes, `.../tree-item` for trees) |
| `tiny-invariant` | narrowing `ref.current` inside effects |

No provider and no CSS import is required. It works with React 18 and 19 and with StrictMode.

## Shared helpers

Create these once, then reuse them for every draggable list.

```ts
// drag-state.ts: what a draggable item is doing
export type DragState =
  | { type: "idle" }
  | { type: "dragging" }
  | { type: "preview"; container: HTMLElement }
  | { type: "unAuthorized" };

export const DRAG_STATE = {
  idle: Object.freeze({ type: "idle" }),
  dragging: Object.freeze({ type: "dragging" }),
  unAuthorized: Object.freeze({ type: "unAuthorized" }),
} as const;
```

```ts
// drop-state.ts: what a drop zone is doing
export type DropState = { type: "idle" } | { type: "over" } | { type: "unAuthorized" };

export const DROP_STATE = {
  idle: Object.freeze({ type: "idle" }),
  over: Object.freeze({ type: "over" }),
  unAuthorized: Object.freeze({ type: "unAuthorized" }),
} as const;
```

```ts
// dnd-context.ts: gives every item of one list the same instanceId
import { createContext, useContext } from "react";

export type DndContextValue = { instanceId: symbol };

export const DndContext = createContext<DndContextValue | null>(null);

export function useDndContext(): DndContextValue {
  const value = useContext(DndContext);
  if (!value) throw new Error("useDndContext must be used inside <DndContext.Provider>");
  return value;
}
```

```ts
// dnd-utils.ts
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { reorder } from "@atlaskit/pragmatic-drag-and-drop/reorder";

/** Returns a reordered copy of the list after dropping startIndex onto indexOfTarget. */
export function reorderList<T>(
  list: T[],
  startIndex: number,
  indexOfTarget: number,
  closestEdgeOfTarget: Edge | null,
  axis: "vertical" | "horizontal" = "vertical"
): T[] {
  const finishIndex = getReorderDestinationIndex({ startIndex, indexOfTarget, closestEdgeOfTarget, axis });
  return reorder({ list, startIndex, finishIndex });
}

/** Hides the indicator when hovering the dragged item itself or the edge that touches it (the drop would not move anything). */
export function getVisibleClosestEdge(
  isDraggedItemItself: boolean,
  edge: Edge | null,
  index: number,
  dragIndex: number
): Edge | null {
  if (isDraggedItemItself) return null;
  if (edge === "bottom" && index === dragIndex - 1) return null;
  if (edge === "top" && index === dragIndex + 1) return null;
  return edge;
}
```

For a horizontal list, use `allowedEdges: ["left", "right"]` in the item hook, pass `axis: "horizontal"` to `reorderList`, and compare `"right"`/`"left"` instead of `"bottom"`/`"top"` in `getVisibleClosestEdge`.
