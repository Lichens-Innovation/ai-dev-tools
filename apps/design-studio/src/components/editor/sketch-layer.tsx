/* The DOM and Excalidraw hand back missing frames, windows and elements at runtime that their types call present. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from 'grapesjs'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { createAnchoring, domMetrics } from '#/sketch/anchors'
import type { Anchoring } from '#/sketch/anchors'
import { boundsOf, capturePng } from '#/sketch/capture'
import { sameView, sketchView, toScreen } from '#/sketch/view'
import type { SketchView } from '#/sketch/view'
import type { SketchRequest } from '#/server/design-project'
import type { SketchElement } from '#/server/sketch'
import {
  getSketch,
  listSketchRequests,
  makeReal,
  saveSketch,
} from '#/server/functions'
import { onStudioMessage } from '#/studio-events'
import type { PageRef } from '#/components/shell/page-frame'

type Excalidraw = Awaited<ReturnType<typeof loadExcalidraw>>
const loadExcalidraw = () => import('@excalidraw/excalidraw')

/** Select works on the page (GrapesJS); the others hand the mouse and the keyboard to the sketch layer. */
type Tool =
  | 'select'
  | 'pointer'
  | 'rectangle'
  | 'freedraw'
  | 'text'
  | 'arrow'
  | 'eraser'

const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'Select and edit the page'],
  ['pointer', 'Sketch', 'Select and move sketch shapes'],
  ['rectangle', 'Rectangle', 'Draw a rectangle'],
  ['freedraw', 'Pen', 'Draw freehand'],
  ['text', 'Text', 'Write a note'],
  ['arrow', 'Arrow', 'Point at something'],
  ['eraser', 'Eraser', 'Erase sketch shapes'],
]

/** Excalidraw's tool for ours (`select` leaves its tool as it was). */
const EXCALIDRAW_TOOL: Record<Exclude<Tool, 'select'>, string> = {
  pointer: 'selection',
  rectangle: 'rectangle',
  freedraw: 'freedraw',
  text: 'text',
  arrow: 'arrow',
  eraser: 'eraser',
}

const toolOf = (type: string): Tool | null =>
  (Object.entries(EXCALIDRAW_TOOL).find(([, t]) => t === type)?.[0] as
    | Tool
    | undefined) ?? null

/** One object for good: Excalidraw re-renders itself when it gets a new one. */
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false as const,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: { image: false },
}

const button =
  'h-7 cursor-pointer rounded-md border border-(--line) px-2.5 text-xs font-medium hover:bg-(--bg-2) disabled:cursor-default disabled:opacity-40 aria-pressed:bg-(--primary) aria-pressed:text-(--bg)'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

interface Badge {
  id: string
  status: SketchRequest['status']
  x: number
  y: number
}

const STATUS_LABEL: Record<SketchRequest['status'], string> = {
  pending: 'Pending',
  sent: 'Sent to Claude',
  done: 'Done',
  failed: 'Failed',
}

const signatureOf = (elements: readonly { id: string; version: number }[]) =>
  elements.map((el) => `${el.id}:${el.version}`).join(',')

/**
 * The sketch layer: a transparent Excalidraw over the GrapesJS canvas. Excalidraw's scroll and zoom come from the
 * canvas frame every frame (never the other way round), shapes record the page element they cover or point to and follow
 * it, the sketch autosaves to `<proposal>.excalidraw`, and Make real records a request for Claude.
 */
export function SketchLayer({
  page,
  editor,
  onOwnsKeyboard,
}: {
  page: PageRef
  /** The page editor, once its canvas is up. */
  editor: Editor | null
  /** True while the sketch layer has the keyboard (a sketch tool is active). */
  onOwnsKeyboard: (owns: boolean) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [lib, setLib] = useState<Excalidraw | null>(null)
  const [initial, setInitial] = useState<{
    elements: ExcalidrawElement[]
    files: BinaryFiles
    hash: string
  } | null>(null)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [hidden, setHidden] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [external, setExternal] = useState(false)
  const [requests, setRequests] = useState<SketchRequest[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const hash = useRef('')
  const savedSig = useRef('')
  const dirty = useRef(false)
  const seenSig = useRef('')
  const seenTool = useRef('selection')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mine = useRef(new Set<string>())
  const toolRef = useRef(tool)
  toolRef.current = tool
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const requestsRef = useRef(requests)
  requestsRef.current = requests
  const view = useRef<SketchView>({ scrollX: 0, scrollY: 0, zoom: 1 })
  const owns = onOwnsKeyboard

  const initialData = useMemo(
    () =>
      initial && {
        elements: initial.elements,
        files: initial.files,
        appState: {
          viewBackgroundColor: 'transparent',
          currentItemStrokeColor: '#e03131',
          currentItemBackgroundColor: 'transparent',
        },
      },
    [initial],
  )

  const active = !hidden && tool !== 'select'

  // Excalidraw is client only: load it, its fonts from the studio itself, and the sketch file.
  useEffect(() => {
    let gone = false
    ;(window as unknown as Record<string, string>).EXCALIDRAW_ASSET_PATH =
      '/excalidraw-assets/'
    Promise.all([
      loadExcalidraw(),
      import('@excalidraw/excalidraw/index.css'),
      getSketch({ data: page }),
      listSketchRequests({ data: page }),
    ])
      .then(([mod, , sketch, list]) => {
        if (gone) return
        const scene = JSON.parse(sketch.json) as {
          elements: ExcalidrawElement[]
          files?: BinaryFiles
        }
        hash.current = sketch.hash
        savedSig.current = signatureOf(scene.elements)
        setInitial({
          elements: scene.elements,
          files: scene.files ?? {},
          hash: sketch.hash,
        })
        setRequests(list)
        setLib(mod)
      })
      .catch((error: unknown) =>
        setFailure(error instanceof Error ? error.message : String(error)),
      )
    return () => {
      gone = true
    }
  }, [page.kind, page.name])

  const sceneJson = () => {
    if (!api || !lib) return null
    return lib.serializeAsJSON(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      'local',
    )
  }

  /** Writes the sketch to its file now. False when it could not be saved (a conflict, an error). */
  const flush = async (overwrite = false): Promise<boolean> => {
    clearTimeout(timer.current)
    if (!api || !lib) return true
    if (!dirty.current && !overwrite) return true
    const json = sceneJson()
    if (json === null) return true
    setStatus({ kind: 'saving' })
    try {
      const baseHash = overwrite
        ? (await getSketch({ data: page })).hash
        : hash.current
      const result = await saveSketch({ data: { ...page, json, baseHash } })
      if (!result.ok) {
        setStatus(
          result.error === 'Conflict'
            ? { kind: 'conflict', message: result.message }
            : { kind: 'error', message: result.message },
        )
        return false
      }
      hash.current = result.hash
      mine.current.add(result.hash)
      savedSig.current = signatureOf(api.getSceneElementsIncludingDeleted())
      dirty.current = false
      setExternal(false)
      setStatus({ kind: 'saved' })
      return true
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
  const flushRef = useRef(flush)
  flushRef.current = flush

  const reloadFromDisk = async () => {
    if (!api) return
    const sketch = await getSketch({ data: page })
    const scene = JSON.parse(sketch.json) as {
      elements: ExcalidrawElement[]
      files?: BinaryFiles
    }
    hash.current = sketch.hash
    savedSig.current = signatureOf(scene.elements)
    dirty.current = false
    api.updateScene({
      elements: scene.elements,
      captureUpdate: lib?.CaptureUpdateAction.NEVER,
    })
    setExternal(false)
    setStatus({ kind: 'idle' })
  }
  const reloadRef = useRef(reloadFromDisk)
  reloadRef.current = reloadFromDisk

  // The tool decides who gets the mouse and the keyboard.
  useEffect(() => {
    owns(active)
    if (!api) return
    if (tool !== 'select') {
      api.setActiveTool({
        type: EXCALIDRAW_TOOL[tool] as 'selection',
      })
      editor?.select([] as never)
      hostRef.current
        ?.querySelector<HTMLElement>('.excalidraw')
        ?.focus({ preventScroll: true })
    } else {
      api.setActiveTool({ type: 'selection' })
    }
    return () => owns(false)
  }, [tool, hidden, api])

  // Zoom and scroll stay locked to the page; follow the layout; keep the badges on their shapes.
  useEffect(() => {
    if (!api || !editor) return
    let frame = 0
    let anchoring: Anchoring | null = null
    let anchoringDoc: Document | null = null
    let lastBadges = ''
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const host = hostRef.current
      const frameEl = editor.Canvas.getFrameEl()
      const win = frameEl?.contentWindow
      const doc = win?.document
      if (!host || !frameEl || !win || !doc?.body) return
      const hostBox = host.getBoundingClientRect()
      const box = frameEl.getBoundingClientRect()
      const next = sketchView(
        {
          left: box.left,
          top: box.top,
          width: box.width,
          offsetWidth: frameEl.offsetWidth,
          scrollX: win.scrollX,
          scrollY: win.scrollY,
        },
        hostBox,
      )
      const state = api.getAppState()
      if (
        !sameView(next, {
          scrollX: state.scrollX,
          scrollY: state.scrollY,
          zoom: state.zoom.value,
        })
      ) {
        api.updateScene({
          appState: {
            scrollX: next.scrollX,
            scrollY: next.scrollY,
            zoom: { value: next.zoom as never },
          } as never,
        })
      }
      view.current = next

      if (hiddenRef.current) return
      // A new document (the editor reloaded its frame) needs new measures; ids the saved file would drop are not stable.
      if (anchoringDoc !== doc) {
        anchoringDoc = doc
        const stable = (id: string) => !/^i[a-z0-9]{3,4}$/.test(id)
        anchoring = createAnchoring(domMetrics(doc, stable))
      }
      const elements = api.getSceneElementsIncludingDeleted()
      const settled =
        state.cursorButton === 'up' &&
        !state.newElement &&
        !state.editingTextElement &&
        !state.resizingElement &&
        !state.selectedElementsAreBeingDragged
      const out = anchoring?.sync(
        elements as unknown as SketchElement[],
        settled,
      )
      if (out && lib) {
        api.updateScene({
          elements: out as unknown as ExcalidrawElement[],
          captureUpdate: lib.CaptureUpdateAction.NEVER,
        })
      }

      // A badge sits on the top-right corner of the shapes of each open or failed request.
      const live = new Map(
        (out ?? (elements as unknown as SketchElement[])).map((el) => [
          el.id,
          el,
        ]),
      )
      const next2: Badge[] = []
      for (const request of requestsRef.current) {
        if (request.status === 'done') continue
        const shapes = request.shapeIds
          .map((id) => live.get(id))
          .filter((el): el is SketchElement => !!el && !el.isDeleted)
        if (!shapes.length) continue
        const b = boundsOf(shapes)
        const at = toScreen(next, b.x + b.w, b.y)
        next2.push({
          id: request.id,
          status: request.status,
          x: Math.round(at.x),
          y: Math.round(at.y),
        })
      }
      const key = JSON.stringify(next2)
      if (key !== lastBadges) {
        lastBadges = key
        setBadges(next2)
      }
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [api, editor, lib])

  // With a sketch tool active, the wheel moves the page (and zooms it with Ctrl), not Excalidraw's own view.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !editor) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const win = editor.Canvas.getFrameEl()?.contentWindow
      if (e.ctrlKey || e.metaKey) {
        const zoom = editor.Canvas.getZoom()
        editor.Canvas.setZoom(
          Math.min(400, Math.max(10, zoom * (e.deltaY < 0 ? 1.1 : 0.9))),
        )
      } else {
        const z = view.current.zoom || 1
        win?.scrollBy(e.deltaX / z, e.deltaY / z)
      }
    }
    host.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => host.removeEventListener('wheel', onWheel, { capture: true })
  }, [editor, lib])

  // Ctrl+S saves the sketch too; leaving with unsaved strokes asks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')
        void flushRef.current()
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
      clearTimeout(timer.current)
    }
  }, [])

  // The sketch changed on disk (a request resolved as done removed its shapes); requests changed status.
  useEffect(
    () =>
      onStudioMessage((message) => {
        if (message.type !== 'change') return
        const { event } = message
        if (
          event.kind === 'sketch' &&
          event.pageKind === page.kind &&
          event.name === page.name &&
          event.hash !== hash.current &&
          !mine.current.has(event.hash)
        ) {
          if (dirty.current) setExternal(true)
          else void reloadRef.current()
        }
        if (
          event.kind === 'request' &&
          event.request.page.kind === page.kind &&
          event.request.page.name === page.name
        ) {
          setRequests((list) => [
            event.request,
            ...list.filter((r) => r.id !== event.request.id),
          ])
        }
      }),
    [page.kind, page.name],
  )

  const onChange = (
    elements: readonly ExcalidrawElement[],
    state: AppState,
  ) => {
    const ids = Object.keys(state.selectedElementIds).filter(
      (id) => state.selectedElementIds[id],
    )
    setSelected((prev) =>
      prev.length === ids.length && prev.every((id, i) => id === ids[i])
        ? prev
        : ids,
    )
    // After a shape is drawn Excalidraw goes back to its selection tool: the toolbar follows.
    // Only a change Excalidraw made itself counts: right after we pick a tool it still reports the previous one.
    if (state.activeTool.type !== seenTool.current) {
      seenTool.current = state.activeTool.type
      const next = toolOf(state.activeTool.type)
      if (toolRef.current !== 'select' && next && next !== toolRef.current)
        setTool(next)
    }
    // Excalidraw calls this after every one of its updates, ours included: act only on a change of the scene.
    const sig = signatureOf(elements)
    if (sig === seenSig.current) return
    seenSig.current = sig
    if (sig !== savedSig.current) {
      dirty.current = true
      setStatus((s) =>
        s.kind === 'conflict' || s.kind === 'idle' ? s : { kind: 'idle' },
      )
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flushRef.current(), 700)
    }
  }

  const doc = () => editor?.Canvas.getFrameEl()?.contentWindow?.document

  const make = async () => {
    const frameDoc = doc()
    if (!api || !frameDoc || busy || !selected.length) return
    setBusy(true)
    setNote(null)
    try {
      if (!(await flush())) return
      const elements = api.getSceneElements()
      const wanted = new Set(selected)
      // The shapes and the text written inside them.
      const picked = elements.filter(
        (el) =>
          wanted.has(el.id) ||
          ('containerId' in el && el.containerId && wanted.has(el.containerId)),
      )
      const png = await capturePng(
        frameDoc,
        picked as unknown as SketchElement[],
        api.getFiles(),
      )
      const result = await makeReal({
        data: { ...page, shapeIds: [...wanted], png },
      })
      if (!result.ok) {
        setNote(result.message)
        return
      }
      setRequests((list) => [
        result.request,
        ...list.filter((r) => r.id !== result.request.id),
      ])
      api.updateScene({ appState: { selectedElementIds: {} } as never })
      setNote(`Request ${result.request.id} made`)
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const copy = (request: SketchRequest) => {
    const command = `/design-sketch ${request.id}`
    void navigator.clipboard
      .writeText(command)
      .then(() => setNote(`Copied ${command}`))
      .catch(() => setNote(command))
  }

  const open = requests.filter((r) => r.status !== 'done')
  const lastDone = requests.find((r) => r.status === 'done')
  const shown = lastDone ? [...open, lastDone] : open

  return (
    <>
      <div
        ref={hostRef}
        className="ds-sketch absolute inset-0 z-10"
        style={{
          pointerEvents: active ? 'auto' : 'none',
          visibility: hidden ? 'hidden' : 'visible',
        }}
      >
        {lib && initial && (
          <lib.Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={onChange}
            UIOptions={UI_OPTIONS}
            detectScroll={false}
            handleKeyboardGlobally={false}
            autoFocus={false}
            theme="light"
          />
        )}
        {badges.map((badge) => (
          <span
            key={badge.id}
            className="pointer-events-none absolute -translate-y-full rounded-full border border-(--line) bg-(--bg-elev) px-2 py-0.5 text-[11px] font-medium shadow-sm"
            style={{ left: badge.x, top: badge.y }}
            data-status={badge.status}
            title={badge.id}
          >
            <span
              className={
                badge.status === 'failed'
                  ? 'text-(--red)'
                  : badge.status === 'sent'
                    ? 'text-(--primary)'
                    : 'text-(--ink-2)'
              }
            >
              {STATUS_LABEL[badge.status]}
            </span>
          </span>
        ))}
      </div>

      <div className="absolute top-2 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-1.5">
        <div
          role="toolbar"
          aria-label="Page and sketch tools"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-(--line) bg-(--bg-elev) p-1 text-(--ink) shadow-md"
        >
          {TOOLS.map(([id, label, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              aria-pressed={!hidden && tool === id}
              disabled={id !== 'select' && (hidden || !api)}
              className={button}
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-(--line)" />
          <button
            type="button"
            title="Show or hide the sketch layer"
            aria-pressed={hidden}
            className={button}
            onClick={() => {
              setHidden((h) => !h)
              setTool('select')
            }}
          >
            {hidden ? 'Sketch hidden' : 'Hide sketch'}
          </button>
          <button
            type="button"
            title="Ask Claude to turn the selected shapes into real components"
            disabled={!selected.length || busy || hidden}
            className={`${button} bg-(--primary) text-(--bg) hover:bg-(--primary)`}
            onClick={() => void make()}
          >
            {busy
              ? 'Making…'
              : selected.length
                ? `Make real (${selected.length})`
                : 'Make real'}
          </button>
        </div>
        {(status.kind !== 'idle' || note || shown.length > 0 || failure) && (
          <div className="flex max-w-xl flex-col gap-1 rounded-lg border border-(--line) bg-(--bg-elev) px-2.5 py-1.5 text-xs text-(--ink) shadow-md">
            {failure && (
              <span role="alert" className="text-(--red)">
                The sketch layer could not start: {failure}
              </span>
            )}
            {status.kind === 'saving' && <span>Saving the sketch…</span>}
            {status.kind === 'saved' && <span>Sketch saved</span>}
            {status.kind === 'error' && (
              <span role="alert" className="text-(--red)">
                {status.message}
              </span>
            )}
            {(status.kind === 'conflict' || external) && (
              <span role="alert" className="flex items-center gap-2">
                {status.kind === 'conflict'
                  ? `Conflict: ${status.message}`
                  : 'The sketch changed on disk.'}
                <button
                  type="button"
                  className={button}
                  onClick={() => void reloadFromDisk()}
                >
                  Reload
                </button>
                {status.kind === 'conflict' && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => void flush(true)}
                  >
                    Overwrite
                  </button>
                )}
              </span>
            )}
            {note && <span aria-live="polite">{note}</span>}
            {shown.map((request) => (
              <span
                key={request.id}
                className="flex items-center gap-2"
                data-request={request.id}
              >
                <span className="font-mono">{request.id}</span>
                <span
                  className={
                    request.status === 'failed'
                      ? 'text-(--red)'
                      : request.status === 'sent'
                        ? 'text-(--primary)'
                        : 'text-(--ink-2)'
                  }
                >
                  {STATUS_LABEL[request.status]}
                </span>
                <span className="text-(--ink-3)">
                  {request.shapeIds.length} shape
                  {request.shapeIds.length === 1 ? '' : 's'}
                </span>
                {(request.status === 'pending' ||
                  request.status === 'sent') && (
                  <button
                    type="button"
                    className={button}
                    title="Without the channel, paste this in your Claude Code session"
                    onClick={() => copy(request)}
                  >
                    Copy command
                  </button>
                )}
                {request.status !== 'pending' &&
                  request.status !== 'sent' &&
                  request.resolution && (
                    <span className="truncate text-(--ink-3)">
                      {request.resolution}
                    </span>
                  )}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
