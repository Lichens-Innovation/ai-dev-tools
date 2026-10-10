/**
 * The PNG a Make real request carries: the selected shapes over the page they were drawn on, cropped around the
 * selection. Runs in the browser. The page is drawn by html-to-image; when that fails the shapes go out alone, since a
 * request is still useful with the sketch only.
 */
import type { SketchElement } from '#/server/sketch'

const PAD = 80
const MAX_SIDE = 2400

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/** The box around some shapes (an arrow counts by its points). */
export function boundsOf(elements: readonly SketchElement[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const xs = el.points?.map((p) => el.x + p[0]) ?? [
      el.x,
      el.x + (el.width ?? 0),
    ]
    const ys = el.points?.map((p) => el.y + p[1]) ?? [
      el.y,
      el.y + (el.height ?? 0),
    ]
    minX = Math.min(minX, ...xs)
    maxX = Math.max(maxX, ...xs)
    minY = Math.min(minY, ...ys)
    maxY = Math.max(maxY, ...ys)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The crop in page coordinates: the selection's box plus room around it, kept to a size a request can carry. */
export function cropOf(bounds: Bounds): Bounds & { scale: number } {
  const x = bounds.x - PAD
  const y = bounds.y - PAD
  const w = bounds.w + PAD * 2
  const h = bounds.h + PAD * 2
  return { x, y, w, h, scale: Math.min(1, MAX_SIDE / Math.max(w, h)) }
}

export async function capturePng(
  doc: Document,
  elements: readonly SketchElement[],
  files: Record<string, unknown>,
): Promise<string> {
  const crop = cropOf(boundsOf(elements))
  const { exportToCanvas } = await import('@excalidraw/excalidraw')
  const shapes = await exportToCanvas({
    elements: elements as never,
    appState: { exportBackground: false, exportScale: crop.scale } as never,
    files: files as never,
    exportPadding: PAD,
  })
  const out = document.createElement('canvas')
  out.width = shapes.width
  out.height = shapes.height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('No canvas to draw the request image on')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  try {
    const { toCanvas } = await import('html-to-image')
    const style = getComputedStyle(doc.body)
    // The clone sits at the origin with no margin, so shift by where the body really starts.
    const box = doc.body.getBoundingClientRect()
    const win = doc.defaultView
    const left = box.left + (win?.scrollX ?? 0)
    const top = box.top + (win?.scrollY ?? 0)
    const page = await toCanvas(doc.body, {
      width: crop.w,
      height: crop.h,
      pixelRatio: crop.scale,
      cacheBust: false,
      backgroundColor: style.backgroundColor,
      style: {
        transform: `translate(${left - crop.x}px, ${top - crop.y}px)`,
        transformOrigin: '0 0',
        margin: '0',
      },
    })
    ctx.drawImage(page, 0, 0, out.width, out.height)
  } catch {
    // The page could not be drawn: the sketch alone still tells what is wanted.
  }
  ctx.drawImage(shapes, 0, 0)
  return out.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}
