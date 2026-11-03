/* A wireframe file arrives unchecked from disk, MCP and HTTP: the guards look redundant to the type checker. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/**
 * A wireframe is Excalidraw's own JSON (`design/wireframes/<screens|components>/<page>/<name>.excalidraw`, so it also
 * opens on excalidraw.com), plus a `studio` key the studio keeps next to Excalidraw's: which page it was drawn from and
 * which shapes it generated. The server only validates it and lists it compactly for Claude: JSON work, no Excalidraw
 * code. A generated shape keeps, in its `customData`, the page element it stands for and where that element was.
 */
import { invalid } from './errors'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** What a generated shape remembers of the page element it was drawn from. */
export interface ShapeSource {
  /** A selector for the element in the base page, preferring its id. */
  selector: string
  /** The element's box in the base page, in page pixels. */
  origin: Box
  /** Its text then (a button's label, a heading). */
  text?: string
  /** The manifest component it is an instance of (`data-component`). */
  component?: string
  /** On a container: the Excalidraw group it gives its contents. */
  group?: string
}

export interface WireframeElement {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  angle?: number
  points?: [number, number][]
  text?: string
  containerId?: string | null
  groupIds?: string[]
  strokeColor?: string
  backgroundColor?: string
  isDeleted?: boolean
  customData?: { source?: ShapeSource }
  [key: string]: unknown
}

/** Which page and version a wireframe was generated from (null: drawn from blank). */
export interface WireframeBase {
  variant: 'reference' | 'proposal'
  /** The proposal version (`a` is the proposal itself); null for a reference. */
  version: string | null
  /** The hash of the page file it was generated from. */
  hash: string
}

export interface WireframeMeta {
  base: WireframeBase | null
  /** The page width it was laid out at. */
  width?: number
  /** Every shape it generated, live or since deleted, with the selector of its element. */
  generated: { id: string; selector: string }[]
}

export interface WireframeScene {
  type: 'excalidraw'
  version: number
  source?: string
  elements: WireframeElement[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
  studio?: WireframeMeta
}

export const emptyScene = (meta?: Partial<WireframeMeta>): WireframeScene => ({
  type: 'excalidraw',
  version: 2,
  source: 'design-studio',
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
  studio: { base: null, generated: [], ...meta },
})

export const sceneJson = (scene: WireframeScene) =>
  JSON.stringify(scene, null, 2) + '\n'

const MAX_WIREFRAME_BYTES = 16 * 1024 * 1024

/** Parses and checks a wireframe file's content. Anything that is not an Excalidraw scene is refused. */
export function parseScene(content: string): WireframeScene {
  if (typeof content !== 'string')
    throw invalid('The wireframe must be a string')
  if (content.length > MAX_WIREFRAME_BYTES)
    throw invalid('The wireframe is too big')
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw invalid('The wireframe is not valid JSON')
  }
  const scene = value as Partial<WireframeScene> | null
  if (
    !scene ||
    typeof scene !== 'object' ||
    scene.type !== 'excalidraw' ||
    !Array.isArray(scene.elements)
  )
    throw invalid('The wireframe is not an Excalidraw scene')
  for (const el of scene.elements) {
    if (
      !el ||
      typeof el !== 'object' ||
      typeof el.id !== 'string' ||
      typeof el.type !== 'string' ||
      typeof el.x !== 'number' ||
      typeof el.y !== 'number'
    )
      throw invalid('The wireframe has an element without id, type or position')
  }
  const meta = scene.studio
  if (meta !== undefined) {
    if (!meta || typeof meta !== 'object' || !Array.isArray(meta.generated))
      throw invalid('The wireframe has a bad "studio" block')
    const base = meta.base
    if (
      base !== null &&
      (typeof base !== 'object' ||
        (base.variant !== 'reference' && base.variant !== 'proposal') ||
        typeof base.hash !== 'string')
    )
      throw invalid('The wireframe has a bad base page')
  }
  return scene as WireframeScene
}

const live = (el: WireframeElement) => el.isDeleted !== true

/** The ids of the wireframe's live elements. */
export const liveIds = (scene: WireframeScene): Set<string> =>
  new Set(scene.elements.filter(live).map((el) => el.id))

export type ShapeChange = 'moved' | 'resized' | 'retexted'

export interface CompactShape {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  /** The text of a text element, or of the text bound inside the shape. */
  text?: string
  color: string
  fill?: string
  /** Arrows and lines: the two ends. */
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  /** A generated shape: the selector of its element in the base page. Absent: the user drew it. */
  source?: string
  /** A generated shape: where its element was in the base page. */
  origin?: Box
  /** What the user changed on a generated shape (empty: as generated). */
  changes?: ShapeChange[]
  /** The manifest component the element is an instance of. */
  component?: string
  /** The container shape it sits in, as generated (its group). */
  parent?: string
}

export interface CompactWireframe {
  base: WireframeBase | null
  width?: number
  /** True when the request covers some shapes only (the user's selection). */
  partial: boolean
  shapes: CompactShape[]
  /** Generated shapes the user deleted: the selectors of the page elements to remove. */
  removed: string[]
}

const round = (n: number) => Math.round(n * 10) / 10
/** Moves and resizes under this many pixels are drawing noise, not intent. */
const TOLERANCE = 4

/**
 * The wireframe as Claude reads it: the shapes (all, or the given ids) in drawing order, each generated one with its
 * element, where it was and what changed; and the generated elements that were deleted.
 */
export function compactWireframe(
  scene: WireframeScene,
  ids?: string[],
): CompactWireframe {
  const wanted = ids?.length ? new Set(ids) : null
  const bound = new Map<string, string>()
  for (const el of scene.elements)
    if (live(el) && el.type === 'text' && el.containerId)
      bound.set(el.containerId, el.text ?? '')
  // A container's group, for its contents to name it as their parent.
  const groupOwner = new Map<string, string>()
  for (const el of scene.elements) {
    const group = el.customData?.source?.group
    if (live(el) && group) groupOwner.set(group, el.id)
  }
  const shapes = scene.elements
    .filter((el) => live(el) && !el.containerId)
    .filter((el) => !wanted || wanted.has(el.id))
    .map((el) => {
      const shape: CompactShape = {
        id: el.id,
        type: el.type,
        x: round(el.x),
        y: round(el.y),
        width: round(el.width ?? 0),
        height: round(el.height ?? 0),
        color: el.strokeColor ?? '#1e1e1e',
      }
      const text = el.type === 'text' ? el.text : bound.get(el.id)
      if (text) shape.text = text
      if (el.backgroundColor && el.backgroundColor !== 'transparent')
        shape.fill = el.backgroundColor
      if (el.type === 'arrow' || el.type === 'line') {
        const first = el.points?.[0] ?? [0, 0]
        const last = el.points?.[el.points.length - 1] ?? [0, 0]
        shape.start = { x: round(el.x + first[0]), y: round(el.y + first[1]) }
        shape.end = { x: round(el.x + last[0]), y: round(el.y + last[1]) }
      }
      const source = el.customData?.source
      if (source) {
        shape.source = source.selector
        shape.origin = {
          x: round(source.origin.x),
          y: round(source.origin.y),
          width: round(source.origin.width),
          height: round(source.origin.height),
        }
        const changes: ShapeChange[] = []
        const far = (a: number, b: number) => Math.abs(a - b) > TOLERANCE
        if (far(el.x, source.origin.x) || far(el.y, source.origin.y))
          changes.push('moved')
        if (
          far(el.width ?? 0, source.origin.width) ||
          far(el.height ?? 0, source.origin.height)
        )
          changes.push('resized')
        if (
          source.text !== undefined &&
          (text ?? '').trim() !== source.text.trim()
        )
          changes.push('retexted')
        shape.changes = changes
        if (source.component) shape.component = source.component
      }
      const parentGroup = (el.groupIds ?? []).find(
        (g) => groupOwner.has(g) && groupOwner.get(g) !== el.id,
      )
      if (parentGroup) shape.parent = groupOwner.get(parentGroup)
      return shape
    })
  const alive = liveIds(scene)
  // A partial request is about its shapes only: what was deleted elsewhere is not part of it.
  const removed = wanted
    ? []
    : (scene.studio?.generated ?? [])
        .filter((g) => !alive.has(g.id))
        .map((g) => g.selector)
  return {
    base: scene.studio?.base ?? null,
    ...(scene.studio?.width ? { width: scene.studio.width } : {}),
    partial: wanted !== null,
    shapes,
    removed: [...new Set(removed)],
  }
}
