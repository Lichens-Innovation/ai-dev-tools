import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  PaletteCheck,
  PalettePreview,
  PaletteState,
} from '#/server/design-project'
import { getPalette, previewPalette, savePalette } from '#/server/functions'
import { onStudioMessage } from '#/studio-events'
import { useShell } from '#/studio/shell-state'
import {
  EMPTY_DRAFT,
  countChanges,
  diffInputs,
  diffOverrides,
  diffTokens,
  isEmpty,
  mergeInputs,
  mergeOverrides,
  mergeTokens,
  modeKey,
  normHex,
  isHex,
  parseDraft,
  rebase,
  toPalette,
  validToken,
} from './draft'
import type { Draft, Mode, Saved } from './draft'

export interface InitialPalette {
  state: PaletteState
  preview: PalettePreview
}

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; written: string[] }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

export interface PaletteContext {
  saved: Saved
  namespace: string | null
  draft: Draft
  /** The saved palette with the draft applied. */
  palette: ReturnType<typeof toPalette>
  /** The engine's output for that palette. */
  preview: PalettePreview
  /** Why the preview could not follow the last change (the previous one stays). */
  previewError: string | null
  changes: number
  /** The failing contrast checks of the drafted palette. */
  failures: PaletteCheck[]
  status: SaveStatus
  /** The inputs file changed on disk after they were read. */
  external: boolean
  /** The token the footer was asked to show (a `design-studio:token` event). */
  focus: { token: string; nonce: number } | null
  setInput: (name: string, mode: Mode, hex: string) => void
  addBrand: () => void
  removeBrand: () => void
  setToken: (name: string, value: string) => void
  setOverride: (token: string, target: string) => void
  reset: () => void
  save: () => Promise<void>
}

const Context = createContext<PaletteContext | null>(null)

/** The palette draft, or null when the project has no palette. */
export const usePalette = () => useContext(Context)

const draftKey = (root: string) => `design-studio:${root}:draft`
const TOKEN_EVENT = 'design-studio:token'

const savedOf = (state: PaletteState): Saved => ({
  inputs: state.inputs,
  tokens: state.tokens,
  overrides: state.overrides,
  hash: state.hash,
})

/** The draft shared by the footer and the palette page, previewed by the project's palette engine. */
export function PaletteProvider({
  initial,
  children,
}: {
  initial: InitialPalette | null
  children: ReactNode
}) {
  if (!initial) return <>{children}</>
  return <Loaded initial={initial}>{children}</Loaded>
}

function Loaded({
  initial,
  children,
}: {
  initial: InitialPalette
  children: ReactNode
}) {
  const shell = useShell()
  const [saved, setSaved] = useState(() => savedOf(initial.state))
  const [namespace, setNamespace] = useState(initial.state.namespace)
  const [basePreview, setBasePreview] = useState(initial.preview)
  const [preview, setPreview] = useState(initial.preview)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })
  const [diskHash, setDiskHash] = useState<string | null>(null)
  const [focus, setFocus] = useState<PaletteContext['focus']>(null)
  const [stored, setStored] = useState(false)
  const sequence = useRef(0)

  // The draft is kept in the browser for the project.
  useEffect(() => {
    try {
      const value = parseDraft(localStorage.getItem(draftKey(shell.root)))
      setDraft(rebase(saved, saved, value))
    } catch {
      // No storage: the draft lasts for the tab.
    }
    setStored(true)
    // Read once, against the palette the page was loaded with.
  }, [shell.root])

  useEffect(() => {
    if (!stored) return
    try {
      if (isEmpty(draft)) localStorage.removeItem(draftKey(shell.root))
      else localStorage.setItem(draftKey(shell.root), JSON.stringify(draft))
    } catch {
      // See above.
    }
  }, [draft, stored, shell.root])

  // Re-run the engine on the drafted palette; the saved one is already previewed.
  useEffect(() => {
    if (isEmpty(draft)) {
      setPreview(basePreview)
      setPreviewError(null)
      return
    }
    const id = ++sequence.current
    const timer = setTimeout(() => {
      void previewPalette({ data: toPalette(saved, draft) }).then((result) => {
        if (id !== sequence.current) return
        if (result.ok) {
          setPreview(result.preview)
          setPreviewError(null)
        } else setPreviewError(result.message)
      })
    }, 60)
    return () => clearTimeout(timer)
  }, [draft, saved, basePreview])

  // The inputs file changing on disk is shown, not applied: a save then reports the conflict.
  useEffect(
    () =>
      onStudioMessage((message) => {
        if (message.type === 'change' && message.event.kind === 'palette')
          setDiskHash(message.event.hash)
      }),
    [],
  )

  // The editor's token inspector hands a token over.
  useEffect(() => {
    const onToken = (event: Event) => {
      const raw = (event as CustomEvent<{ token?: unknown } | null>).detail
        ?.token
      if (typeof raw !== 'string') return
      const token = raw.trim().replace(/^--/, '')
      if (!/^[a-z][a-z0-9-]*$/.test(token)) return
      const handled =
        token in toPalette(saved, draft).inputs ||
        token in toPalette(saved, draft).tokens
      shell.setFooterOpen(true)
      // A generated token only shows in the Full palette; Inspect has no token fields to land on.
      if (!handled) shell.setFooterTab('full')
      else if (shell.footerTab === 'inspect') shell.setFooterTab('palette')
      setFocus({ token, nonce: Date.now() })
    }
    window.addEventListener(TOKEN_EVENT, onToken)
    return () => window.removeEventListener(TOKEN_EVENT, onToken)
  })

  const palette = toPalette(saved, draft)

  const setInputs = (inputs: Draft['inputs']) => setDraft({ ...draft, inputs })

  const value: PaletteContext = {
    saved,
    namespace,
    draft,
    palette,
    preview,
    previewError,
    changes: countChanges(draft),
    failures: preview.audit.filter((c) => !c.pass && c.level === 'fail'),
    status,
    external: diskHash !== null && diskHash !== saved.hash,
    focus,
    setInput(name, mode, hex) {
      const inputs = mergeInputs(saved, draft)
      if (!(name in inputs) || !isHex(hex)) return
      inputs[name] = { ...inputs[name], [modeKey(mode)]: normHex(hex) }
      setInputs(diffInputs(saved, inputs))
    },
    addBrand() {
      const inputs = mergeInputs(saved, draft)
      const names = preview.brand
      const next = [
        'primary',
        'secondary',
        'tertiary',
        'quaternary',
        'quinary',
      ][names.length] as string | undefined
      if (!next) return
      const color =
        ['#453f78', '#759aab', '#faf2a1'][names.length - 2] ?? '#888888'
      inputs[next] = { lm: color, dm: color }
      setInputs(diffInputs(saved, inputs))
    },
    removeBrand() {
      const last = preview.brand[preview.brand.length - 1] as string | undefined
      if (!last || preview.brand.length <= 2) return
      const inputs = mergeInputs(saved, draft)

      delete inputs[last]
      setInputs(diffInputs(saved, inputs))
    },
    setToken(name, tokenValue) {
      if (!validToken(tokenValue)) return
      setDraft({
        ...draft,
        tokens: diffTokens(saved, {
          ...mergeTokens(saved, draft),
          [name]: tokenValue,
        }),
      })
    },
    setOverride(token, target) {
      const overrides = mergeOverrides(saved, draft)
      if (target) overrides[token] = target
      else delete overrides[token]
      setDraft({ ...draft, overrides: diffOverrides(saved, overrides) })
    },
    reset() {
      setDraft(EMPTY_DRAFT)
      setStatus({ kind: 'idle' })
    },
    async save() {
      setStatus({ kind: 'saving' })
      const result = await savePalette({
        data: { draft: toPalette(saved, draft), baseHash: saved.hash },
      })
      const fresh =
        result.ok || result.error === 'Conflict' ? await getPalette() : null
      if (fresh) {
        const next = savedOf(fresh.state)
        setSaved(next)
        setNamespace(fresh.state.namespace)
        setBasePreview(fresh.preview)
        // What the file now holds drops out of the draft; after a conflict the rest stays visible.
        setDraft(rebase(saved, next, draft))
      }
      if (result.ok) setStatus({ kind: 'saved', written: result.written })
      else if (result.error === 'Conflict')
        setStatus({
          kind: 'conflict',
          message:
            'The palette inputs changed on disk since they were read. They were reloaded and your draft is kept: review it, then save again.',
        })
      else setStatus({ kind: 'error', message: result.message })
    },
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}
