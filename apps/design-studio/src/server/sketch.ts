/* A sketch file arrives unchecked from disk, MCP and HTTP: the guards look redundant to the type checker. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/**
 * The sketch file is Excalidraw's own JSON (`<proposal>.excalidraw`, so it also opens on excalidraw.com). The studio only
 * needs to validate it, list shapes compactly for Claude and remove shapes once a request is done: string and JSON work,
 * no Excalidraw code on the server. Anchors live in each element's `customData`, which Excalidraw round-trips.
 */
import { invalid } from './errors'

export interface SketchAnchor {
  /** A stable selector for the page element, preferring its id. */
  selector: string
  /** Where the shape's reference point sits relative to the element's top-left corner, in page pixels. */
  dx: number
  dy: number
}

export interface SketchElement {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  points?: [number, number][]
  text?: string
  containerId?: string | null
  strokeColor?: string
  backgroundColor?: string
  isDeleted?: boolean
  customData?: { anchor?: SketchAnchor; endAnchor?: SketchAnchor }
  [key: string]: unknown
}

export interface SketchScene {
  type: 'excalidraw'
  version: number
  source?: string
  elements: SketchElement[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

export const emptyScene = (): SketchScene => ({
  type: 'excalidraw',
  version: 2,
  source: 'design-studio',
  elements: [],
  appState: { viewBackgroundColor: 'transparent' },
  files: {},
})

/** The bytes of an empty sketch: what a page without a sketch file reads as. */
export const EMPTY_SKETCH = JSON.stringify(emptyScene(), null, 2) + '\n'

const MAX_SKETCH_BYTES = 8 * 1024 * 1024

/** Parses and checks a sketch file's content. Anything that is not an Excalidraw scene is refused. */
export function parseScene(content: string): SketchScene {
  if (typeof content !== 'string') throw invalid('The sketch must be a string')
  if (content.length > MAX_SKETCH_BYTES) throw invalid('The sketch is too big')
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw invalid('The sketch is not valid JSON')
  }
  const scene = value as Partial<SketchScene> | null
  if (
    !scene ||
    typeof scene !== 'object' ||
    scene.type !== 'excalidraw' ||
    !Array.isArray(scene.elements)
  )
    throw invalid('The sketch is not an Excalidraw scene')
  for (const el of scene.elements) {
    if (
      !el ||
      typeof el !== 'object' ||
      typeof el.id !== 'string' ||
      typeof el.type !== 'string' ||
      typeof el.x !== 'number' ||
      typeof el.y !== 'number'
    )
      throw invalid('The sketch has an element without id, type or position')
  }
  return scene as SketchScene
}

const live = (el: SketchElement) => el.isDeleted !== true

/** The ids of the sketch's live elements. */
export const liveIds = (scene: SketchScene): Set<string> =>
  new Set(scene.elements.filter(live).map((el) => el.id))

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
  /** Arrows: the two ends, in page coordinates. */
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  /** The selector of the page element the shape covers or the arrow starts on. */
  anchor?: string
  /** The selector of the page element an arrow's end points to. */
  endAnchor?: string
}

const round = (n: number) => Math.round(n * 10) / 10

/** The selected shapes as a compact list, in sketch order: what Claude reads as the user's design notes. */
export function compactShapes(
  scene: SketchScene,
  ids: string[],
): CompactShape[] {
  const wanted = new Set(ids)
  const bound = new Map<string, string>()
  for (const el of scene.elements)
    if (live(el) && el.type === 'text' && el.containerId)
      bound.set(el.containerId, el.text ?? '')
  return scene.elements
    .filter((el) => live(el) && wanted.has(el.id))
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
      if (el.customData?.anchor) shape.anchor = el.customData.anchor.selector
      if (el.customData?.endAnchor)
        shape.endAnchor = el.customData.endAnchor.selector
      return shape
    })
}

/** The scene without the given shapes and the text bound inside them. */
export function removeShapes(scene: SketchScene, ids: string[]): SketchScene {
  const gone = new Set(ids)
  return {
    ...scene,
    elements: scene.elements.filter(
      (el) => !gone.has(el.id) && !(el.containerId && gone.has(el.containerId)),
    ),
  }
}
