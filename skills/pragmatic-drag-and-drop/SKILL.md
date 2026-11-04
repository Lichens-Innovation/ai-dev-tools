---
name: pragmatic-drag-and-drop
description: Set up @atlaskit/pragmatic-drag-and-drop in a React project and build drag and drop UIs with it. Use when adding drag and drop, making a list reorderable, dragging items between lists, blocking invalid or duplicate drops, adding a drop zone, building a board or grid where items move between cells, or debugging any of these.
---

# Pragmatic Drag & Drop in React

Patterns for `@atlaskit/pragmatic-drag-and-drop`: a small, framework-agnostic library built on native browser drag and drop. It has no React component API; you wire it up with hooks and refs. File paths below are examples: follow the project's own folder layout, aliases and naming rules.

## Setup

Check the project first. If `@atlaskit/pragmatic-drag-and-drop` is not installed, or the shared helpers (`DRAG_STATE`, `DROP_STATE`, `DndContext` / `useDndContext`, `reorderList`, `getVisibleClosestEdge`) do not exist yet, read [`references/setup.md`](references/setup.md): it lists the packages to install and has the code for each helper. The recipes below use those names, so reuse the project's existing helpers when it has them.

## Recipe: reorderable list

Each kind of draggable gets its own drag data type, type guard, monitor hook, item hook and components.

### 1. Drag data type

A symbol key keeps different kinds of drag sources from colliding.

```ts
// my-item-drag-data.ts
export const myItemDragKey = Symbol("my-item");

export type MyItemDragData = {
  [myItemDragKey]: true;
  id: string;
  index: number;
  instanceId: symbol;
};

export function isMyItemDragData(data: Record<string | symbol, unknown>): data is MyItemDragData {
  return data[myItemDragKey] === true;
}
```

### 2. List monitor hook

Watches drags scoped to this list's `instanceId` and applies the reorder on drop.

```ts
// use-dnd-my-item-list.ts
import { useEffect, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

export function useDndMyItemList(items: MyItem[], onReorder: (items: MyItem[]) => void) {
  const [instanceId] = useState(() => Symbol("dnd-my-item-list"));

  useEffect(() => {
    return monitorForElements({
      canMonitor({ source }) {
        return isMyItemDragData(source.data) && source.data.instanceId === instanceId;
      },
      onDrop({ location, source }) {
        const target = location.current.dropTargets[0];
        if (!target) return;

        if (!isMyItemDragData(source.data) || !isMyItemDragData(target.data)) return;

        const closestEdge = extractClosestEdge(target.data);
        onReorder(reorderList(items, source.data.index, target.data.index, closestEdge));
      },
    });
  }, [instanceId, items, onReorder]);

  return { instanceId };
}
```

### 3. Item hook

Makes the drag handle draggable and the whole row a drop target.

```ts
// use-dnd-my-item.ts
import { useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

export function useDndMyItem(id: string, index: number) {
  const { instanceId } = useDndContext();
  const elementRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLSpanElement>(null);

  const [dragState, setDragState] = useState<DragState>(DRAG_STATE.idle);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    const dragHandle = dragHandleRef.current;
    invariant(element);
    invariant(dragHandle);

    const data: MyItemDragData = { [myItemDragKey]: true, id, index, instanceId };

    const updateEdge = (source: { data: Record<string | symbol, unknown>; element: HTMLElement }, self: { data: Record<string | symbol, unknown> }) => {
      const dragIndex = source.data.index;
      if (typeof dragIndex !== "number") return;
      const isDraggedItemItself = source.element === dragHandle;
      setClosestEdge(getVisibleClosestEdge(isDraggedItemItself, extractClosestEdge(self.data), index, dragIndex));
    };

    return combine(
      draggable({
        element: dragHandle,
        getInitialData: () => data,
        onGenerateDragPreview({ nativeSetDragImage }) {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
            render({ container }) {
              setDragState({ type: "preview", container });
            },
          });
        },
        onDragStart: () => setDragState(DRAG_STATE.dragging),
        onDrop: () => setDragState(DRAG_STATE.idle),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => isMyItemDragData(source.data) && source.data.instanceId === instanceId,
        getData: ({ input }) => attachClosestEdge(data, { element, input, allowedEdges: ["top", "bottom"] }),
        onDragEnter: ({ source, self }) => updateEdge(source, self),
        onDrag: ({ source, self }) => updateEdge(source, self),
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      })
    );
  }, [instanceId, id, index]);

  return { dragState, closestEdge, elementRef, dragHandleRef };
}
```

### 4. List component

```tsx
// my-item-list.tsx
type MyItemListProps = { items: MyItem[]; onReorder: (items: MyItem[]) => void };

export function MyItemList({ items, onReorder }: MyItemListProps) {
  const { instanceId } = useDndMyItemList(items, onReorder);

  return (
    <DndContext.Provider value={{ instanceId }}>
      <div>
        {items.map((item, index) => (
          <MyItemRow key={item.id} item={item} index={index} />
        ))}
      </div>
    </DndContext.Provider>
  );
}
```

### 5. Item component and preview

The preview renders in a portal into the container the library hands over during drag. Keep it light.

```tsx
// my-item-row.tsx
import { createPortal } from "react-dom";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";

export function MyItemRow({ item, index }: { item: MyItem; index: number }) {
  const { dragState, closestEdge, elementRef, dragHandleRef } = useDndMyItem(item.id, index);

  return (
    <>
      <div ref={elementRef} style={{ position: "relative", opacity: dragState.type === "dragging" ? 0.7 : 1 }}>
        <span ref={dragHandleRef} style={{ cursor: dragState.type === "dragging" ? "grabbing" : "grab" }} aria-label={`Drag ${item.name}`}>
          ⠿
        </span>
        <span>{item.name}</span>
        {closestEdge && <DropIndicator edge={closestEdge} type="no-terminal" />}
      </div>
      {dragState.type === "preview" ? createPortal(<MyItemPreview item={item} />, dragState.container) : null}
    </>
  );
}

function MyItemPreview({ item }: { item: MyItem }) {
  return <div style={{ padding: "8px 12px", border: "1px solid #ddd", background: "#fff" }}>{item.name}</div>;
}
```

Style with whatever the project uses (Tailwind, CSS modules, a UI library); the inline styles above only keep the example short. `DropIndicator` is absolutely positioned, so the row needs `position: relative`.

## Key patterns

1. **Symbol keys** on drag data prevent collisions between kinds of draggables.
2. **`instanceId`** (from context) isolates several lists on one page.
3. **`combine(draggable(), dropTargetForElements())`** makes an item both a source and a target, with one cleanup function.
4. **Drag handle**: only the handle is `draggable`, so text selection and clicks on the row keep working.
5. **`setCustomNativeDragPreview`** renders a React component as the preview via `createPortal`.
6. **`getVisibleClosestEdge`** avoids showing a drop line that would not move anything.
7. **Monitor in the list, targets in the items.** The monitor decides what the drop means; items only report hover state.
8. **Effect deps matter.** The monitor closes over `items`, so keep them in the deps or you will reorder stale data.

## Extended patterns

- [`references/setup.md`](references/setup.md): packages and shared helpers, needed once per project.
- [`references/authorization.md`](references/authorization.md): items dragged between lists, blocking invalid or duplicate drops, with warning feedback.
- [`references/drop-zone.md`](references/drop-zone.md): a dedicated zone that appends items dragged from elsewhere.
- [`references/board-example.md`](references/board-example.md): a grid or board where pieces move between cells, validated by a `canMove` rule.

Two more cases, without a full recipe:

- **Deferred persistence.** When a reorder must be saved but changes are batched, have the monitor call a store action that reorders locally and queues an operation. A later `sync()` flushes the queue. Last write wins: if an item is reordered several times before the sync, only its final position is sent. Pass `instanceId` in from the parent instead of creating it inside the hook.
- **Drags across React context boundaries.** Two sides that do not share a context (a side panel and a calendar, say) cannot share a `useState(() => Symbol())` instance id. Export a module-level constant instead (`export const PANEL_DND_INSTANCE = Symbol("panel")`), put it in the drag data, and check `source.data.instanceId === PANEL_DND_INSTANCE` in `canDrop`.

## Testing

jsdom does not implement native drag and drop. Test the pure parts (type guards, `reorderList`, `getVisibleClosestEdge`, the callbacks the list receives) directly, and cover the real drag in a browser-level test (Playwright, Cypress) if it matters. Do not try to simulate `dragstart` events in jsdom.
