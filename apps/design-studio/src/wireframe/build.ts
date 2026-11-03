/**
 * Browser side of wireframes: lay a page out in a hidden frame at its width and draw it (`sceneFromPage`), and the
 * PNG a Make real request carries (`wireframePng`). Excalidraw is imported on demand: it is client only.
 */
import { themeDocument } from '#/palette/theme'
import { emptyScene, sceneJson } from '#/server/wireframe'
import type { WireframeBase, WireframeScene } from '#/server/wireframe'
import { generateWireframe, probeOf } from './generate'

const loadExcalidraw = () => import('@excalidraw/excalidraw')

/** Loads `src` in an off-screen same-origin frame `width` pixels wide and hands its window over once laid out. */
async function withLaidOutPage<T>(
  src: string,
  width: number,
  use: (win: Window) => T,
): Promise<T> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${width}px`,
    height: '900px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve()
      frame.onerror = () => reject(new Error(`Could not load ${src}`))
      frame.src = src
      document.body.append(frame)
    })
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc?.body) throw new Error(`Could not read ${src}`)
    themeDocument(doc, 'light', null)
    await doc.fonts.ready.catch(() => undefined)
    // Images without a size lay out once loaded: give them a moment.
    await Promise.all(
      [...doc.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise<void>((resolve) => {
              img.onload = img.onerror = () => resolve()
              setTimeout(resolve, 1500)
            }),
        ),
    )
    return use(win)
  } finally {
    frame.remove()
  }
}

/** A wireframe of the page at `src`, as the JSON of a wireframe file. */
export async function sceneFromPage(
  src: string,
  width: number,
  base: WireframeBase,
): Promise<{ json: string; truncated: boolean }> {
  const { convertToExcalidrawElements } = await loadExcalidraw()
  const drawn = await withLaidOutPage(src, width, (win) =>
    generateWireframe(win.document, probeOf(win), { width }),
  )
  const elements = convertToExcalidrawElements(drawn.skeletons as never, {
    regenerateIds: false,
  })
  const scene: WireframeScene = {
    ...emptyScene({ base, width, generated: drawn.generated }),
    elements: elements as unknown as WireframeScene['elements'],
  }
  return { json: sceneJson(scene), truncated: drawn.truncated }
}

/** An empty wireframe, for a page drawn from nothing. */
export const blankScene = (width: number) => sceneJson(emptyScene({ width }))

const MAX_SIDE = 2400

/** The PNG of some shapes (all of them when `elements` is the whole scene), base64, on white. */
export async function wireframePng(
  elements: readonly unknown[],
  files: unknown,
): Promise<string> {
  const { exportToCanvas } = await loadExcalidraw()
  const probe = await exportToCanvas({
    elements: elements as never,
    appState: {
      exportBackground: true,
      viewBackgroundColor: '#ffffff',
    } as never,
    files: files as never,
    exportPadding: 24,
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(probe.width, probe.height))
  const canvas =
    scale === 1
      ? probe
      : await exportToCanvas({
          elements: elements as never,
          appState: {
            exportBackground: true,
            viewBackgroundColor: '#ffffff',
            exportScale: scale,
          } as never,
          files: files as never,
          exportPadding: 24,
        })
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}
