/* Excalidraw hands back missing elements and states at runtime that its types call present. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { renderPath } from '#/components/shell/page-frame'
import type { PageRef } from '#/components/shell/page-frame'
import { NOTHING, useInspected } from '#/inspector/inspect-state'
import { pushSelection } from '#/inspector/selection-client'
import type { PageSummary, SketchRequest } from '#/server/design-project'
import {
  getPageSource,
  getWireframe,
  listSketchRequests,
  makeReal,
  removeWireframe,
  saveWireframe,
} from '#/server/functions'
import { parseScene } from '#/server/wireframe'
import type { WireframeMeta } from '#/server/wireframe'
import { onStudioMessage } from '#/studio-events'
import { useShell } from '#/studio/shell-state'
import { blankScene, sceneFromPage, wireframePng } from '#/wireframe/build'
import { FONT_FAMILY, ROUGHNESS } from '#/wireframe/generate'
import { PageBar, button, primaryButton } from './page-bar'

type Excalidraw = Awaited<ReturnType<typeof loadExcalidraw>>
const loadExcalidraw = () => import('@excalidraw/excalidraw')

/** One object for good: Excalidraw re-renders itself when it gets a new one. Files and the theme are the studio's. */
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: true,
    export: false as const,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: true,
    toggleTheme: false,
  },
  tools: { image: false },
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

const STATUS_LABEL: Record<SketchRequest['status'], string> = {
  pending: 'Pending',
  sent: 'Sent to Claude',
  done: 'Done',
  failed: 'Failed',
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const signatureOf = (elements: readonly { id: string; version: number }[]) =>
  elements.map((el) => `${el.id}:${el.version}`).join(',')

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** The wireframes of a page: pick one, start a new one, draw on it, and ask Claude to make it real. */
export function WireframeWorkspace({
  summary,
  wireframe,
}: {
  summary: PageSummary
  /** The wireframe to open; null when the page has none yet. */
  wireframe: string | null
}) {
  const navigate = useNavigate()
  const page: PageRef = { kind: summary.kind, name: summary.name }
  const [creating, setCreating] = useState(false)
  const { publish } = useInspected()

  useEffect(() => {
    publish(NOTHING)
    pushSelection(
      { ...page, variant: 'wireframe', ...(wireframe && { wireframe }) },
      null,
    )
    return () => pushSelection(null, null)
  }, [page.kind, page.name, wireframe, publish])

  const open = (name: string) =>
    navigate({
      to: '/pages/$kind/$name',
      params: page,
      search: { variant: 'wireframe', wireframe: name },
    })

  const picker = (
    <>
      {summary.wireframes.length > 0 && (
        <select
          aria-label="Wireframe"
          value={wireframe ?? ''}
          onChange={(e) => void open(e.target.value)}
          className="h-7 rounded-md border border-(--line) bg-(--bg) px-1.5 text-xs text-(--ink)"
        >
          {summary.wireframes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className={button}
        aria-expanded={creating}
        onClick={() => setCreating((c) => !c)}
      >
        New wireframe
      </button>
    </>
  )

  return (
    <div className="flex h-full flex-col">
      {creating || !wireframe ? (
        <>
          <PageBar summary={summary} view={{ variant: 'wireframe', wireframe }}>
            {picker}
          </PageBar>
          <NewWireframe
            summary={summary}
            onCancel={wireframe ? () => setCreating(false) : null}
            onCreated={(name) => {
              setCreating(false)
              void open(name)
            }}
          />
        </>
      ) : (
        <WireframeCanvas
          key={wireframe}
          summary={summary}
          wireframe={wireframe}
          picker={picker}
        />
      )}
    </div>
  )
}

/** Where a new wireframe starts from: a proposal version, the reference, or nothing. */
type Origin =
  | { variant: 'proposal'; version: string }
  | { variant: 'reference' }
  | { variant: 'blank' }

const originKey = (o: Origin) =>
  o.variant === 'proposal' ? `proposal:${o.version}` : o.variant

function NewWireframe({
  summary,
  onCancel,
  onCreated,
}: {
  summary: PageSummary
  onCancel: (() => void) | null
  onCreated: (name: string) => void
}) {
  const router = useRouter()
  const page: PageRef = { kind: summary.kind, name: summary.name }
  const origins: Origin[] = [
    ...(summary.hasProposal
      ? [{ variant: 'proposal' as const, version: 'a' }]
      : []),
    ...summary.alternates.map((v) => ({
      variant: 'proposal' as const,
      version: v,
    })),
    ...(summary.hasReference ? [{ variant: 'reference' as const }] : []),
    { variant: 'blank' },
  ]
  const free = (base: string) => {
    if (!summary.wireframes.includes(base)) return base
    let n = 2
    while (summary.wireframes.includes(`${base}-${n}`)) n++
    return `${base}-${n}`
  }
  const [name, setName] = useState(
    free(summary.wireframes.length ? 'idea' : 'main'),
  )
  const [from, setFrom] = useState(originKey(origins[0]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = (o: Origin) =>
    o.variant === 'blank'
      ? 'Blank'
      : o.variant === 'reference'
        ? 'The reference (the current code)'
        : o.version === 'a'
          ? 'The proposal'
          : `Alternate ${o.version.toUpperCase()}`

  const create = async () => {
    const trimmed = name.trim()
    if (!NAME.test(trimmed))
      return setError('The name is kebab-case: letters, digits and dashes.')
    const origin = origins.find((o) => originKey(o) === from) ?? origins[0]
    setBusy(true)
    setError(null)
    try {
      let json: string
      let note: string | null = null
      if (origin.variant === 'blank') json = blankScene(summary.width)
      else {
        const version = origin.variant === 'proposal' ? origin.version : null
        const source = await getPageSource({
          data: {
            ...page,
            variant: origin.variant,
            ...(version && { version }),
          },
        })
        const drawn = await sceneFromPage(
          renderPath(page, origin.variant, version ?? 'a'),
          summary.width,
          { variant: origin.variant, version, hash: source.hash },
        )
        json = drawn.json
        if (drawn.truncated)
          note = 'The page is large: only its first shapes were drawn.'
      }
      const result = await saveWireframe({
        data: { ...page, wireframe: trimmed, json, baseHash: null },
      })
      if (!result.ok) return setError(result.message)
      if (note) window.alert(note)
      await router.invalidate()
      onCreated(trimmed)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'h-8 rounded-md border border-(--line) bg-(--bg) px-2 text-[13px] text-(--ink)'
  return (
    <form
      className="mx-auto mt-10 flex w-full max-w-md flex-col gap-3 rounded-lg border border-(--line) bg-(--bg-elev) p-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        void create()
      }}
    >
      <h2 className="text-base font-semibold">New wireframe</h2>
      <p className="text-xs text-(--ink-2)">
        Draw ideas on a sketch of the page, then ask Claude to make them real:
        Claude writes a new version of the proposal for you to compare.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-(--ink-2)">Start from</span>
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={field}
        >
          {origins.map((o) => (
            <option key={originKey(o)} value={originKey(o)}>
              {label(o)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-(--ink-2)">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name-in-kebab-case"
          className={field}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-(--red)">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Drawing the page…' : 'Create'}
        </button>
        {onCancel && (
          <button type="button" className={button} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * One wireframe in Excalidraw. It autosaves to its file against the hash it was read at (a conflict offers Reload or
 * Overwrite), reloads when it changes on disk, and Make real records a request for the selection or the whole drawing.
 */
function WireframeCanvas({
  summary,
  wireframe,
  picker,
}: {
  summary: PageSummary
  wireframe: string
  picker: React.ReactNode
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const shell = useShell()
  const page: PageRef = { kind: summary.kind, name: summary.name }
  const [lib, setLib] = useState<Excalidraw | null>(null)
  const [initial, setInitial] = useState<{
    elements: ExcalidrawElement[]
    files: BinaryFiles
  } | null>(null)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [external, setExternal] = useState<'changed' | 'deleted' | null>(null)
  const [requests, setRequests] = useState<SketchRequest[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const hash = useRef('')
  const meta = useRef<WireframeMeta | null>(null)
  const savedSig = useRef('')
  const seenSig = useRef('')
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mine = useRef(new Set<string>())

  const initialData = useMemo(
    () =>
      initial && {
        elements: initial.elements,
        files: initial.files,
        appState: {
          viewBackgroundColor: '#ffffff',
          currentItemStrokeColor: '#1e1e1e',
          currentItemBackgroundColor: 'transparent',
          currentItemRoughness: ROUGHNESS,
          currentItemFontFamily: FONT_FAMILY,
        },
        scrollToContent: true,
      },
    [initial],
  )

  const read = async () => {
    const result = await getWireframe({ data: { ...page, wireframe } })
    if (!result.ok) throw new Error(result.message)
    const scene = parseScene(result.json)
    hash.current = result.hash
    meta.current = scene.studio ?? null
    savedSig.current = signatureOf(
      scene.elements as unknown as ExcalidrawElement[],
    )
    dirty.current = false
    return {
      elements: scene.elements as unknown as ExcalidrawElement[],
      files: (scene.files ?? {}) as BinaryFiles,
    }
  }

  // Excalidraw is client only: load it, its fonts from the studio itself, the wireframe and its requests.
  useEffect(() => {
    let gone = false
    ;(window as unknown as Record<string, string>).EXCALIDRAW_ASSET_PATH =
      '/excalidraw-assets/'
    Promise.all([
      loadExcalidraw(),
      import('@excalidraw/excalidraw/index.css'),
      read(),
      listSketchRequests({ data: page }),
    ])
      .then(([mod, , scene, list]) => {
        if (gone) return
        setInitial(scene)
        setRequests(list.filter((r) => r.wireframe === wireframe))
        setLib(mod)
      })
      .catch((error: unknown) => setFailure(message(error)))
    return () => {
      gone = true
    }
  }, [page.kind, page.name, wireframe])

  /** The file's JSON: Excalidraw's own, plus the studio's key it does not know about. */
  const fileJson = () => {
    if (!api || !lib) return null
    const scene = JSON.parse(
      lib.serializeAsJSON(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
        'local',
      ),
    ) as Record<string, unknown>
    return JSON.stringify({ ...scene, studio: meta.current }, null, 2)
  }

  /** Writes the wireframe now. False when it could not be saved (a conflict, an error). */
  const flush = async (overwrite = false): Promise<boolean> => {
    clearTimeout(timer.current)
    if (!dirty.current && !overwrite) return true
    const json = fileJson()
    if (json === null) return true
    setStatus({ kind: 'saving' })
    try {
      let baseHash: string | null = hash.current
      if (overwrite) {
        const now = await getWireframe({ data: { ...page, wireframe } })
        baseHash = now.ok ? now.hash : null
      }
      const result = await saveWireframe({
        data: { ...page, wireframe, json, baseHash },
      })
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
      savedSig.current = signatureOf(api!.getSceneElementsIncludingDeleted())
      dirty.current = false
      setExternal(null)
      setStatus({ kind: 'saved' })
      return true
    } catch (error) {
      setStatus({ kind: 'error', message: message(error) })
      return false
    }
  }
  const flushRef = useRef(flush)
  flushRef.current = flush

  const reload = async () => {
    if (!api || !lib) return
    try {
      const scene = await read()
      api.updateScene({
        elements: scene.elements,
        captureUpdate: lib.CaptureUpdateAction.NEVER,
      })
      setExternal(null)
      setStatus({ kind: 'idle' })
    } catch (error) {
      setStatus({ kind: 'error', message: message(error) })
    }
  }
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  // Ctrl+S saves now; leaving with unsaved strokes asks; a pending save goes out when the view closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void flushRef.current()
      }
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
      if (dirty.current) void flushRef.current()
    }
  }, [])

  // The wireframe changed on disk; requests changed status.
  useEffect(
    () =>
      onStudioMessage((msg) => {
        if (msg.type !== 'change') return
        const { event } = msg
        if (
          event.kind === 'wireframe' &&
          event.pageKind === page.kind &&
          event.name === page.name &&
          event.wireframe === wireframe
        ) {
          if (event.hash === null) setExternal('deleted')
          else if (event.hash !== hash.current && !mine.current.has(event.hash))
            if (dirty.current) setExternal('changed')
            else void reloadRef.current()
        }
        if (
          event.kind === 'request' &&
          event.request.page.kind === page.kind &&
          event.request.page.name === page.name &&
          event.request.wireframe === wireframe
        )
          setRequests((list) => [
            event.request,
            ...list.filter((r) => r.id !== event.request.id),
          ])
      }),
    [page.kind, page.name, wireframe],
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
    // Excalidraw calls this after every one of its updates, ours included: act only on a change of the scene.
    const sig = signatureOf(elements)
    if (sig === seenSig.current) return
    seenSig.current = sig
    if (sig === savedSig.current) return
    dirty.current = true
    setStatus((s) => (s.kind === 'conflict' ? s : { kind: 'idle' }))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flushRef.current(), 700)
  }

  const live = () => api?.getSceneElements() ?? []

  const make = async () => {
    if (!api || busy) return
    setBusy(true)
    setNote(null)
    try {
      if (!(await flush())) return
      const elements = live()
      const wanted = new Set(selected)
      // The selected shapes and the text written inside them; nothing selected is the whole wireframe.
      const shown = wanted.size
        ? elements.filter(
            (el) =>
              wanted.has(el.id) ||
              ('containerId' in el &&
                el.containerId &&
                wanted.has(el.containerId)),
          )
        : elements
      if (!shown.length) return setNote('The wireframe is empty.')
      const png = await wireframePng(shown, api.getFiles())
      const result = await makeReal({
        data: { ...page, wireframe, shapeIds: [...wanted], png },
      })
      if (!result.ok) return setNote(result.message)
      setRequests((list) => [
        result.request,
        ...list.filter((r) => r.id !== result.request.id),
      ])
      api.updateScene({ appState: { selectedElementIds: {} } as never })
      setNote(
        `Request ${result.request.id} made: Claude writes it as a new version.`,
      )
    } catch (error) {
      setNote(message(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete the wireframe "${wireframe}"?`)) return
    clearTimeout(timer.current)
    dirty.current = false
    const result = await removeWireframe({ data: { ...page, wireframe } })
    if (!result.ok) return setNote(result.message)
    await router.invalidate()
    await navigate({
      to: '/pages/$kind/$name',
      params: page,
      search: { variant: 'wireframe' },
    })
  }

  const copy = (request: SketchRequest) => {
    const command = `/design-sketch ${request.id}`
    void navigator.clipboard
      .writeText(command)
      .then(() => setNote(`Copied ${command}`))
      .catch(() => setNote(command))
  }

  const open = requests.filter(
    (r) => r.status === 'pending' || r.status === 'sent',
  )
  const closed = requests.filter(
    (r) => r.status === 'done' || r.status === 'failed',
  )
  const shown = [...open, ...closed.slice(0, 2)]
  const base = meta.current?.base

  return (
    <>
      <PageBar summary={summary} view={{ variant: 'wireframe', wireframe }}>
        {picker}
        <span className="text-xs text-(--ink-3)" aria-live="polite">
          {status.kind === 'saving'
            ? 'Saving…'
            : status.kind === 'saved'
              ? 'Saved'
              : base
                ? `From ${base.variant === 'reference' ? 'the reference' : base.version === 'a' ? 'the proposal' : `version ${base.version?.toUpperCase()}`}`
                : ''}
        </span>
        <button type="button" className={button} onClick={() => void remove()}>
          Delete
        </button>
        <button
          type="button"
          className={primaryButton}
          title="Ask Claude to turn the selected shapes (or the whole wireframe) into a new version of the page"
          disabled={!api || busy}
          onClick={() => void make()}
        >
          {busy
            ? 'Making…'
            : selected.length
              ? `Make real (${selected.length} selected)`
              : 'Make real (all)'}
        </button>
      </PageBar>
      {(failure ||
        status.kind === 'error' ||
        status.kind === 'conflict' ||
        external ||
        note ||
        shown.length > 0) && (
        <div className="flex flex-col gap-1 border-b border-(--line) bg-(--bg-2) px-4 py-1.5 text-xs">
          {failure && (
            <span role="alert" className="text-(--red)">
              The wireframe could not open: {failure}
            </span>
          )}
          {status.kind === 'error' && (
            <span role="alert" className="text-(--red)">
              {status.message}
            </span>
          )}
          {(status.kind === 'conflict' || external) && (
            <span role="alert" className="flex items-center gap-2">
              {status.kind === 'conflict'
                ? `Conflict: ${status.message}`
                : external === 'deleted'
                  ? 'This wireframe was deleted on disk.'
                  : 'This wireframe changed on disk.'}
              {external !== 'deleted' && (
                <button
                  type="button"
                  className={button}
                  onClick={() => void reload()}
                >
                  Reload
                </button>
              )}
              <button
                type="button"
                className={button}
                onClick={() => void flush(true)}
              >
                {external === 'deleted' ? 'Save it again' : 'Overwrite'}
              </button>
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
                {request.shapeIds.length
                  ? `${request.shapeIds.length} shape${request.shapeIds.length === 1 ? '' : 's'}`
                  : 'whole wireframe'}
              </span>
              {(request.status === 'pending' || request.status === 'sent') && (
                <button
                  type="button"
                  className={button}
                  title="Without the channel, paste this in your Claude Code session"
                  onClick={() => copy(request)}
                >
                  Copy command
                </button>
              )}
              {request.status === 'done' && request.version && (
                <Link
                  to="/pages/$kind/$name"
                  params={page}
                  search={{ variant: 'proposal', version: request.version }}
                  className="font-medium text-(--primary) underline"
                >
                  Open version {request.version.toUpperCase()}
                </Link>
              )}
              {request.resolution && (
                <span className="truncate text-(--ink-3)">
                  {request.resolution}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="ds-wireframe relative min-h-0 flex-1">
        {lib && initialData && (
          <lib.Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={onChange}
            UIOptions={UI_OPTIONS}
            theme={shell.mode}
            name={`${summary.name} / ${wireframe}`}
          />
        )}
      </div>
    </>
  )
}
