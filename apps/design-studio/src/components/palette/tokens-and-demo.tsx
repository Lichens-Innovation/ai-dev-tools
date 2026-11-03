import { useState } from 'react'
import { isBreakpoint } from '#/palette/draft'
import type { PaletteContext } from '#/palette/palette-state'
import { card } from './color-sections'
import { TokenField } from './fields'

const GROUPS: { title: string; note: string; test: (n: string) => boolean }[] =
  [
    {
      title: 'Type',
      note: '--font-*, --text-*, --leading-*',
      test: (n) => /^(font|text|leading|tracking)-/.test(n),
    },
    {
      title: 'Spacing',
      note: 'padding, margin and gap',
      test: (n) => n.startsWith('spacing-'),
    },
    {
      title: 'Shape',
      note: '--radius-*',
      test: (n) => n.startsWith('radius-'),
    },
    {
      title: 'Breakpoints',
      note: 'read only: media queries cannot read var(), edit them in the inputs file',
      test: isBreakpoint,
    },
    { title: 'Other', note: 'no preview', test: () => true },
  ]

/** A live sample of a token, by its name. */
function sample(n: string): {
  kind: 'bar' | 'box' | 'text'
  style: React.CSSProperties
  text?: string
} | null {
  const v = `var(--${n})`
  if (n.includes('--')) return null
  if (n.startsWith('font-weight-'))
    return { kind: 'text', style: { fontWeight: v }, text: 'Aa' }
  if (n.startsWith('font-'))
    return {
      kind: 'text',
      style: { fontFamily: v },
      text: 'The quick brown fox jumps',
    }
  if (n.startsWith('text-'))
    return {
      kind: 'text',
      style: { fontSize: v, lineHeight: 1.2 },
      text: 'Aa Heading',
    }
  if (n.startsWith('leading-'))
    return { kind: 'text', style: { lineHeight: v }, text: 'Line height' }
  if (n.startsWith('tracking-'))
    return { kind: 'text', style: { letterSpacing: v }, text: 'Letter spacing' }
  if (n.startsWith('spacing-')) return { kind: 'bar', style: { width: v } }
  if (n.startsWith('radius-'))
    return { kind: 'box', style: { borderRadius: v } }
  return null
}

export function TokensSection({
  pal,
  nav,
}: {
  pal: PaletteContext
  nav: boolean
}) {
  const names = Object.keys(pal.saved.tokens)
  if (!names.length) return null
  const left = new Set(names)
  const groups = GROUPS.map((g) => ({
    ...g,
    rows: names.filter((n) => left.has(n) && g.test(n) && left.delete(n)),
  })).filter((g) => g.rows.length)
  return (
    <section
      id={nav ? 'tokens' : undefined}
      data-nav-section={nav ? 'Tokens' : undefined}
      className="flex max-w-[1120px] flex-col gap-5"
    >
      <div>
        <h2 className="m-0 text-[22px] tracking-tight">Tokens</h2>
        <p className="mt-1 max-w-[60ch] text-(--text-muted)">
          The hand-authored tokens of the inputs file, the same in both modes.
          Edit a value to try it here and on every page; keep it with Save in
          the Palette footer. Names are fixed: components compile against them.
        </p>
      </div>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col">
          <div className="flex items-baseline gap-2 pb-2">
            <span className="text-[15px] font-semibold">{g.title}</span>
            <span className="text-xs text-(--text-muted)">{g.note}</span>
          </div>
          {g.rows.map((n) => {
            const value = pal.palette.tokens[n]
            const show = sample(n)
            const readOnly = isBreakpoint(n)
            return (
              <div
                key={n}
                className="grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_minmax(140px,260px)] items-center gap-3 border-t border-(--border) py-2 max-sm:grid-cols-[1fr_1fr]"
              >
                <span
                  title={`--${n}`}
                  className="font-mono text-xs font-medium [overflow-wrap:anywhere]"
                >
                  --{n}
                </span>
                <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {show?.kind === 'bar' && (
                    <div
                      className="h-3 rounded-sm bg-(--primary)"
                      style={show.style}
                    />
                  )}
                  {show?.kind === 'box' && (
                    <div
                      className="h-8 w-12 border-2 border-(--primary) bg-(--primary-bg)"
                      style={show.style}
                    />
                  )}
                  {show?.kind === 'text' && (
                    <span style={show.style}>{show.text}</span>
                  )}
                </div>
                <TokenField
                  label={`${n} value`}
                  value={value}
                  disabled={readOnly}
                  title={
                    readOnly
                      ? 'Media queries cannot read var(): edit it in the inputs file'
                      : `--${n}`
                  }
                  onValid={(v) => pal.setToken(n, v)}
                  className="h-8 min-w-0 rounded-md border border-(--border-input) bg-(--bg-elevated) px-2 font-mono text-xs aria-[invalid=true]:border-(--danger) disabled:opacity-60 data-[changed]:border-(--primary)"
                  style={
                    n in pal.draft.tokens
                      ? { borderColor: 'var(--primary)' }
                      : undefined
                  }
                />
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const MESSAGES: Record<string, string> = {
  info: 'A new version of the palette is available.',
  danger: 'Two colors fail contrast on buttons.',
  success: 'Tokens exported to your clipboard.',
  warning: 'One border is below 3:1 on the page.',
}
const btn = 'h-9 cursor-pointer rounded-lg px-3.5 font-semibold'
const solid = `${btn} border border-(--primary-strong) bg-(--primary) text-(--text-on-primary) hover:bg-(--primary-hover)`

function Intent({ k }: { k: string }) {
  return (
    <button
      type="button"
      className={`${btn} border hover:bg-(--hov)`}
      style={
        {
          '--hov': `var(--${k}-hover)`,
          borderColor: `var(--${k}-strong)`,
          background: `var(--${k})`,
          color: `var(--text-on-${k})`,
        } as React.CSSProperties
      }
    >
      {cap(k)}
    </button>
  )
}

const disabled = `${btn} cursor-not-allowed! border border-(--border) bg-(--bg-disabled) text-(--text-disabled)`

/** The components the tokens style: buttons, alerts and badges, overlays and links. */
export function ComponentsDemo({
  pal,
  nav,
}: {
  pal: PaletteContext
  nav: boolean
}) {
  const { brand, status } = pal.preview
  const [pop, setPop] = useState(false)
  const [modal, setModal] = useState(false)
  return (
    <section
      id={nav ? 'components' : undefined}
      data-nav-section={nav ? 'Components' : undefined}
      className="flex max-w-[1120px] flex-col gap-5"
    >
      <h2 className="m-0 text-[22px] tracking-tight">Components</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-5">
        <div className={`${card} gap-4 p-5`}>
          <div className="font-semibold">Buttons</div>
          <div className="flex flex-wrap gap-2">
            {brand.map((k) => (
              <Intent key={k} k={k} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {brand.map((k) => (
              <button key={k} type="button" disabled className={disabled}>
                {cap(k)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={solid}>
              Solid
            </button>
            <button
              type="button"
              className={`${btn} border border-(--primary-border) bg-(--primary-bg) text-(--primary-text) hover:bg-(--primary-bg-hover)`}
            >
              Soft
            </button>
            <button
              type="button"
              className={`${btn} border border-(--primary) bg-transparent text-(--primary-text) hover:bg-(--primary-bg)`}
            >
              Outline
            </button>
            <button
              type="button"
              className={`${btn} border border-(--border) bg-transparent text-(--primary-text) hover:bg-(--bg-hover)`}
            >
              Ghost
            </button>
            <button type="button" disabled className={disabled}>
              Disabled
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {status.map((k) => (
              <Intent key={k} k={k} />
            ))}
          </div>
        </div>

        <div className={`${card} gap-3 p-5`}>
          <div className="font-semibold">Alerts &amp; badges</div>
          {status.map((k) => (
            <div
              key={k}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
              style={{
                background: `var(--${k}-bg)`,
                border: `1px solid var(--${k}-border)`,
              }}
            >
              <span
                className="mt-1.5 size-2 flex-none rounded-full"
                style={{ background: `var(--${k})` }}
              />
              <div>
                <span
                  className="font-semibold"
                  style={{ color: `var(--${k}-text)` }}
                >
                  {cap(k)}.
                </span>{' '}
                {MESSAGES[k] ?? 'A message.'}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {brand.map((k) => (
              <span
                key={k}
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  background: `var(--${k}-bg)`,
                  color: `var(--${k}-text)`,
                }}
              >
                {cap(k)}
              </span>
            ))}
          </div>
        </div>

        <div className={`${card} gap-3 p-5`}>
          <div className="font-semibold">Overlays</div>
          <p className="m-0 text-(--text-muted)">
            Modals and popovers sit on --bg-elevated with a border.
          </p>
          <div className="relative flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setModal(true)
                setPop(false)
              }}
              className={solid}
            >
              Open modal
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPop(!pop)}
                className={`${btn} border border-(--border) bg-(--bg-elevated) hover:bg-(--bg-hover)`}
              >
                Show popover
              </button>
              {pop && (
                <div className="absolute top-11 left-0 z-10 flex w-[260px] flex-col gap-2 rounded-xl border border-(--border) bg-(--bg-elevated) p-3.5 shadow-[0_12px_32px_-8px_var(--shadow)]">
                  <div className="font-semibold">Share with team</div>
                  <div className="text-[13px] text-(--text-muted)">
                    Everyone in the workspace will be able to view this palette.
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPop(false)}
                      className="h-[30px] cursor-pointer rounded-[7px] border border-(--border) bg-transparent px-2.5 hover:bg-(--bg-hover)"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setPop(false)}
                      className="h-[30px] cursor-pointer rounded-[7px] border border-(--primary-strong) bg-(--primary) px-2.5 font-semibold text-(--text-on-primary) hover:bg-(--primary-hover)"
                    >
                      Share
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${card} gap-3 p-5`}>
          <div className="font-semibold">Links</div>
          <p className="m-0">
            Read the{' '}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-(--link) hover:text-(--link-hover)"
            >
              theming guide
            </a>{' '}
            before exporting, or{' '}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-(--link) hover:text-(--link-hover)"
            >
              contact support
            </a>{' '}
            if a color fails contrast.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="font-semibold text-(--link) no-underline"
            >
              View all projects →
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-(--text-muted) hover:text-(--text)"
            >
              Muted link
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-(--danger-text) hover:text-(--danger-strong)"
            >
              Delete account
            </a>
          </div>
        </div>
      </div>

      {modal && (
        <div
          onClick={() => setModal(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-(--overlay) p-5"
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="flex w-[min(440px,100%)] flex-col gap-3.5 rounded-[14px] border border-(--border) bg-(--bg-elevated) p-6 shadow-[0_24px_64px_-12px_var(--shadow)]"
          >
            <div className="grid size-10 place-items-center rounded-[10px] bg-(--danger-bg) text-lg font-bold text-(--danger-text)">
              !
            </div>
            <div>
              <div className="text-[17px] font-semibold">
                Delete “Northwind redesign”?
              </div>
              <div className="mt-1 text-(--text-muted)">
                This removes the project and its 12 tasks. This action can’t be
                undone.
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">
              Type the project name to confirm
              <input className="h-[38px] rounded-lg border border-(--border-input) bg-(--bg-elevated) px-3 outline-none focus:border-(--danger) focus:shadow-[0_0_0_3px_var(--danger-border)]" />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="h-[38px] cursor-pointer rounded-lg border border-(--border) bg-(--bg-elevated) px-4 font-semibold hover:bg-(--bg-hover)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setModal(false)}
                className="h-[38px] cursor-pointer rounded-lg border border-(--danger-strong) bg-(--danger) px-4 font-semibold text-(--text-on-danger) hover:bg-(--danger-hover)"
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
