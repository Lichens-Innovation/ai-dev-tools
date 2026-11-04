# Drop zone: diff from the base pattern

Use this when you want a dedicated zone below the list that accepts items from an external source and appends them at the end. It builds on the base recipe in `SKILL.md`, and pairs with `authorization.md` (same duplicate check, same visual states).

## 1. New hook: `useMyItemDropZone`

Only a drop target (no `draggable`), no closest-edge logic: it always appends at `insertIndex`.

```ts
// use-my-item-drop-zone.ts
import { useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

export function useMyItemDropZone(
  existingItemIds: string[],
  insertIndex: number,
  onAdd: (itemId: string, insertIndex: number) => void
) {
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dropState, setDropState] = useState<DropState>(DROP_STATE.idle);

  useEffect(() => {
    const element = dropZoneRef.current;
    invariant(element);

    return dropTargetForElements({
      element,
      canDrop: ({ source }) => isMyItemDragData(source.data) && source.data.parentId === "",
      onDragEnter({ source }) {
        if (!isMyItemDragData(source.data)) return;
        setDropState(existingItemIds.includes(source.data.id) ? DROP_STATE.unAuthorized : DROP_STATE.over);
      },
      onDragLeave: () => setDropState(DROP_STATE.idle),
      onDrop({ source }) {
        setDropState(DROP_STATE.idle);
        if (!isMyItemDragData(source.data)) return;
        if (existingItemIds.includes(source.data.id)) return; // block duplicates
        onAdd(source.data.id, insertIndex);
      },
    });
  }, [existingItemIds, insertIndex, onAdd]);

  return { dropState, dropZoneRef };
}
```

When several kinds of draggables share the page, `canDrop` must reject the unrelated ones explicitly, before the type-specific check:

```ts
canDrop({ source }) {
  if (isOtherDragData(source.data)) return false;
  if (!isMyItemDragData(source.data)) return false;
  return source.data.parentId === "";
}
```

## 2. List component: render the zone

```diff
 export function MyItemList({ items, onReorder, onAdd }: MyItemListProps) {
   const { instanceId } = useDndMyItemList(items, onReorder);
+  const { dropState, dropZoneRef } = useMyItemDropZone(
+    items.map((i) => i.id),
+    items.length, // append at the end
+    onAdd
+  );

   return (
     <DndContext.Provider value={{ instanceId }}>
       <div>{/* items */}</div>
+      <div
+        ref={dropZoneRef}
+        className={classNames("relative flex justify-center items-center border-2 border-dashed rounded p-4 transition-colors", {
+          "border-transparent": dropState === DROP_STATE.idle,
+          "border-blue-300 text-blue-500": dropState === DROP_STATE.over,
+          "border-red-300 text-red-300": dropState === DROP_STATE.unAuthorized,
+        })}
+      >
+        {dropState !== DROP_STATE.idle && (
+          <DropIndicator
+            appearance={dropState === DROP_STATE.unAuthorized ? "warning" : "default"}
+            edge="top"
+            type="no-terminal"
+          />
+        )}
+        <span>Drop here to add</span>
+      </div>
     </DndContext.Provider>
   );
 }
```

## Visual states

| `dropState` | Border | Meaning |
|---|---|---|
| `DROP_STATE.idle` | transparent | nothing hovering |
| `DROP_STATE.over` | blue dashed | valid item hovering, will be added on drop |
| `DROP_STATE.unAuthorized` | red dashed | item already in the list, drop blocked |

## Combining with authorization

- Item drop targets handle reorder and insertion at a given position.
- The drop zone handles "just add it at the end".

Both use `existingItemIds.includes(id)` to detect duplicates, so the warning states stay consistent.
