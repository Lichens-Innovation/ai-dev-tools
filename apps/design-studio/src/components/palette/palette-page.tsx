import { useState } from 'react'
import type { Mode } from '#/palette/draft'
import { usePalette } from '#/palette/palette-state'
import type { PaletteContext } from '#/palette/palette-state'
import { useNavSections } from '#/studio/use-nav-sections'
import { AuditCard, ColorGrid, Semantic } from './color-sections'
import { ModeColumns, NO_PALETTE } from './theme-scope'
import { ComponentsDemo, TokensSection } from './tokens-and-demo'

type Tab = 'web' | 'mobile' | 'inputs'
const TABS: [Tab, string][] = [
  ['web', 'Web'],
  ['mobile', 'Mobile · Tailwind'],
  ['inputs', 'Inputs JSON'],
]
const HINTS: Record<Tab, string> = {
  web: 'The theme (plain values, flipped by prefers-color-scheme) plus the browser scheme block, so color-scheme on <html> can force a mode.',
  mobile:
    'The theme plus Tailwind v4 utilities, for a mobile-only project. React Native follows prefers-color-scheme.',
  inputs: 'The inputs of the palette, as the inputs file holds them.',
}

function ExportModal({
  pal,
  onClose,
}: {
  pal: PaletteContext
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('web')
  const [copied, setCopied] = useState(false)
  const { css, exports } = pal.preview
  const text =
    tab === 'web' ? css : tab === 'mobile' ? exports.mobile : exports.inputs
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-(--overlay) p-5"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Theme tokens"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-[min(760px,100%)] flex-col gap-3.5 rounded-[14px] border border-(--border) bg-(--bg-elevated) p-6 shadow-[0_24px_64px_-12px_var(--shadow)]"
      >
        <div>
          <div className="text-[17px] font-semibold">Theme tokens</div>
          <div className="mt-0.5 text-(--text-muted)">{HINTS[tab]}</div>
        </div>
        <div className="grid w-[360px] max-w-full grid-cols-3 rounded-[9px] bg-(--bg-hover) p-[3px]">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id)
                setCopied(false)
              }}
              className="h-[30px] cursor-pointer rounded-[7px] border border-(--border) bg-transparent font-medium hover:bg-(--border) aria-pressed:bg-(--bg-elevated)"
            >
              {label}
            </button>
          ))}
        </div>
        <pre className="m-0 min-h-0 flex-1 overflow-auto rounded-[10px] border border-(--bg-hover) bg-(--bg-inset) p-4 font-mono text-xs/[1.6]">
          {text}
        </pre>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] cursor-pointer rounded-lg border border-(--border) bg-(--bg-elevated) px-4 font-semibold hover:bg-(--bg-hover)"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(text)
                .then(() => setCopied(true))
            }
            className="h-[38px] cursor-pointer rounded-lg border border-(--primary-strong) bg-(--primary) px-4 font-semibold text-(--text-on-primary) hover:bg-(--primary-hover)"
          >
            {copied ? 'Copied' : tab === 'inputs' ? 'Copy JSON' : 'Copy CSS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Card({
  pal,
  mode,
  first,
}: {
  pal: PaletteContext
  mode: Mode
  first: boolean
}) {
  const [exporting, setExporting] = useState(false)
  return (
    <main className="mx-auto flex w-full max-w-[1216px] min-w-0 flex-col gap-12 px-[clamp(16px,4vw,48px)] py-8 pb-20">
      <section
        id={first ? 'palette' : undefined}
        data-nav-section={first ? 'Palette' : undefined}
        className="flex max-w-[1120px] flex-col gap-7"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-widest text-(--text-muted) uppercase">
              Palette
            </div>
            <h1 className="m-0 text-[28px] tracking-tight">Palette</h1>
            <p className="mt-1 max-w-[60ch] text-(--text-muted)">
              Each color has five steps ordered by contrast against the
              background: faint, soft, base, strong, intense. The names mean the
              same thing in light and dark mode.
            </p>
            <p className="mt-1 max-w-[60ch] text-xs text-(--text-muted)">
              Click any base swatch to try a color for the {mode} mode. Edits
              are shared with the Palette footer on every page; Save in the
              footer writes them to the project.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExporting(true)}
            className="h-[38px] cursor-pointer rounded-lg border border-(--primary-strong) bg-(--primary) px-4 font-semibold text-(--text-on-primary) hover:bg-(--primary-hover)"
          >
            Export CSS
          </button>
        </div>
        <ColorGrid pal={pal} mode={mode} />
        <AuditCard pal={pal} />
        <Semantic pal={pal} mode={mode} />
      </section>
      <TokensSection pal={pal} nav={first} />
      <ComponentsDemo pal={pal} nav={first} />
      {exporting && (
        <ExportModal pal={pal} onClose={() => setExporting(false)} />
      )}
    </main>
  )
}

/** The palette card as a page: colors, audit, semantic mapping, tokens and a component demo. Shares the footer's draft. */
export function PalettePage() {
  const pal = usePalette()
  useNavSections(() => ({ document, window }), [pal === null])
  if (!pal) return <p className="p-6 text-(--ink-2)">{NO_PALETTE}</p>
  return (
    <ModeColumns>
      {(mode, first) => <Card pal={pal} mode={mode} first={first} />}
    </ModeColumns>
  )
}
