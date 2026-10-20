# Design studio: Figma-like moving, copying and adding of components in a proposal

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

Editing a proposal in the design studio should feel like moving things in Figma: grab an element, drag it where you want, copy and paste it, and drop in the project's real components. Today GrapesJS's defaults do some of this (move by the toolbar's move icon, Ctrl+C / Ctrl+V, the Add tab), but the Add tab inserts plain unstyled HTML, the drop target is hard to see, and nothing explains it. The style editing stays as it is.

- **Free while dragging, layout on drop.** Grab the selected element itself (not only the toolbar's move icon). It follows the cursor freely, and a marker shows what the drop will become. On release, the studio turns the drop into a layout change the design loop can implement, never into absolute coordinates: between two elements → moved there in the order; into another box → moved into it at that spot; at the far end or the centre of its own row (or column) → the element is pushed there (`margin-left: auto`, or the container's alignment when it is the only child), written as `data-studio` rules like every other edit. No `position: absolute` / top / left is ever written by a drag.
- **Your components in Add.** The Add tab gets a Components section built from the project's captured component references, each with a small preview. Dragging one in inserts its real markup (the project's classes, so it looks right right away) with `data-component="<manifest name>"` on its root. Copies of an element that carries `data-component` keep it. The plain HTML blocks stay, under Elements.
- **Copy, paste, duplicate.** Ctrl+C / Ctrl+V as today, Ctrl+D duplicates in place. The clipboard survives switching pages (kept in the browser per project), so an element can be copied from one proposal into another.
- **Keyboard moves.** Alt+arrows move the selection before or after its siblings. Delete removes, Ctrl+Z / Ctrl+Shift+Z undo and redo.
- **Line-up buttons.** When an element is selected, its container's alignment (start, center, end, space between) can be set from buttons near the selection, for "push this to the right".
- **Layers.** A Layers tab in the side panel shows the element tree, using `data-component` names where present, and allows dragging within the tree with the same layout-on-drop rules.
- **Discoverability.** A short shortcuts hint (a `?` popover) lists the above.

In the design plugin, local-studio.md (and the design contract where it describes proposal overrides) documents `data-component`: an element carrying it is an instance of that manifest component, and `/design-loop` implements it with the component, not new markup. Bump the design plugin's patch version.

The editor's side panel is also changed by the footer-tabs task (006): do this after it.

## Acceptance criteria

- [ ] Dragging a selected element shows a live marker and, on drop, produces only DOM order changes and `data-studio` rules; no absolute positioning is written
- [ ] Dropping a lone button at the right end of its row puts it on the right; dropping between two siblings reorders them
- [ ] The Add tab lists the project's captured components with previews; an inserted one renders with the project's styles and carries `data-component`
- [ ] Ctrl+D duplicates, Alt+arrows reorder, and an element copied in one proposal can be pasted into another
- [ ] The Layers tab shows the tree with component names and supports drag
- [ ] Undo reverts each of the above in one step
- [ ] Tests cover the drop-to-layout resolution (reorder, into a box, push to end and centre) and the `data-component` handling; the studio's test, lint, type check and build pass
- [ ] The studio README and the plugin's local-studio doc describe the editing gestures and `data-component`; the plugin version is bumped

## Blocked by

- `006-design-studio-footer-tabs-with-an-inspect-tab-for-the-selected-element-s-tokens.md`
