import { useEffect, useReducer, useRef, useState } from 'react'
import type { Component, Editor } from 'grapesjs'
import { acceptsChildren, treeDrop } from '#/editor/drop'
import { layerLabel } from '#/editor/component-ref'
import { descendantOrSelf, kids, performDrop } from '#/editor/gestures'

type Where = 'before' | 'after' | 'into'

function labelOf(editor: Editor, comp: Component): string {
  if (comp === editor.getWrapper()) return 'Page'
  const only = comp.components().length === 1 ? comp.components().at(0) : null
  return layerLabel({
    tag: String(comp.get('tagName') || 'div'),
    attributes: comp.getAttributes(),
    text: only?.is('textnode') ? String(only.get('content') ?? '') : undefined,
  })
}

/**
 * The element tree of the page, named by `data-component` where an element has one. Rows select; dragging a row moves
 * the element above, below or into another with the same drop rules as the canvas (order, no coordinates).
 */
export function LayersPanel({ editor }: { editor: Editor }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const dragging = useRef<Component | null>(null)
  const [over, setOver] = useState<{ comp: Component; where: Where } | null>(
    null,
  )

  useEffect(() => {
    let frame = 0
    const bump = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(refresh)
    }
    const events =
      'component:add component:remove component:update component:selected component:toggled update'
    editor.on(events, bump)
    return () => {
      cancelAnimationFrame(frame)
      editor.off(events, bump)
    }
  }, [editor])

  const where = (e: React.DragEvent<HTMLElement>, comp: Component): Where => {
    const box = e.currentTarget.getBoundingClientRect()
    const tag = String(comp.get('tagName') || 'div')
    return treeDrop(
      (e.clientY - box.top) / Math.max(box.height, 1),
      acceptsChildren(tag),
    )
  }

  const drop = (comp: Component, at: Where) => {
    const from = dragging.current
    dragging.current = null
    setOver(null)
    if (!from) return
    const parent = at === 'into' ? comp : comp.parent()
    if (!parent || descendantOrSelf(from, parent)) return
    const others = kids(parent).filter((k) => k !== from)
    const index =
      at === 'into'
        ? others.length
        : others.indexOf(comp) + (at === 'after' ? 1 : 0)
    performDrop(
      from,
      parent,
      { kind: 'between', level: 0, index },
      { axis: 'y', flex: false },
    )
    editor.select(from)
  }

  const selected = editor.getSelected()
  const row = (comp: Component, depth: number): React.ReactNode => {
    const isRoot = comp === editor.getWrapper()
    const children = kids(comp)
    const mark = over?.comp === comp ? over.where : null
    const name = comp.getAttributes()['data-component'] as string | undefined
    return (
      <li key={comp.cid}>
        <div
          draggable={!isRoot}
          onDragStart={(e) => {
            dragging.current = comp
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            dragging.current = null
            setOver(null)
          }}
          onDragOver={(e) => {
            const from = dragging.current
            if (!from || descendantOrSelf(from, comp)) return
            e.preventDefault()
            const next = where(e, comp)
            // The page itself has no "before" or "after".
            setOver({ comp, where: isRoot ? 'into' : next })
          }}
          onDrop={(e) => {
            e.preventDefault()
            drop(comp, isRoot ? 'into' : where(e, comp))
          }}
          onClick={() => editor.select(comp)}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={`relative flex cursor-pointer items-center gap-1 py-1 pr-2 text-xs hover:bg-(--bg-2) ${
            selected === comp ? 'bg-(--bg-2) font-medium text-(--primary)' : ''
          } ${mark === 'into' ? 'outline outline-2 -outline-offset-2 outline-(--primary)' : ''} ${
            mark === 'before'
              ? 'shadow-[inset_0_2px_0_var(--primary)]'
              : mark === 'after'
                ? 'shadow-[inset_0_-2px_0_var(--primary)]'
                : ''
          }`}
        >
          <span className={name ? 'text-(--primary)' : ''}>
            {labelOf(editor, comp)}
          </span>
          {name && (
            <span className="rounded bg-(--bg-2) px-1 text-[10px] text-(--ink-3)">
              component
            </span>
          )}
        </div>
        {children.length > 0 && (
          <ul>{children.map((k) => row(k, depth + 1))}</ul>
        )}
      </li>
    )
  }

  const wrapper = editor.getWrapper()
  return (
    <ul className="py-1" aria-label="Layers">
      {wrapper && row(wrapper, 0)}
    </ul>
  )
}
