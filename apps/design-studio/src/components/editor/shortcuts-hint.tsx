import { useEffect, useRef, useState } from 'react'

export const SHORTCUTS: [string, string][] = [
  ['Drag the selected element', 'Move it freely; the marker shows the drop'],
  ['Drop between / into', 'Reorder, or move into another box'],
  ['Drop at the far end / centre', 'Push it there (margin auto)'],
  ['Line-up buttons', 'Start, centre, end or space between, from the toolbar'],
  ['Ctrl+C / Ctrl+V', 'Copy and paste, also into another proposal'],
  ['Ctrl+D', 'Duplicate in place'],
  ['Alt+Arrows', 'Move before or after its siblings'],
  ['Delete', 'Remove the selection'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo and redo'],
  ['Esc (while dragging)', 'Cancel the drag'],
]

/** A `?` button with the editing gestures in a popover. */
export function ShortcutsHint() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !box.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Editing shortcuts"
        aria-expanded={open}
        title="Editing shortcuts"
        onClick={() => setOpen((o) => !o)}
        className="m-1 h-6 w-6 cursor-pointer rounded-full border border-(--line) text-xs font-semibold hover:bg-(--bg-2)"
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Editing shortcuts"
          className="absolute right-1 top-8 z-30 w-72 rounded-md border border-(--line) bg-(--bg-elev) p-3 text-xs shadow-lg"
        >
          <dl className="grid gap-2">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys}>
                <dt className="font-medium">{keys}</dt>
                <dd className="text-(--ink-3)">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
