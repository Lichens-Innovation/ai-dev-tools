/* The DOM and Excalidraw hand back missing frames, windows and elements at runtime that their types call present. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/**
 * Anchors: the page element a sketch shape covers or an arrow points to. Each is recorded in the element's
 * `customData` as a stable selector (preferring ids) and the offset of the shape's reference point from the element's
 * top-left corner. When the layout moves, `sync` moves the shapes so they keep that offset: the note follows the
 * element. Pure over `PageMetrics`; `domMetrics` measures a real (or jsdom) document.
 */
import type { SketchAnchor, SketchElement } from '#/server/sketch'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** The page as the sketch sees it, in page coordinates (unscaled, scrolled to the document's origin). */
export interface PageMetrics {
  /** The box of the element a selector names; null when it is gone. */
  rectOf: (selector: string) => Rect | null
  /** The innermost element around a point. */
  pick: (x: number, y: number) => { selector: string; rect: Rect } | null
  /** The selector that names the element `selector` named, as the page is now: it changes when the element moves. */
  renamed: (selector: string) => string | null
}

const esc = (value: string) => value.replace(/([^\w-])/g, '\\$1')

/**
 * A selector for an element: its id when it has one that stays (`isStable` says which ids do: GrapesJS makes up ids
 * that the saved file does not keep), else the path from the nearest element with such an id, or from `body`.
 */
export function selectorFor(
  el: Element,
  isStable: (id: string) => boolean = () => true,
): string {
  const doc = el.ownerDocument
  const hasId = (e: Element) =>
    e.id !== '' &&
    isStable(e.id) &&
    doc.querySelectorAll(`#${esc(e.id)}`).length === 1
  if (hasId(el)) return `#${esc(el.id)}`
  const parts: string[] = []
  for (
    let cur: Element | null = el;
    cur && cur !== doc.body && cur !== doc.documentElement;
    cur = cur.parentElement
  ) {
    if (cur !== el && hasId(cur)) {
      parts.unshift(`#${esc(cur.id)}`)
      return parts.join(' > ')
    }
    const tag = cur.tagName.toLowerCase()
    const same = [...(cur.parentElement?.children ?? [])].filter(
      (c) => c.tagName === cur?.tagName,
    )
    parts.unshift(
      same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag,
    )
  }
  return ['body', ...parts].join(' > ')
}

const SKIPPED = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'TEMPLATE',
  'NOSCRIPT',
])

export function domMetrics(
  doc: Document,
  isStable?: (id: string) => boolean,
): PageMetrics {
  const win = doc.defaultView
  const rectIn = (el: Element): Rect => {
    const r = el.getBoundingClientRect()
    return {
      x: r.left + (win?.scrollX ?? 0),
      y: r.top + (win?.scrollY ?? 0),
      w: r.width,
      h: r.height,
    }
  }
  // An element that moved keeps its node, though its path-selector changes: remember the node by what named it.
  const known = new Map<string, Element>()
  const find = (selector: string): Element | null => {
    const cached = known.get(selector)
    if (cached?.isConnected) return cached
    let el: Element | null = null
    try {
      el = doc.querySelector(selector)
    } catch {
      // A selector from a file somebody edited: the anchor is lost, the shape stays where it is.
    }
    if (el) known.set(selector, el)
    else known.delete(selector)
    return el
  }
  return {
    rectOf: (selector) => {
      const el = find(selector)
      return el ? rectIn(el) : null
    },
    renamed: (selector) => {
      const el = find(selector)
      if (!el) return null
      const next = selectorFor(el, isStable)
      known.set(next, el)
      return next
    },
    pick: (x, y) => {
      let best: { el: Element; rect: Rect } | null = null
      for (const el of doc.body.querySelectorAll('*')) {
        if (SKIPPED.has(el.tagName)) continue
        const rect = rectIn(el)
        if (rect.w <= 0 || rect.h <= 0) continue
        if (
          x < rect.x ||
          x > rect.x + rect.w ||
          y < rect.y ||
          y > rect.y + rect.h
        )
          continue
        // Smallest wins; at equal size the deeper (later) one.
        if (!best || rect.w * rect.h <= best.rect.w * best.rect.h)
          best = { el, rect }
      }
      if (!best) return null
      const selector = selectorFor(best.el, isStable)
      known.set(selector, best.el)
      return { selector, rect: best.rect }
    },
  }
}

const isLine = (el: SketchElement) => el.type === 'arrow' || el.type === 'line'
const live = (el: SketchElement) => el.isDeleted !== true
const num = (n: number | undefined) => n ?? 0

/** The point of a shape that anchors it: an arrow's start, else the centre. */
function reference(el: SketchElement): { x: number; y: number } {
  if (isLine(el)) {
    const p = el.points?.[0] ?? [0, 0]
    return { x: el.x + p[0], y: el.y + p[1] }
  }
  return { x: el.x + num(el.width) / 2, y: el.y + num(el.height) / 2 }
}

/** Where an arrow points. */
function tip(el: SketchElement): { x: number; y: number } {
  const p = el.points?.[el.points.length - 1] ?? [0, 0]
  return { x: el.x + p[0], y: el.y + p[1] }
}

const signature = (el: SketchElement) =>
  [
    el.x,
    el.y,
    el.width,
    el.height,
    el.points?.map((p) => p.join(':')).join(';'),
  ]
    .map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))
    .join('|')

function anchorAt(
  point: { x: number; y: number },
  metrics: PageMetrics,
): SketchAnchor | undefined {
  const hit = metrics.pick(point.x, point.y)
  if (!hit) return undefined
  return {
    selector: hit.selector,
    dx: Math.round((point.x - hit.rect.x) * 10) / 10,
    dy: Math.round((point.y - hit.rect.y) * 10) / 10,
  }
}

/** The element with its anchors worked out from where it is now (arrows: the start and the tip). */
export function anchored(
  el: SketchElement,
  metrics: PageMetrics,
): SketchElement {
  const anchor = anchorAt(reference(el), metrics)
  const endAnchor = isLine(el) ? anchorAt(tip(el), metrics) : undefined
  const customData = { ...el.customData }
  delete customData.anchor
  delete customData.endAnchor
  if (anchor) customData.anchor = anchor
  if (endAnchor) customData.endAnchor = endAnchor
  return { ...el, customData }
}

const bump = (el: SketchElement): SketchElement => ({
  ...el,
  version: num(el.version as number | undefined) + 1,
  versionNonce: Math.floor(Math.random() * 2 ** 31),
  updated: Date.now(),
})

/** The element moved so its anchors sit at their elements again; null when it is already there. */
function moved(el: SketchElement, metrics: PageMetrics): SketchElement | null {
  const want = (a: SketchAnchor | undefined, at: { x: number; y: number }) => {
    if (!a) return null
    const rect = metrics.rectOf(a.selector)
    if (!rect) return null
    return { x: rect.x + a.dx - at.x, y: rect.y + a.dy - at.y }
  }
  const start = want(el.customData?.anchor, reference(el))
  if (!isLine(el)) {
    if (!start || (Math.abs(start.x) < 0.5 && Math.abs(start.y) < 0.5))
      return null
    return { ...el, x: el.x + start.x, y: el.y + start.y }
  }
  const end = want(el.customData?.endAnchor, tip(el))
  const ds = start ?? { x: 0, y: 0 }
  const de = end ?? { x: 0, y: 0 }
  if (
    Math.abs(ds.x) < 0.5 &&
    Math.abs(ds.y) < 0.5 &&
    Math.abs(de.x) < 0.5 &&
    Math.abs(de.y) < 0.5
  )
    return null
  const points = el.points ?? [
    [0, 0],
    [num(el.width), num(el.height)],
  ]
  const last = Math.max(points.length - 1, 1)
  const x = el.x + ds.x
  const y = el.y + ds.y
  // Each point moves by its share of the start's and the tip's shift.
  const next = points.map(([px, py], i): [number, number] => {
    const t = i / last
    return [
      el.x + px + ds.x * (1 - t) + de.x * t - x,
      el.y + py + ds.y * (1 - t) + de.y * t - y,
    ]
  })
  const xs = next.map((p) => p[0])
  const ys = next.map((p) => p[1])
  return {
    ...el,
    x,
    y,
    points: next,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

export interface Anchoring {
  /**
   * Brings the scene and the page in step. `settled` is false while a pointer is down: shapes being dragged are left
   * alone. Returns the scene to write back, or null when nothing changed.
   *
   * - A shape not seen before without anchors (just drawn) is anchored where it is.
   * - A shape not seen before with anchors (just loaded) follows them: the layout may have moved since it was saved.
   * - A shape that is not where we left it was moved by the user: anchored again where it is now.
   * - Any other shape follows its anchors.
   */
  sync: (
    elements: readonly SketchElement[],
    settled: boolean,
  ) => SketchElement[] | null
}

export function createAnchoring(metrics: PageMetrics): Anchoring {
  const seen = new Map<string, string>()
  return {
    sync(elements, settled) {
      const out = elements.slice()
      let changed = false
      const set = (i: number, el: SketchElement) => {
        out[i] = bump(el)
        changed = true
      }
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        // Text inside a shape moves with its container.
        if (!el || !live(el) || el.containerId) continue
        const sig = signature(el)
        const before = seen.get(el.id)
        let next: SketchElement = el
        if (before === undefined && !el.customData?.anchor) {
          if (!settled) continue
          next = anchored(el, metrics)
        } else if (before !== undefined && before !== sig) {
          if (!settled) continue
          next = anchored(el, metrics)
        } else {
          // Follow, and keep the stored selector in step with the element when its path changed.
          const follower = moved(el, metrics)
          if (follower) next = follower
          const rename = (a: SketchAnchor | undefined) => {
            const sel = a && metrics.renamed(a.selector)
            return a && sel && sel !== a.selector ? { ...a, selector: sel } : a
          }
          const anchor = rename(next.customData?.anchor)
          const endAnchor = rename(next.customData?.endAnchor)
          if (
            anchor !== next.customData?.anchor ||
            endAnchor !== next.customData?.endAnchor
          )
            next = {
              ...next,
              customData: { ...next.customData, anchor, endAnchor },
            }
        }
        const differs =
          next.x !== el.x ||
          next.y !== el.y ||
          next.points !== el.points ||
          JSON.stringify(next.customData ?? null) !==
            JSON.stringify(el.customData ?? null)
        if (differs) {
          set(i, next)
          // The text bound inside moves by the same shift.
          const dx = next.x - el.x
          const dy = next.y - el.y
          if (dx !== 0 || dy !== 0)
            out.forEach((other, j) => {
              if (other.containerId === el.id && live(other))
                set(j, { ...other, x: other.x + dx, y: other.y + dy })
            })
        }
        seen.set(el.id, signature(out[i] ?? el))
      }
      return changed ? out : null
    },
  }
}
