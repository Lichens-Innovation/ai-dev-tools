import type { Component, CssRule, Editor } from 'grapesjs'
import { readClip, remapIds, writeClip } from './clipboard'
import type { Clip } from './clipboard'
import {
  acceptsChildren,
  alignStyle,
  axisOf,
  dropStyle,
  flexStyle,
  markerFor,
  resolveDrop,
  siblingMove,
} from './drop'
import type { Alignment, Drop, Level, Rect, Style } from './drop'

/**
 * How a proposal is moved about, Figma-like: the selected element follows the cursor freely and a marker says what the
 * drop becomes; copy, paste, duplicate and Alt+arrows; line-up buttons on the toolbar. Every gesture is one
 * synchronous change of the editor, so one undo reverts it (GrapesJS fuses what happens in one tick).
 */

type WithView = HTMLElement & { __gjsv?: { model?: Component } }
export const componentOf = (el: Element | null): Component | undefined =>
  (el as WithView | null)?.__gjsv?.model

const DRAG_THRESHOLD = 4
const COLOR = '#7c3aed'

const isText = (c: Component) => c.is('textnode')
/** The children a component has as elements (text nodes and the like are not places to drop). */
export const kids = (c: Component) =>
  c.components().filter((k: Component) => !isText(k))

export function descendantOrSelf(of: Component, c: Component | undefined) {
  for (let at = c; at; at = at.parent()) if (at === of) return true
  return false
}

/** Moves a component to place `index` among its new parent's children, not counting the component itself. */
export function moveComponent(comp: Component, to: Component, index: number) {
  const before = kids(to)
    .filter((m) => m !== comp)
    .at(index)
  comp.remove({ temporary: true })
  // `at` counts all children, text nodes included.
  const at = before ? to.components().indexOf(before) : to.components().length
  to.components().add(comp, { at })
}

/** Writes a style without the properties set to '' that hold `auto` (a push this move undoes). */
function writeElementStyle(comp: Component, style: Style) {
  const before = comp.getStyle() as Record<string, string>
  const next = { ...before }
  for (const [prop, value] of Object.entries(style)) {
    if (value === '') {
      if (next[prop] === 'auto') delete next[prop]
    } else next[prop] = value
  }
  // An element that only moved gets no rule (and so no id) from it.
  if (JSON.stringify(next) !== JSON.stringify(before)) comp.setStyle(next)
}

/** Carries out a drop: the order in the DOM and the margins / alignment it implies. Nothing positional. */
export function performDrop(
  comp: Component,
  into: Component,
  drop: Drop,
  level: Pick<Level, 'axis' | 'flex'>,
) {
  const style = dropStyle(drop, level)
  // Lining up the only child changes the box, not the order.
  if (drop.kind !== 'align') moveComponent(comp, into, drop.index)
  writeElementStyle(comp, style.element)
  if (Object.keys(style.container).length) into.addStyle(style.container)
}

/** Aligns the children of the selected element's container: "push this to the right". */
export function alignContainer(editor: Editor, side: Alignment) {
  const comp = editor.getSelected()
  const box = comp?.parent()
  const el = box?.getEl()
  if (!box || !el) return
  const win = el.ownerDocument.defaultView!
  const rects = [...el.children].map(measure)
  const style = win.getComputedStyle(el)
  const axis = axisOf(style, rects)
  const flex = /flex/.test(style.display)
  box.addStyle({
    ...(flex ? {} : flexStyle(axis)),
    ...alignStyle(axis, side),
  })
  editor.refresh()
}

const measure = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** The boxes under a point that the dragged element may land in, deepest first (at most the box and its parent). */
function levelsAt(
  doc: Document,
  point: { x: number; y: number },
  dragged: HTMLElement,
): { levels: Level[]; els: HTMLElement[] } | null {
  const win = doc.defaultView!
  const inner = doc.elementsFromPoint(point.x, point.y).find(
    (el): el is HTMLElement =>
      // GrapesJS builds the canvas elements in the editor's window, so `instanceof` would say no.
      el.nodeType === 1 &&
      'style' in el &&
      acceptsChildren(el.tagName) &&
      !dragged.contains(el) &&
      !!componentOf(el),
  )
  if (!inner) return null
  const describe = (el: HTMLElement, indexIn?: HTMLElement): Level => {
    const children = [...el.children].filter((c) => c !== dragged)
    const rects = children.map(measure)
    const style = win.getComputedStyle(el)
    return {
      rect: measure(el),
      axis: axisOf(style, rects),
      flex: /flex/.test(style.display),
      children: rects,
      own: dragged.parentElement === el && children.length === 0,
      indexInParent: indexIn
        ? [...indexIn.children].filter((c) => c !== dragged).indexOf(el)
        : undefined,
    }
  }
  let outer = inner.parentElement
  while (outer && !(acceptsChildren(outer.tagName) && componentOf(outer)))
    outer = outer.parentElement
  if (outer && dragged.contains(outer)) outer = null
  // A box is dropped beside only when it is a direct child of its parent box.
  const direct = outer && inner.parentElement === outer ? outer : null
  const levels = [describe(inner, direct ?? undefined)]
  const els = [inner]
  if (outer) {
    levels.push(describe(outer))
    els.push(outer)
  }
  return { levels, els }
}

/** The ghost, the receiving box and the marker line, drawn in the canvas document over the page. */
function overlay(doc: Document, dragged: HTMLElement) {
  const style = doc.createElement('style')
  style.textContent =
    '.ds-dragging{opacity:.35!important}html.ds-drag-on,html.ds-drag-on *{cursor:grabbing!important;user-select:none!important}'
  doc.head.append(style)
  const box = (css: string) => {
    const el = doc.createElement('div')
    el.setAttribute(
      'style',
      `position:fixed;pointer-events:none;z-index:2147483646;${css}`,
    )
    doc.documentElement.append(el)
    return el
  }
  const container = box(
    `outline:2px dashed ${COLOR};outline-offset:-1px;background:${COLOR}14`,
  )
  const line = box(`background:${COLOR};border-radius:2px`)
  const label = box(
    `background:${COLOR};color:#fff;font:600 11px/1 system-ui,sans-serif;padding:3px 6px;border-radius:3px;white-space:nowrap`,
  )
  const ghost = dragged.cloneNode(true) as HTMLElement
  ghost.removeAttribute('id')
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
  const r = dragged.getBoundingClientRect()
  ghost.setAttribute(
    'style',
    `position:fixed;pointer-events:none;z-index:2147483647;margin:0;box-sizing:border-box;opacity:.7;width:${r.width}px;height:${r.height}px;box-shadow:0 6px 18px rgba(0,0,0,.25)`,
  )
  doc.documentElement.append(ghost)
  doc.documentElement.classList.add('ds-drag-on')
  dragged.classList.add('ds-dragging')
  const place = (el: HTMLElement, rect: Rect | null) => {
    el.style.display = rect ? 'block' : 'none'
    if (!rect) return
    el.style.left = `${rect.left}px`
    el.style.top = `${rect.top}px`
    el.style.width = `${rect.width}px`
    el.style.height = `${rect.height}px`
  }
  return {
    ghostAt(x: number, y: number, grabX: number, grabY: number) {
      ghost.style.left = `${x - grabX}px`
      ghost.style.top = `${y - grabY}px`
    },
    show(marker: ReturnType<typeof markerFor> | null, x: number, y: number) {
      place(container, marker?.container ?? null)
      place(line, marker?.line ?? null)
      label.style.display = marker ? 'block' : 'none'
      if (marker) {
        label.textContent = marker.label
        // Beside the pointer, kept inside the page.
        const room = doc.documentElement.clientWidth - label.offsetWidth - 4
        label.style.left = `${Math.max(4, Math.min(x + 14, room))}px`
        label.style.top = `${y + 18}px`
      }
    },
    remove() {
      for (const el of [container, line, label, ghost, style]) el.remove()
      doc.documentElement.classList.remove('ds-drag-on')
      dragged.classList.remove('ds-dragging')
    },
  }
}

/** Free dragging of the selected element inside one canvas document. Returns what undoes the listeners. */
function freeDrag(editor: Editor, doc: Document) {
  const down = (e: MouseEvent) => {
    const selected = editor.getSelected()
    const el = selected?.getEl()
    if (
      e.button !== 0 ||
      !selected ||
      !el ||
      selected === editor.getWrapper() ||
      !el.contains(e.target as Node | null) ||
      el.isContentEditable
    )
      return
    const from = { x: e.clientX, y: e.clientY }
    const box = el.getBoundingClientRect()
    let session: ReturnType<typeof overlay> | null = null
    let current: ReturnType<typeof levelsAt> = null
    let drop: Drop | null = null

    const plan = (x: number, y: number) => {
      current = levelsAt(doc, { x, y }, el)
      drop = current ? resolveDrop(current.levels, { x, y }) : null
      const level = current && drop ? current.levels[drop.level] : null
      const tag =
        current && drop ? current.els[drop.level].tagName.toLowerCase() : ''
      session?.show(drop && level ? markerFor(drop, level, tag) : null, x, y)
    }
    const move = (m: MouseEvent) => {
      if (!session) {
        if (Math.hypot(m.clientX - from.x, m.clientY - from.y) < DRAG_THRESHOLD)
          return
        session = overlay(doc, el)
        doc.getSelection()?.removeAllRanges()
      }
      m.preventDefault()
      session.ghostAt(m.clientX, m.clientY, from.x - box.left, from.y - box.top)
      plan(m.clientX, m.clientY)
    }
    const stop = () => {
      doc.removeEventListener('mousemove', move, true)
      doc.removeEventListener('mouseup', up, true)
      doc.removeEventListener('keydown', key, true)
      session?.remove()
    }
    const up = () => {
      const started = session !== null
      const target =
        current && drop ? componentOf(current.els[drop.level]) : undefined
      const level = current && drop ? current.levels[drop.level] : undefined
      stop()
      if (!started) return
      // The click that ends a drag must not select what is under the pointer.
      const swallow = (c: Event) => c.stopPropagation()
      doc.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => doc.removeEventListener('click', swallow, true))
      if (drop && target && level && !descendantOrSelf(selected, target)) {
        performDrop(selected, target, drop, level)
        editor.select(selected)
        editor.refresh()
      }
    }
    const key = (k: KeyboardEvent) => {
      if (k.key === 'Escape') {
        k.preventDefault()
        drop = null
        stop()
      }
    }
    doc.addEventListener('mousemove', move, true)
    doc.addEventListener('mouseup', up, true)
    doc.addEventListener('keydown', key, true)
  }
  doc.addEventListener('mousedown', down, true)
  return () => doc.removeEventListener('mousedown', down, true)
}

const ids = (html: string) =>
  [...html.matchAll(/\sid\s*=\s*(["'])([^"']+)\1/g)].map((m) => m[2])

/** The selected elements as markup, with the rules of their `#id` selectors. */
export function clipFromSelection(editor: Editor): Clip | null {
  const selected = editor
    .getSelectedAll()
    .filter((c) => c !== editor.getWrapper())
  if (selected.length === 0) return null
  const options = { cleanId: true } as never
  const html = selected.map((c) => c.toHTML(options)).join('')
  const wanted = ids(html)
  const css = editor.Css.getAll()
    .filter((rule: CssRule) => {
      const sel = rule.selectorsToString()
      return wanted.some(
        (id) =>
          sel.startsWith(`#${id}`) && !/[\w-]/.test(sel[id.length + 1] ?? ''),
      )
    })
    .map((rule) => rule.toCSS())
    .join('\n')
  return { html, css }
}

const takenIds = (editor: Editor) =>
  new Set([
    ...ids(editor.getHtml({ cleanId: false })),
    ...[
      ...(editor.getCss({ avoidProtected: true })?.matchAll(/#([\w-]+)/g) ??
        []),
    ].map((m) => m[1]),
  ])

/** Puts a clip after the selected element (or at the end of the page), selecting what came in. One undo step. */
export function insertClip(editor: Editor, clip: Clip) {
  const { html, css } = remapIds(clip, takenIds(editor))
  const selected = editor.getSelected()
  const wrapper = editor.getWrapper()!
  const after = selected && selected !== wrapper ? selected : null
  const parent = after?.parent() ?? wrapper
  const at = after ? parent.components().indexOf(after) + 1 : undefined
  const added = parent.components().add(html, at === undefined ? {} : { at })
  if (css) editor.Css.addRules(css)
  editor.select(added)
}

/**
 * Keyboard and toolbar gestures, and free dragging in every canvas frame. `root` keys the clipboard kept in the
 * browser. Returns what removes them.
 */
export function installGestures(editor: Editor, root: string) {
  const editing = () => !!editor.getSelected()?.getEl()?.isContentEditable
  const handler = (run: () => void) => () => {
    if (!editing()) run()
  }
  const keymaps = editor.Keymaps
  // GrapesJS's own copy and paste keep their clipboard in memory; ours survive a change of page.
  keymaps.remove('core:copy')
  keymaps.remove('core:paste')
  keymaps.add(
    'ds:copy',
    '⌘+c, ctrl+c',
    handler(() => {
      const clip = clipFromSelection(editor)
      if (clip) writeClip(root, clip)
    }),
  )
  keymaps.add(
    'ds:paste',
    '⌘+v, ctrl+v',
    handler(() => {
      const clip = readClip(root)
      if (clip) insertClip(editor, clip)
    }),
  )
  keymaps.add(
    'ds:duplicate',
    '⌘+d, ctrl+d',
    handler(() => {
      const clip = clipFromSelection(editor)
      if (clip) insertClip(editor, clip)
    }),
    { prevent: true },
  )
  for (const [name, key] of [
    ['left', 'ArrowLeft'],
    ['up', 'ArrowUp'],
    ['right', 'ArrowRight'],
    ['down', 'ArrowDown'],
  ] as const) {
    keymaps.add(
      `ds:move-${name}`,
      `⌥+${name}, alt+${name}`,
      handler(() => {
        const comp = editor.getSelected()
        const parent = comp?.parent()
        if (!comp || !parent) return
        const siblings = kids(parent)
        const to = siblingMove(siblings.indexOf(comp), siblings.length, key)
        if (to === null) return
        moveComponent(comp, parent, to)
        editor.select(comp)
        editor.refresh()
      }),
      { prevent: true },
    )
  }

  const sides: [Alignment, string, string][] = [
    [
      'start',
      'Line up at the start',
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 4h2v16H3zM7 7h12v4H7zM7 13h8v4H7z"/></svg>',
    ],
    [
      'center',
      'Line up in the centre',
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M11 4h2v16h-2zM5 7h14v4H5zM8 13h8v4H8z"/></svg>',
    ],
    [
      'end',
      'Line up at the end (push right)',
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 4h2v16h-2zM5 7h12v4H5zM9 13h8v4H9z"/></svg>',
    ],
    [
      'between',
      'Space between',
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 4h2v16H3zM19 4h2v16h-2zM8 8h3v8H8zM13 8h3v8h-3z"/></svg>',
    ],
  ]
  for (const [side] of sides)
    editor.Commands.add(`ds:align-${side}`, {
      run: () => alignContainer(editor, side),
    })
  const addButtons = () => {
    const selected = editor.getSelected()
    if (!selected || selected === editor.getWrapper()) return
    const toolbar = selected.get('toolbar') ?? []
    if (toolbar.some((t) => t.command === 'ds:align-start')) return
    selected.set('toolbar', [
      ...toolbar,
      ...sides.map(([side, title, label]) => ({
        attributes: { class: 'ds-align', title },
        label,
        command: `ds:align-${side}`,
      })),
    ])
  }
  editor.on('component:selected', addButtons)

  const undo = new Map<Document, () => void>()
  const attach = ({ window: win }: { window?: Window }) => {
    const doc = win?.document
    if (doc && !undo.has(doc)) undo.set(doc, freeDrag(editor, doc))
  }
  editor.on('canvas:frame:load', attach)
  return () => {
    editor.off('component:selected', addButtons)
    editor.off('canvas:frame:load', attach)
    undo.forEach((off) => off())
    for (const id of [
      'copy',
      'paste',
      'duplicate',
      'move-left',
      'move-up',
      'move-right',
      'move-down',
    ])
      keymaps.remove(`ds:${id}`)
  }
}
