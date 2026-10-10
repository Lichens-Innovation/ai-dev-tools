import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { PageFrame } from '#/components/shell/page-frame'
import type { PageRef, Variant } from '#/components/shell/page-frame'
import type { Picked } from '#/inspector/pick'
import { NOTHING, useInspected } from '#/inspector/inspect-state'
import { pushSelection } from '#/inspector/selection-client'
import {
  createPageProposal,
  getPageSource,
  savePageProposal,
} from '#/server/functions'
import { onStudioMessage } from '#/studio-events'
import { PageEditor } from './page-editor'
import type { EditorController } from './page-editor'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

const button =
  'h-7 cursor-pointer rounded-md border border-(--line) px-3 text-xs font-medium hover:bg-(--bg-2) disabled:cursor-default disabled:opacity-40'

/**
 * A page and its tools. A reference is a read-only snapshot you can inspect; a proposal opens in the editor and is
 * saved to its file against the hash it was read at. Mount it with a key per page and variant.
 */
export function PageWorkspace({
  page,
  variant,
  hasProposal,
  hasReference,
  source,
}: {
  page: PageRef
  variant: Variant
  hasProposal: boolean
  /** False for a blank page: there is nothing captured to compare with. */
  hasReference: boolean
  source: { html: string; hash: string }
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const editable = variant === 'proposal'
  const controller = useRef<EditorController | null>(null)
  const mine = useRef(new Set<string>())
  const [loaded, setLoaded] = useState(source)
  const [session, setSession] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [external, setExternal] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [picked, setPicked] = useState<Picked | null>(null)
  const { publish } = useInspected()

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const reloadRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const open = (target: 'reference' | 'proposal') =>
    navigate({
      to: '/pages/$kind/$name',
      params: page,
      search: { variant: target },
    })

  // The page is open: MCP get_selection says so, even before anything is selected.
  useEffect(() => {
    pushSelection({ ...page, variant }, null)
    return () => pushSelection(null, null)
  }, [page.kind, page.name, variant])

  // Somebody else wrote the open proposal (Claude over MCP, an editor): offer to reload it.
  useEffect(() => {
    if (!editable) return
    return onStudioMessage((message) => {
      if (message.type !== 'change') return
      const { event } = message
      // Claude resolved a Make real request on this page as done: its change is in the proposal, so reload it.
      if (
        event.kind === 'request' &&
        event.request.status === 'done' &&
        event.request.page.kind === page.kind &&
        event.request.page.name === page.name
      ) {
        if (dirtyRef.current) setExternal(true)
        else void reloadRef.current()
        return
      }
      if (event.kind !== 'page') return
      if (
        event.pageKind === page.kind &&
        event.name === page.name &&
        event.variant === 'proposal' &&
        event.hash !== loaded.hash &&
        !mine.current.has(event.hash)
      )
        setExternal(true)
    })
  }, [editable, page.kind, page.name, loaded.hash])

  const save = async (overwrite = false) => {
    const ctl = controller.current
    if (!ctl || status.kind === 'saving') return
    setStatus({ kind: 'saving' })
    try {
      // Overwriting means saving on top of whatever is on disk now.
      const baseHash = overwrite
        ? (await getPageSource({ data: { ...page, variant } })).hash
        : loaded.hash
      const result = await savePageProposal({
        data: { ...page, html: ctl.serialize(), baseHash },
      })
      if (!result.ok) {
        setStatus(
          result.error === 'Conflict'
            ? { kind: 'conflict', message: result.message }
            : { kind: 'error', message: result.message },
        )
        return
      }
      mine.current.add(result.hash)
      setLoaded({ html: loaded.html, hash: result.hash })
      ctl.markClean()
      setDirty(false)
      setExternal(false)
      setStatus({ kind: 'saved' })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const reload = async () => {
    const next = await getPageSource({ data: { ...page, variant } })
    setLoaded(next)
    setDirty(false)
    setExternal(false)
    setStatus({ kind: 'idle' })
    setSession((n) => n + 1)
  }

  reloadRef.current = reload

  const createProposal = async () => {
    const result = await createPageProposal({ data: page })
    // "Already exists" is fine: open it.
    if (!result.ok && result.error !== 'Conflict') {
      setStatus({ kind: 'error', message: result.message })
      return
    }
    await router.invalidate()
    await open('proposal')
  }

  const saveRef = useRef(save)
  saveRef.current = save
  const createRef = useRef(createProposal)
  createRef.current = createProposal

  // The footer's Inspect tab shows the picked element, and can switch its tokens in a proposal.
  useEffect(() => {
    publish({
      picked,
      swap: editable
        ? (row, token) => controller.current?.swap(row, token)
        : null,
      createProposal: editable ? null : () => void createRef.current(),
    })
  }, [picked, editable, publish])
  useEffect(() => () => publish(NOTHING), [publish])
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [editable, dirty])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-(--line) px-4 py-1.5 text-sm">
        <span className="font-medium">
          {page.kind} / {page.name}
        </span>
        {(['reference', 'proposal'] as const).map((v) =>
          v === 'reference' && !hasReference ? null : v === 'proposal' &&
            !hasProposal ? (
            <span key={v} className="opacity-40" title="No proposal yet">
              {v}
            </span>
          ) : (
            <Link
              key={v}
              to="/pages/$kind/$name"
              params={page}
              search={{ variant: v }}
              className={
                v === variant ? 'font-semibold underline' : 'opacity-60'
              }
            >
              {v}
            </Link>
          ),
        )}
        <span className="flex-1" />
        {!editable && (
          <>
            <span className="text-xs text-(--ink-3)">Read only</span>
            {!hasProposal && (
              <button
                type="button"
                className={button}
                onClick={() => void createProposal()}
              >
                Create proposal
              </button>
            )}
          </>
        )}
        {editable && (
          <>
            <button
              type="button"
              className={button}
              onClick={() => controller.current?.undo()}
            >
              Undo
            </button>
            <button
              type="button"
              className={button}
              onClick={() => controller.current?.redo()}
            >
              Redo
            </button>
            <span className="text-xs text-(--ink-3)" aria-live="polite">
              {status.kind === 'saving'
                ? 'Saving…'
                : status.kind === 'saved' && !dirty
                  ? 'Saved'
                  : dirty
                    ? 'Unsaved changes'
                    : ''}
            </span>
            <button
              type="button"
              title="Save (Ctrl+S)"
              className={`${button} bg-(--primary) text-(--bg) hover:bg-(--primary)`}
              disabled={status.kind === 'saving'}
              onClick={() => void save()}
            >
              Save
            </button>
          </>
        )}
      </div>
      {external && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-(--line) bg-(--bg-2) px-4 py-1.5 text-xs"
        >
          This proposal changed on disk.
          {dirty && ' Reloading drops your unsaved edits.'}
          <button
            type="button"
            className={button}
            onClick={() => void reload()}
          >
            Reload
          </button>
        </div>
      )}
      {status.kind === 'conflict' && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-(--line) bg-(--bg-2) px-4 py-1.5 text-xs"
        >
          Conflict: {status.message}
          <button
            type="button"
            className={button}
            onClick={() => void reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className={button}
            onClick={() => void save(true)}
          >
            Overwrite
          </button>
        </div>
      )}
      {status.kind === 'error' && (
        <div
          role="alert"
          className="border-b border-(--line) px-4 py-1.5 text-xs text-(--red)"
        >
          {status.message}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {editable ? (
          <PageEditor
            key={session}
            page={page}
            html={loaded.html}
            controller={controller}
            onDirty={setDirty}
            onSave={() => void saveRef.current()}
            onPick={setPicked}
          />
        ) : (
          <PageFrame
            page={page}
            variant={variant}
            onPick={(p) => {
              setPicked(p)
              pushSelection({ ...page, variant }, p)
            }}
          />
        )}
      </div>
    </div>
  )
}
