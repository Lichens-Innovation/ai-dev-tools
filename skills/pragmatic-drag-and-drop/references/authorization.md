# Authorization: diff from the base pattern

Use this when items can be dragged into the list from an external source (another list, a palette) and some drops must be blocked, for example duplicates. It shows what to add or change in the base recipe in `SKILL.md`.

An external source is marked in its drag data. Here it is `parentId === ""`; use whatever marker fits the project (a `source: "palette"` field, a different symbol key, and so on).

## 1. Drag data type: add `parentId` and `canDrop`

```diff
 export type MyItemDragData = {
   [myItemDragKey]: true;
   id: string;
   index: number;
   instanceId: symbol;
+  parentId: string; // "" for items from the external source
+  canDrop: boolean;
 };
```

## 2. Item hook: accept existing ids, validate, detect unauthorized

```diff
-export function useDndMyItem(id: string, index: number) {
+export function useDndMyItem(id: string, itemIds: string[], index: number) {
```

Add a helper above the hook:

```ts
function validateCanDrop(sourceData: Record<string | symbol, unknown>, instanceId: symbol): boolean {
  if (!isMyItemDragData(sourceData)) return false;
  const isFromSameList = sourceData.instanceId === instanceId;
  const isFromExternalSource = sourceData.parentId === "";
  return isFromSameList || isFromExternalSource;
}
```

Include the new fields in the drag data, and use the helper in `canDrop`:

```diff
-const data: MyItemDragData = { [myItemDragKey]: true, id, index, instanceId };
+const data: MyItemDragData = { [myItemDragKey]: true, id, index, instanceId, parentId: "list-a", canDrop: true };

 dropTargetForElements({
   element,
-  canDrop: ({ source }) => isMyItemDragData(source.data) && source.data.instanceId === instanceId,
+  canDrop: ({ source }) => validateCanDrop(source.data, instanceId),
```

In `onDragEnter`, flag duplicates before anything else:

```diff
 onDragEnter({ source, self }) {
   if (!isMyItemDragData(source.data)) return;
+
+  const isExternal = source.data.parentId === "";
+  if (isExternal && itemIds.includes(source.data.id)) {
+    setDragState(DRAG_STATE.unAuthorized);
+    return;
+  }
   // ...rest unchanged
 },
```

Add `itemIds` to the effect deps.

## 3. Monitor hook: track the external drag and handle adds

```diff
-export function useDndMyItemList(items: MyItem[], onReorder: (items: MyItem[]) => void) {
+export function useDndMyItemList(
+  items: MyItem[],
+  onReorder: (items: MyItem[]) => void,
+  existingItemIds: string[],
+  onAdd?: (item: ExternalItem, insertIndex: number) => void,
+  externalItems?: ExternalItem[]
+) {
   const [instanceId] = useState(() => Symbol("dnd-my-item-list"));
+  const [dragExternalItemState, setDragExternalItemState] = useState<"idle" | "drag" | "unauthorized">("idle");
```

```diff
 canMonitor({ source }) {
-  return isMyItemDragData(source.data) && source.data.instanceId === instanceId;
+  if (!isMyItemDragData(source.data)) return false;
+  return source.data.instanceId === instanceId || source.data.parentId === "";
 },
+onDragStart({ source }) {
+  if (!isMyItemDragData(source.data) || source.data.parentId !== "") return;
+  setDragExternalItemState(existingItemIds.includes(source.data.id) ? "unauthorized" : "drag");
+},
 onDrop({ location, source }) {
+  setDragExternalItemState("idle");
   const target = location.current.dropTargets[0];
   if (!target) return;
+  if (target.data.instanceId !== instanceId) return; // only drops on this list
   if (!isMyItemDragData(source.data) || !isMyItemDragData(target.data)) return;

-  const closestEdge = extractClosestEdge(target.data);
-  onReorder(reorderList(items, source.data.index, target.data.index, closestEdge));
+  const closestEdge = extractClosestEdge(target.data);
+
+  if (source.data.instanceId === instanceId) {
+    onReorder(reorderList(items, source.data.index, target.data.index, closestEdge));
+    return;
+  }
+
+  const itemToAdd = externalItems?.find((e) => e.id === source.data.id);
+  if (!onAdd || !itemToAdd || existingItemIds.includes(itemToAdd.id)) return;
+  const insertIndex = closestEdge === "bottom" ? target.data.index + 1 : target.data.index;
+  onAdd(itemToAdd, insertIndex);
 },
```

Return the external state: `return { instanceId, dragExternalItemState };`

## 4. Item component: warning indicator

Show the indicator for unauthorized drags even without a closest edge:

```diff
-{closestEdge && <DropIndicator edge={closestEdge} type="no-terminal" />}
+{(closestEdge || dragState === DRAG_STATE.unAuthorized) && (
+  <DropIndicator
+    appearance={dragState === DRAG_STATE.unAuthorized ? "warning" : "default"}
+    edge={closestEdge ?? "bottom"}
+    type="no-terminal"
+  />
+)}
```

## 5. List component: style an add button from the external drag state

```tsx
const { instanceId, dragExternalItemState } = useDndMyItemList(
  items, onReorder, items.map((i) => i.id), onAdd, externalItems
);

<button
  className={classNames("border-2 border-dashed rounded p-2 transition-colors", {
    "border-blue-300 text-blue-500": dragExternalItemState === "drag",
    "border-red-300 text-red-300": dragExternalItemState === "unauthorized",
  })}
>
  Add item
</button>
```

Blue means a valid external item is being dragged and can be dropped here. Red means the item already exists and the drop is blocked.
