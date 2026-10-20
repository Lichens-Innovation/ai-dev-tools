/**
 * What a drop means. The editor lets an element follow the cursor freely, then turns where it was released into a
 * layout change the design loop can implement: an order in the DOM, `margin: auto` or the container's alignment. Never
 * coordinates. Pure: the DOM side measures (`Level`) and applies (`dropStyle`), this decides.
 */

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}
export type Axis = 'x' | 'y'
export type Side = 'start' | 'center' | 'end'

/** A box that can receive the dragged element, measured by the DOM side. `children` leave the dragged element out. */
export interface Level {
  rect: Rect
  /** The way its children run: along a row (`x`) or down a column (`y`). */
  axis: Axis
  /** `display: flex` already: `margin: auto` and `justify-content` work without changing the container. */
  flex: boolean
  children: Rect[]
  /** The dragged element is a child of this box (so with no other child it is the only one). */
  own: boolean
  /** Where this box sits among its parent's children (to drop beside it), when it has a parent level. */
  indexInParent?: number
}

export type Drop =
  /** Into the box at this place in the order. */
  | { kind: 'between'; level: number; index: number }
  /** At the far end or the centre of the row (column): `margin: auto`, after the last child. */
  | { kind: 'push'; level: number; index: number; edge: 'end' | 'center' }
  /** The only child of its box: the box's alignment. */
  | { kind: 'align'; level: number; side: Side }

/** Free space beyond the last child, in px, before a drop there means "push" and not "after the last". */
const PUSH_GAP = 16
/** The share of the box, around its middle, where a drop is "centre". */
const CENTRE_BAND = 0.12
/** The share of a box, at each end along its parent's axis, where a drop lands beside it, not into it. */
const EDGE_BAND = 0.2

const start = (r: Rect, axis: Axis) => (axis === 'x' ? r.left : r.top)
const size = (r: Rect, axis: Axis) => (axis === 'x' ? r.width : r.height)
const end = (r: Rect, axis: Axis) => start(r, axis) + size(r, axis)
const along = (p: Point, axis: Axis) => (axis === 'x' ? p.x : p.y)

/** The way a box lays its children out, from its computed display and direction and, for flow layout, where they sit. */
export function axisOf(
  style: { display: string; flexDirection: string },
  children: Rect[],
): Axis {
  const flex = /flex/.test(style.display)
  if (flex) return /column/.test(style.flexDirection) ? 'y' : 'x'
  const a = children.at(0)
  const b = children.at(1)
  // Flow layout: side by side when the second starts after the first ends and they overlap vertically.
  if (a && b && b.left >= a.left + a.width - 1 && b.top < a.top + a.height)
    return 'x'
  return 'y'
}

/** Which side of a box a point is on, in thirds of its width. */
function sideOf(rect: Rect, x: number): Side {
  const t = (x - rect.left) / Math.max(rect.width, 1)
  return t < 1 / 3 ? 'start' : t > 2 / 3 ? 'end' : 'center'
}

/** Where among `children` (in order) a point falls: the index the dragged element takes. */
function indexAmong(children: Rect[], p: number, axis: Axis): number {
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    const mid = start(c, axis) + size(c, axis) / 2
    if (p < mid) return i
  }
  return children.length
}

function within(level: Level, point: Point, at: number): Drop {
  const { axis, children, rect } = level
  if (children.length === 0)
    return level.own
      ? { kind: 'align', level: at, side: sideOf(rect, point.x) }
      : { kind: 'between', level: at, index: 0 }
  const p = along(point, axis)
  const last = children[children.length - 1]
  const free = p - end(last, axis)
  // Past the last child there is room: the far end, or the middle of the row.
  if (free > PUSH_GAP && (axis === 'x' || level.flex)) {
    const middle = start(rect, axis) + size(rect, axis) / 2
    const centre =
      Math.abs(p - middle) <= size(rect, axis) * CENTRE_BAND &&
      middle > end(last, axis)
    return {
      kind: 'push',
      level: at,
      index: children.length,
      edge: centre ? 'center' : 'end',
    }
  }
  return { kind: 'between', level: at, index: indexAmong(children, p, axis) }
}

/**
 * The drop for a point. `levels` are the boxes under it, deepest first; the result's `level` says which one it lands in.
 * Near the edge of the deepest box, along its parent's axis, the drop goes beside it (in its parent) instead.
 */
export function resolveDrop(levels: Level[], point: Point): Drop | null {
  const inner = levels.at(0)
  if (!inner) return null
  const outer = levels.at(1)
  if (outer && inner.indexInParent !== undefined) {
    const s = start(inner.rect, outer.axis)
    const len = size(inner.rect, outer.axis)
    const p = along(point, outer.axis)
    const band = Math.min(len * EDGE_BAND, 24)
    if (p < s + band || p > s + len - band) {
      // Beside it: before or after, by which half of the box the point is in.
      const after = p > s + len / 2
      // The dragged element's own place is not a child here, so the index counts only the others.
      return {
        kind: 'between',
        level: 1,
        index: inner.indexInParent + (after ? 1 : 0),
      }
    }
  }
  return within(inner, point, 0)
}

/** A row in a layer tree: above, below or onto it, by the share of its height the pointer is at. */
export function treeDrop(
  fraction: number,
  canContain: boolean,
): 'before' | 'after' | 'into' {
  if (!canContain) return fraction < 0.5 ? 'before' : 'after'
  return fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'into'
}

/** Tags a dragged element can be dropped into. Not text-level or void tags: dropping onto a `<p>` is not a layout. */
const CONTAINERS = new Set([
  'div',
  'section',
  'article',
  'aside',
  'main',
  'header',
  'footer',
  'nav',
  'ul',
  'ol',
  'li',
  'form',
  'fieldset',
  'body',
  'details',
  'figure',
  'label',
  'span',
])
export const acceptsChildren = (tag: string) =>
  CONTAINERS.has(tag.toLowerCase())

export type Style = Record<string, string>

const AUTO_MARGINS = [
  'margin-left',
  'margin-right',
  'margin-top',
  'margin-bottom',
]

const FLEX_FOR: Record<Axis, Style> = {
  x: { display: 'flex' },
  y: { display: 'flex', 'flex-direction': 'column' },
}

/**
 * The declarations a drop writes. `element` goes on the dragged element ('' removes a property), `container` on the
 * box it landed in. Always margins, display and alignment: nothing positional.
 */
export function dropStyle(
  drop: Drop,
  level: Pick<Level, 'axis' | 'flex'>,
): { element: Style; container: Style } {
  // A move forgets an earlier push.
  const element: Style = Object.fromEntries(AUTO_MARGINS.map((p) => [p, '']))
  const container: Style = {}
  if (drop.kind === 'between') return { element, container }
  if (drop.kind === 'align') {
    if (!level.flex) Object.assign(container, FLEX_FOR[level.axis])
    Object.assign(container, alignStyle(level.axis, drop.side))
    return { element, container }
  }
  // margin: auto needs a flex box; a column of plain blocks cannot be pushed down (the drop just orders it there).
  if (!level.flex) Object.assign(container, FLEX_FOR[level.axis])
  const [a, b] =
    level.axis === 'x'
      ? (['margin-left', 'margin-right'] as const)
      : (['margin-top', 'margin-bottom'] as const)
  element[a] = 'auto'
  if (drop.edge === 'center') element[b] = 'auto'
  return { element, container }
}

export type Alignment = 'start' | 'center' | 'end' | 'between'

/**
 * How a box lines its children up: `justify-content` along a row, `align-items` down a column (where the children's
 * side is what "to the right" means); "between" spreads them along the main axis in both.
 */
export function alignStyle(axis: Axis, side: Alignment): Style {
  const value = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
  }[side]
  return axis === 'x' || side === 'between'
    ? { 'justify-content': value }
    : { 'align-items': value }
}

/** The declarations that make a plain box a flex box running along `axis`. */
export const flexStyle = (axis: Axis): Style => FLEX_FOR[axis]

/** Alt+arrows: the index the element moves to among `count` siblings, or null at the end of the line. */
export function siblingMove(
  index: number,
  count: number,
  key: string,
): number | null {
  const next =
    key === 'ArrowLeft' || key === 'ArrowUp'
      ? index - 1
      : key === 'ArrowRight' || key === 'ArrowDown'
        ? index + 1
        : null
  return next === null || next < 0 || next >= count ? null : next
}

/** What the live marker shows while dragging: the box that receives the element, a line where it lands, and a word. */
export interface Marker {
  container: Rect
  line: Rect | null
  label: string
}

const THICK = 3

export function markerFor(drop: Drop, level: Level, tag: string): Marker {
  const { rect, axis, children } = level
  const container = rect
  const line = (at: number, ref: Rect): Rect =>
    axis === 'x'
      ? { left: at - THICK / 2, top: ref.top, width: THICK, height: ref.height }
      : { left: ref.left, top: at - THICK / 2, width: ref.width, height: THICK }

  if (drop.kind === 'between') {
    const n = children.length
    if (n === 0) return { container, line: null, label: `Into <${tag}>` }
    const ref = children[Math.min(drop.index, n - 1)]
    const prev = drop.index > 0 ? children.at(drop.index - 1) : undefined
    const next = children.at(drop.index)
    const at =
      prev && next
        ? (end(prev, axis) + start(next, axis)) / 2
        : next
          ? start(next, axis)
          : end(prev!, axis)
    return {
      container,
      line: line(at, ref),
      label: drop.index === 0 ? 'First' : drop.index === n ? 'Last' : 'Between',
    }
  }
  if (drop.kind === 'push') {
    const at =
      drop.edge === 'center'
        ? start(rect, axis) + size(rect, axis) / 2
        : end(rect, axis) - THICK / 2
    return {
      container,
      line: line(at, rect),
      label: drop.edge === 'center' ? 'Push to the centre' : 'Push to the end',
    }
  }
  const at =
    drop.side === 'start'
      ? rect.left + THICK / 2
      : drop.side === 'end'
        ? rect.left + rect.width - THICK / 2
        : rect.left + rect.width / 2
  return {
    container,
    line: {
      left: at - THICK / 2,
      top: rect.top,
      width: THICK,
      height: rect.height,
    },
    label: {
      start: 'Line up left',
      center: 'Line up centre',
      end: 'Line up right',
    }[drop.side],
  }
}
