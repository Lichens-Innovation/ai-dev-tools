import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Component, Editor } from 'grapesjs'
import { renderPath } from '#/components/shell/page-frame'
import type { PageRef } from '#/components/shell/page-frame'
import { parsePage } from '#/editor/page-document'
import { serializeEditor } from '#/editor/serialize'
import {
  BLOCKS,
  STYLE_SECTORS,
  registerTokenFields,
} from '#/editor/style-fields'
import { pick } from '#/inspector/pick'
import type { Picked } from '#/inspector/pick'
import { pushSelection } from '#/inspector/selection-client'
import { listTokens } from '#/inspector/trace'
import type { TraceRow } from '#/inspector/trace'
import { isEmpty } from '#/palette/draft'
import type { Mode } from '#/palette/draft'
import { usePalette } from '#/palette/palette-state'
import { themeDocument } from '#/palette/theme'
import { useShell } from '#/studio/shell-state'
import { TokenInspector, swapToken } from './token-inspector'

/** What the page toolbar can ask of the open editor. */
export interface EditorController {
  /** The page file with the editor's DOM and rules in it. */
  serialize: () => string
  undo: () => void
  redo: () => void
  /** Forget the unsaved changes (after a save). */
  markClean: () => void
}

type Tab = 'tokens' | 'style' | 'blocks'

const dirOf = (page: PageRef) =>
  renderPath(page, 'proposal').replace(/[^/]*$/, '')

/** The same page, readable from a `srcDoc` frame: relative links resolve against the page's own directory. */
const withBase = (html: string, base: string) =>
  html.replace(/<head\b[^>]*>/i, (m) => `${m}<base href="${base}">`)

function MirrorFrame({
  html,
  base,
  mode,
  css,
}: {
  html: string
  base: string
  mode: Mode
  css: string | null
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const apply = () => {
    const doc = ref.current?.contentDocument
    if (doc?.documentElement) themeDocument(doc, mode, css)
  }
  useEffect(apply, [mode, css])
  // A srcDoc frame skips /render's CSP and runs at the studio's origin, where a script could call /mcp: no scripts.
  return (
    <iframe
      ref={ref}
      sandbox="allow-same-origin"
      title={`Live copy (${mode})`}
      srcDoc={withBase(html, base)}
      onLoad={apply}
      className="h-full w-full border-0 bg-white"
    />
  )
}

/**
 * GrapesJS on a proposal: select, move, resize, edit text, add and remove elements, restyle. The canvas loads the
 * project's stylesheets as plain canvas styles (not parsed into the editor), so a big Tailwind sheet stays fast. What
 * the editor owns is the body and the rules of the page's `<style data-studio>` block.
 */
export function PageEditor({
  page,
  html,
  controller,
  onDirty,
  onSave,
}: {
  page: PageRef
  html: string
  controller: RefObject<EditorController | null>
  onDirty: (dirty: boolean) => void
  onSave: () => void
}) {
  const shell = useShell()
  const palette = usePalette()
  const canvasRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLDivElement>(null)
  const blocksRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const fieldsRef = useRef<ReturnType<typeof registerTokenFields> | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('tokens')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [mirror, setMirror] = useState(html)
  const [failure, setFailure] = useState<string | null>(null)

  const latest = useRef({ onDirty, onSave, page })
  latest.current = { onDirty, onSave, page }

  const css = palette && !isEmpty(palette.draft) ? palette.preview.css : null
  // Side by side: the editor shows light, a live copy shows dark.
  const mode: Mode = shell.sideBySide ? 'light' : shell.mode

  useEffect(() => {
    let disposed = false
    let editor: Editor | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const open = async () => {
      const [{ default: grapesjs }] = await Promise.all([
        import('grapesjs'),
        import('grapesjs/dist/css/grapes.min.css'),
        import('#/editor/gjs-theme.css'),
      ])
      if (disposed || !canvasRef.current) return
      const parts = parsePage(html)
      const base = new URL(renderPath(page, 'proposal'), location.href)
      const styles = parts.stylesheets.map((href) => {
        const url = new URL(href, base)
        return url.pathname + url.search
      })
      editor = grapesjs.init({
        container: canvasRef.current,
        height: '100%',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        components: parts.body,
        style: parts.studioCss,
        protectedCss: parts.otherCss,
        canvas: { styles },
        panels: { defaults: [] },
        deviceManager: { devices: [] },
        // Edit the element itself (an #id rule in the data-studio block), not every element of its class.
        selectorManager: { componentFirst: true },
        blockManager: { appendTo: blocksRef.current!, blocks: BLOCKS },
        styleManager: { appendTo: styleRef.current!, sectors: [] },
      })
      editorRef.current = editor
      fieldsRef.current = registerTokenFields(editor)
      // The sectors come after the field types they use are registered.
      for (const sector of STYLE_SECTORS)
        editor.StyleManager.addSector(sector.name, sector)
      const current = editor

      // Resize handles on every element but the page itself.
      current.on('component:create', (c: Component) => {
        if (c !== current.getWrapper()) c.set('resizable', true)
      })

      const repick = () => {
        const selected = current.getSelected()
        const el = selected?.getEl()
        const next =
          selected && el
            ? pick(el, {
                body: current.getWrapper()?.getEl() ?? undefined,
                html: selected.toHTML({ cleanId: true } as never),
              })
            : null
        setPicked(next)
        pushSelection({ ...latest.current.page, variant: 'proposal' }, next)
      }
      const refreshTokens = () => {
        const doc = current.Canvas.getDocument()
        if (doc) fieldsRef.current?.refresh(listTokens(doc))
      }
      let baseline = html
      const settle = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          repick()
          // Dirty is "differs from what was opened", so undoing back to the start is clean again.
          const out = serializeEditor(current, html)
          latest.current.onDirty(out !== baseline)
          setMirror(out)
        }, 120)
      }
      current.on('component:toggled', repick)
      current.on('update component:update component:styleUpdate', settle)
      current.on(
        'canvas:frame:load',
        ({ window: win }: { window?: Window }) => {
          refreshTokens()
          setReady(true)
          win?.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              latest.current.onSave()
            }
          })
        },
      )
      current.onReady(() => {
        current.getWrapper()?.onAll((c: Component) => {
          if (c !== current.getWrapper()) c.set('resizable', true)
        })
        current.UndoManager.clear()
        baseline = serializeEditor(current, html)
        current.runCommand('sw-visibility')
        setReady(true)
      })

      controller.current = {
        serialize: () => serializeEditor(current, html),
        undo: () => current.UndoManager.undo(),
        redo: () => current.UndoManager.redo(),
        markClean: () => {
          baseline = serializeEditor(current, html)
        },
      }
    }
    open().catch((error: unknown) =>
      setFailure(error instanceof Error ? error.message : String(error)),
    )
    return () => {
      disposed = true
      clearTimeout(timer)
      controller.current = null
      pushSelection(null, null)
      editor?.destroy()
      editorRef.current = null
    }
    // The editor opens on one source; a new source remounts this component.
  }, [])

  // The canvas wears the mode and the palette draft, as the rendered pages do.
  useEffect(() => {
    const editor = editorRef.current
    const doc = editor?.Canvas.getDocument()
    if (!editor || !doc?.documentElement) return
    themeDocument(doc, mode, css)
    fieldsRef.current?.refresh(listTokens(doc))
  }, [ready, mode, css])

  const swap = (row: TraceRow, token: string) => {
    editorRef.current
      ?.getSelected()
      ?.addStyle({ [row.property]: swapToken(row.declared, token) })
  }

  const tabs: [Tab, string][] = [
    ['tokens', 'Tokens'],
    ['style', 'Style'],
    ['blocks', 'Add'],
  ]

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: '1fr 320px' }}>
      <div
        className="grid min-w-0"
        style={{
          gridTemplateColumns: shell.sideBySide ? '1fr 1fr' : '1fr',
        }}
      >
        <div className="ds-gjs relative min-w-0">
          {shell.sideBySide && (
            <div className="border-b border-(--line) bg-(--bg-2) px-3 py-1 text-xs font-medium text-(--ink-2)">
              Light (editing)
            </div>
          )}
          <div
            ref={canvasRef}
            className="w-full"
            style={{ height: shell.sideBySide ? 'calc(100% - 25px)' : '100%' }}
          />
          {failure && (
            <p
              role="alert"
              className="absolute inset-x-0 top-0 bg-(--bg-elev) p-3 text-sm text-(--red)"
            >
              The editor could not start: {failure}
            </p>
          )}
        </div>
        {shell.sideBySide && (
          <div className="flex min-w-0 flex-col border-l border-(--line)">
            <div className="border-b border-(--line) bg-(--bg-2) px-3 py-1 text-xs font-medium text-(--ink-2)">
              Dark (live copy)
            </div>
            <div className="min-h-0 flex-1">
              <MirrorFrame
                html={mirror}
                base={dirOf(page)}
                mode="dark"
                css={css}
              />
            </div>
          </div>
        )}
      </div>
      <aside className="ds-gjs flex min-h-0 flex-col border-l border-(--line) bg-(--bg-elev) text-(--ink)">
        <div role="tablist" className="flex border-b border-(--line)">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="flex-1 cursor-pointer px-3 py-2 text-xs font-medium hover:bg-(--bg-2) aria-selected:text-(--primary) aria-selected:shadow-[inset_0_-2px_0_var(--primary)]"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div hidden={tab !== 'tokens'}>
            <TokenInspector picked={picked} onSwap={swap} />
          </div>
          <div ref={styleRef} hidden={tab !== 'style'} />
          <div ref={blocksRef} hidden={tab !== 'blocks'} />
        </div>
      </aside>
    </div>
  )
}
