import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { PageFrame } from '#/components/shell/page-frame'
import type { PageRef } from '#/components/shell/page-frame'
import { swapToken } from '#/inspector/inspect'
import { NOTHING, useInspected } from '#/inspector/inspect-state'
import type { Picked } from '#/inspector/pick'
import { pushSelection } from '#/inspector/selection-client'
import type { TraceRow } from '#/inspector/trace'
import { applySwap } from '#/proposal/swap'
import type { PageSummary } from '#/server/design-project'
import {
  createPageProposal,
  getPageSource,
  savePageProposal,
} from '#/server/functions'
import { onStudioMessage } from '#/studio-events'
import { PageBar, button } from './page-bar'

/** One swap the user can take back: the page before it, and the hash the swap left (undo only applies on top of it). */
interface Step {
  html: string
  after: string
}

/**
 * The realistic view: a reference or a proposal version, rendered as is. Claude edits it; the user only inspects it and,
 * on a proposal, swaps an element's token from the footer's Inspect tab. Each swap is saved at once against the hash
 * the page was read at, and can be undone. Mount it with a key per page, variant and version.
 */
export function HtmlView({
  summary,
  variant,
  version,
  source,
}: {
  summary: PageSummary
  variant: 'reference' | 'proposal'
  version: string
  source: { html: string; hash: string }
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const page: PageRef = { kind: summary.kind, name: summary.name }
  const editable = variant === 'proposal'
  const [picked, setPicked] = useState<Picked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<Step[]>([])
  const loaded = useRef(source)
  const { publish } = useInspected()
  const selection = {
    ...page,
    variant,
    ...(editable && { version }),
  } as const

  useEffect(() => {
    pushSelection(selection, null)
    return () => pushSelection(null, null)
  }, [page.kind, page.name, variant, version])

  // Claude (or another tab) wrote this version: read it again, so the next swap starts from it.
  useEffect(() => {
    if (!editable) return
    return onStudioMessage((message) => {
      if (message.type !== 'change') return
      const { event } = message
      if (
        event.kind !== 'page' ||
        event.pageKind !== page.kind ||
        event.name !== page.name ||
        event.variant !== 'proposal' ||
        event.version !== version ||
        event.hash === null ||
        event.hash === loaded.current.hash
      )
        return
      void getPageSource({ data: { ...page, variant, version } }).then(
        (next) => {
          loaded.current = next
        },
      )
    })
  }, [editable, page.kind, page.name, version])

  /** Writes `html` over the version as last read. Returns the new hash, or null (and says why). */
  const write = async (html: string): Promise<string | null> => {
    const result = await savePageProposal({
      data: { ...page, html, baseHash: loaded.current.hash, version },
    })
    if (result.ok) {
      loaded.current = { html, hash: result.hash }
      return result.hash
    }
    if (result.error === 'Conflict') {
      loaded.current = await getPageSource({
        data: { ...page, variant, version },
      })
      setUndo([])
      setNote('The page changed meanwhile: it was reloaded, try again.')
    } else setNote(result.message)
    return null
  }

  const swap = async (row: TraceRow, token: string) => {
    if (!picked || busy) return
    setBusy(true)
    setNote(null)
    try {
      const before = loaded.current.html
      const next = applySwap(before, {
        selector: picked.selector,
        property: row.property,
        value: swapToken(row.declared, token),
      })
      const hash = await write(next.html)
      if (!hash) return
      setPicked({ ...picked, selector: next.selector })
      setUndo((steps) => [...steps.slice(-49), { html: before, after: hash }])
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const takeBack = async () => {
    const step = undo.at(-1)
    if (!step || busy) return
    if (step.after !== loaded.current.hash) {
      setUndo([])
      setNote('The page changed since: nothing to undo.')
      return
    }
    setBusy(true)
    try {
      if (await write(step.html)) setUndo((steps) => steps.slice(0, -1))
    } finally {
      setBusy(false)
    }
  }

  const createProposal = async () => {
    const result = await createPageProposal({ data: page })
    // "Already exists" is fine: open it.
    if (!result.ok && result.error !== 'Conflict') {
      setNote(result.message)
      return
    }
    await router.invalidate()
    await navigate({
      to: '/pages/$kind/$name',
      params: page,
      search: { variant: 'proposal' },
    })
  }

  const swapRef = useRef(swap)
  swapRef.current = swap
  const createRef = useRef(createProposal)
  createRef.current = createProposal

  // The footer's Inspect tab shows the picked element and, on a proposal, swaps its tokens.
  useEffect(() => {
    publish({
      picked,
      swap: editable ? (row, token) => void swapRef.current(row, token) : null,
      createProposal:
        editable || summary.hasProposal ? null : () => void createRef.current(),
    })
  }, [picked, editable, summary.hasProposal, publish])
  useEffect(() => () => publish(NOTHING), [publish])

  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        void takeBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex h-full flex-col">
      <PageBar
        summary={summary}
        view={variant === 'reference' ? { variant } : { variant, version }}
      >
        <span className="text-xs text-(--ink-3)" aria-live="polite">
          {busy
            ? 'Saving…'
            : (note ??
              (editable
                ? 'Ask Claude for changes; swap tokens from Inspect'
                : 'Read only'))}
        </span>
        {editable && (
          <button
            type="button"
            className={button}
            title="Undo the last token swap (Ctrl+Z)"
            disabled={!undo.length || busy}
            onClick={() => void takeBack()}
          >
            Undo swap
          </button>
        )}
        {!editable && !summary.hasProposal && (
          <button
            type="button"
            className={button}
            onClick={() => void createProposal()}
          >
            Create proposal
          </button>
        )}
      </PageBar>
      <div className="min-h-0 flex-1">
        <PageFrame
          page={page}
          variant={variant}
          version={version}
          reselect={picked?.selector ?? null}
          onPick={(p) => {
            setPicked(p)
            pushSelection(selection, p)
          }}
        />
      </div>
    </div>
  )
}
