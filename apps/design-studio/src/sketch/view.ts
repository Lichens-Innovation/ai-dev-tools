/**
 * The sketch layer shows the same viewport as the page: Excalidraw's scroll and zoom are derived from the canvas frame,
 * never the other way round. Sketch coordinates are page coordinates (the frame document's, unscaled).
 */

export interface FrameBox {
  /** The frame element's box on screen, zoom included. */
  left: number
  top: number
  width: number
  /** Its own, unscaled width (`offsetWidth`). */
  offsetWidth: number
  /** The page's scroll inside the frame. */
  scrollX: number
  scrollY: number
}

export interface SketchView {
  scrollX: number
  scrollY: number
  zoom: number
}

/** Excalidraw maps a scene point to the screen as `(point + scroll) * zoom`; this is the view that matches the frame. */
export function sketchView(
  frame: FrameBox,
  host: { left: number; top: number },
): SketchView {
  const zoom = frame.offsetWidth > 0 ? frame.width / frame.offsetWidth : 1
  return {
    zoom,
    scrollX: (frame.left - host.left) / zoom - frame.scrollX,
    scrollY: (frame.top - host.top) / zoom - frame.scrollY,
  }
}

export const sameView = (a: SketchView, b: SketchView) =>
  Math.abs(a.zoom - b.zoom) < 0.0005 &&
  Math.abs(a.scrollX - b.scrollX) < 0.25 &&
  Math.abs(a.scrollY - b.scrollY) < 0.25

/** A scene point on the host's screen. */
export const toScreen = (view: SketchView, x: number, y: number) => ({
  x: (x + view.scrollX) * view.zoom,
  y: (y + view.scrollY) * view.zoom,
})
