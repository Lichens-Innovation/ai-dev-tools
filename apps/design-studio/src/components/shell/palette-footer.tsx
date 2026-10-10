import { useEffect, useRef, useState } from 'react'
import { isBreakpoint, modeKey } from '#/palette/draft'
import type { Mode } from '#/palette/draft'
import { usePalette } from '#/palette/palette-state'
import type { PaletteContext } from '#/palette/palette-state'
import { HexField, TokenField } from '#/components/palette/fields'
import { FOOTER_MIN, SIDEBAR_WIDTH, useShell } from '#/studio/shell-state'
import type { FooterTab } from '#/studio/shell-state'
import { Chevron } from './icons'
import { InspectTab } from './inspect-tab'
import { useInspected } from '#/inspector/inspect-state'

const TAB_LABELS: [FooterTab, string, string][] = [
  ['palette', 'Palette', 'The colors of the current mode'],
  [
    'full',
    'Full palette',
    'Every generated token, and the semantic mapping to re-point',
  ],
  ['inspect', 'Inspect', 'The tokens the selected element uses'],
]

const BASE = ['font', 'font-inverted', 'background', 'border']
const LABELS: Record<string, string> = {
  font: 'font (--text)',
  background: 'background (--bg)',
  border: 'border (--border)',
}

const button =
  'h-8 flex-none cursor-pointer rounded-lg border border-(--line) px-3 font-medium whitespace-nowrap hover:enabled:bg-(--bg-2) disabled:cursor-default disabled:opacity-50 aria-pressed:bg-(--bg-3)'
const group =
  'pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-(--ink-3) uppercase'
const rows = 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2'
const row =
  'flex h-10 items-center gap-2 rounded-lg border border-(--line) bg-(--bg) pr-1.5 pl-2 data-[changed]:border-(--primary)'
const text =
  'h-7 rounded-md border border-(--line-2) bg-(--bg) px-1.5 font-mono text-xs text-(--ink) aria-[invalid=true]:border-(--red)'
const label = 'min-w-0 flex-1 truncate text-[13px] font-medium'
const undo =
  'invisible size-6 flex-none cursor-pointer rounded-md text-base leading-none text-(--ink-3) group-data-[changed]:visible hover:bg-(--bg-2) hover:text-(--ink)'

/** Whether pointing `token` at `target` would loop back to `token`, in either mode. */
const loops = (
  refs: PaletteContext['preview']['refs'],
  token: string,
  target: string,
) =>
  [refs.light, refs.dark].some((r) => {
    let at: string | undefined = target
    for (let guard = 0; at && guard < 50; guard++) {
      if (at === token) return true
      at = r[at]
    }
    return false
  })

function InputRows({ pal, mode }: { pal: PaletteContext; mode: Mode }) {
  const key = modeKey(mode)
  const names = Object.keys(pal.palette.inputs)
  const brand = pal.preview.brand
  const groups: [string, string[]][] = [
    ['Brand', names.filter((n) => brand.includes(n))],
    ['Base', names.filter((n) => BASE.includes(n))],
    ['Status', names.filter((n) => !BASE.includes(n) && !brand.includes(n))],
  ]
  return groups
    .filter(([, list]) => list.length)
    .map(([title, list]) => (
      <div key={title}>
        <div className={group}>{title}</div>
        <div className={rows}>
          {list.map((name) => {
            const value = pal.palette.inputs[name][key]
            const changed =
              !!pal.draft.inputs[name]?.[key] || !(name in pal.saved.inputs)
            const original =
              name in pal.saved.inputs ? pal.saved.inputs[name][key] : value
            return (
              <div
                key={name}
                className={`group ${row}`}
                data-changed={changed || undefined}
                data-token-row=""
              >
                <input
                  type="color"
                  title={`--${name}`}
                  aria-label={`${name} color`}
                  value={value}
                  onChange={(e) => pal.setInput(name, mode, e.target.value)}
                  className="size-7 flex-none cursor-pointer rounded-md border border-(--line) bg-transparent p-0"
                />
                <label
                  htmlFor={`ds-in-${name}`}
                  title={`--${name}-${key}`}
                  className={label}
                >
                  {LABELS[name] ?? name}
                </label>
                <HexField
                  id={`ds-in-${name}`}
                  label={`${name} hex`}
                  value={value}
                  onValid={(hex) => pal.setInput(name, mode, hex)}
                  className={`${text} w-20`}
                />
                <button
                  type="button"
                  title="Back to the saved value"
                  aria-label={`Reset ${name}`}
                  onClick={() => pal.setInput(name, mode, original)}
                  className={undo}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>
    ))
}

function TokenRows({ pal }: { pal: PaletteContext }) {
  const names = Object.keys(pal.saved.tokens)
  if (!names.length) return null
  return (
    <div>
      <div className={group}>Tokens · both modes</div>
      <div className={rows}>
        {names.map((name) => {
          const readOnly = isBreakpoint(name)
          return (
            <div
              key={name}
              className={`group ${row}`}
              data-changed={name in pal.draft.tokens || undefined}
              data-token-row=""
            >
              <label
                htmlFor={`ds-tok-${name}`}
                title={`--${name}`}
                className={`${label} max-w-[55%] flex-none`}
              >
                {name}
              </label>
              <TokenField
                id={`ds-tok-${name}`}
                label={`${name} value`}
                value={pal.palette.tokens[name]}
                disabled={readOnly}
                title={
                  readOnly
                    ? 'Media queries cannot read var(): edit it in the inputs file'
                    : `--${name}`
                }
                onValid={(value) => pal.setToken(name, value)}
                className={`${text} min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-60`}
              />
              <button
                type="button"
                title="Back to the saved value"
                aria-label={`Reset ${name}`}
                onClick={() => pal.setToken(name, pal.saved.tokens[name])}
                className={undo}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The target picker of a semantic token: its options are only listed once it is used. */
function OverrideSelect({
  pal,
  token,
  mode,
}: {
  pal: PaletteContext
  token: string
  mode: Mode
}) {
  const [used, setUsed] = useState(false)
  const current = pal.palette.overrides[token] ?? ''
  const auto = pal.preview.autoRefs[mode][token]
  const choose = (target: string) => pal.setOverride(token, target)
  return (
    <select
      id={`ds-gen-${token}`}
      aria-label={`${token} reference`}
      value={current}
      onPointerDown={() => setUsed(true)}
      onFocus={() => setUsed(true)}
      onChange={(e) => choose(e.target.value)}
      className={`${text} min-w-0 flex-[0_1_55%]`}
    >
      <option value="">auto → --{auto}</option>
      {used ? (
        pal.preview.tokens
          .filter(
            (t) => t.name !== token && !loops(pal.preview.refs, token, t.name),
          )
          .map((t) => (
            <option key={t.name} value={t.name}>
              --{t.name}
            </option>
          ))
      ) : current ? (
        <option value={current}>--{current}</option>
      ) : null}
    </select>
  )
}

function GeneratedRows({ pal, mode }: { pal: PaletteContext; mode: Mode }) {
  const { tokens, brand, status, overridable } = pal.preview
  const families = [...brand, ...status]
  const can = new Set(overridable)
  const familyOf = (k: string) =>
    families.find(
      (n) => k === n || k.startsWith(`${n}-`) || k === `text-on-${n}`,
    )
  const groups: [string, typeof tokens][] = [
    ['Generated · neutrals', tokens.filter((t) => !familyOf(t.name))],
    ...families.map((f): [string, typeof tokens] => [
      `Generated · ${f}`,
      tokens.filter((t) => familyOf(t.name) === f),
    ]),
  ]
  return (
    <div>
      <p className="mt-2.5 text-[13px] text-(--ink-3)">
        Values for the current mode. A token with a picker references another
        one: re-point it (the same in both modes) or leave it on auto.
      </p>
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <div key={title}>
            <div className={group}>{title}</div>
            <div className={rows}>
              {list.map((t) => {
                const hex = t[mode]
                return (
                  <div
                    key={t.name}
                    className={`group ${row}`}
                    data-changed={t.name in pal.draft.overrides || undefined}
                    data-token-row=""
                  >
                    <span
                      title={hex}
                      className="size-[22px] flex-none rounded-[5px] shadow-[inset_0_0_0_1px_rgba(127,127,127,0.35)]"
                      style={{ background: hex }}
                    />
                    <label
                      htmlFor={`ds-gen-${t.name}`}
                      title={`--${t.name}`}
                      className={label}
                    >
                      {t.name}
                    </label>
                    {can.has(t.name) ? (
                      <>
                        <OverrideSelect pal={pal} token={t.name} mode={mode} />
                        <button
                          type="button"
                          title="Back to the saved reference"
                          aria-label={`Reset ${t.name}`}
                          onClick={() =>
                            pal.setOverride(
                              t.name,
                              pal.saved.overrides[t.name] ?? '',
                            )
                          }
                          className={undo}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <code
                        id={`ds-gen-${t.name}`}
                        tabIndex={-1}
                        className="font-mono text-xs text-(--ink-3)"
                      >
                        {hex}
                      </code>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )
}

function Status({ pal }: { pal: PaletteContext }) {
  const { failures, changes } = pal
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[13px] whitespace-nowrap text-(--ink-3) max-sm:hidden">
      {changes ? (
        <span className="rounded-full bg-(--primary-dim) px-2 py-0.5 text-xs font-semibold text-(--primary)">
          {changes} {changes > 1 ? 'changes' : 'change'}
        </span>
      ) : (
        <span>Tweak the palette live on every page</span>
      )}
      {failures.length > 0 && (
        <span
          className="rounded-full bg-(--red-dim) px-2 py-0.5 text-xs font-semibold text-(--red)"
          title={failures
            .map(
              (c) =>
                `${c.m}: --${c.fg} on --${c.bg} ${c.val.toFixed(2)}:1 (${c.need}:1)`,
            )
            .join('\n')}
        >
          {failures.length} contrast {failures.length > 1 ? 'fails' : 'fail'}
        </span>
      )}
      {pal.external && (
        <span
          className="rounded-full bg-(--yellow-dim) px-2 py-0.5 text-xs font-semibold text-(--yellow)"
          title="Saving now reports a conflict and reloads the file"
        >
          inputs changed on disk
        </span>
      )}
    </div>
  )
}

function Message({ pal }: { pal: PaletteContext }) {
  const { status, previewError, preview } = pal
  const lines: [string, string][] = []
  if (status.kind === 'saved')
    lines.push(['ok', `Saved. Wrote ${status.written.join(', ')}.`])
  if (status.kind === 'conflict') lines.push(['warn', status.message])
  if (status.kind === 'error') lines.push(['error', status.message])
  if (previewError) lines.push(['error', previewError])
  for (const e of preview.overrideErrors) lines.push(['error', e])
  if (!lines.length) return null
  const tone = {
    ok: 'text-(--green)',
    warn: 'text-(--yellow)',
    error: 'text-(--red)',
  }
  return (
    <div
      role={status.kind === 'saved' ? 'status' : 'alert'}
      className="border-t border-(--line) px-4 py-1.5 text-[13px]"
    >
      {lines.map(([kind, line], i) => (
        <div key={i} className={tone[kind as keyof typeof tone]}>
          {line}
        </div>
      ))}
    </div>
  )
}

/** The bar fixed to the bottom of every page: the palette draft, with Save and Reset. */
export function PaletteFooter() {
  const shell = useShell()
  const pal = usePalette()
  const ref = useRef<HTMLElement>(null)
  const handled = useRef(0)

  // The pages leave room for the bar.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--ds-footer-h', `${el.offsetHeight}px`),
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--ds-footer-h')
    }
  }, [pal === null])

  // Picking an element with the footer closed opens it on Inspect: otherwise the click shows nothing. Keyed on the
  // element, since an edit republishes the same selection.
  const element = useInspected().picked?.element ?? null
  const { footerOpen, setFooterOpen, setFooterTab } = shell
  useEffect(() => {
    if (!element || footerOpen) return
    setFooterTab('inspect')
    setFooterOpen(true)
  }, [element])

  // A design-studio:token event opens the footer on that token.
  const focus = pal?.focus
  useEffect(() => {
    if (!focus || focus.nonce === handled.current || !shell.footerOpen) return
    handled.current = focus.nonce
    const frame = requestAnimationFrame(() => {
      const field = ['ds-in-', 'ds-tok-', 'ds-gen-']
        .map((prefix) => document.getElementById(prefix + focus.token))
        .find((el) => el)
      if (!field) return
      field.scrollIntoView({ block: 'center' })
      field.focus({ preventScroll: true })
      field
        .closest('[data-token-row]')
        ?.animate(
          [
            { outline: '2px solid var(--primary)' },
            { outline: '2px solid transparent' },
          ],
          { duration: 1600 },
        )
    })
    return () => cancelAnimationFrame(frame)
  }, [focus, shell.footerOpen, shell.footerTab])

  /** Drag the top edge to resize the body; the arrow keys do the same by steps. */
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const maxHeight = () => Math.round(window.innerHeight * 0.8)
  const clamp = (h: number) =>
    Math.max(FOOTER_MIN, Math.min(maxHeight(), Math.round(h)))
  const startResize = (e: React.PointerEvent) => {
    const from = body.current?.offsetHeight
    if (from === undefined) return
    e.preventDefault()
    const startY = e.clientY
    let last = from
    const move = (m: PointerEvent) => {
      last = clamp(from + startY - m.clientY)
      setDragHeight(last)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      setDragHeight(null)
      shell.setFooterHeight(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }
  const bodyHeight = dragHeight ?? shell.footerHeight

  if (!pal) return null
  const saving = pal.status.kind === 'saving'

  return (
    <section
      ref={ref}
      aria-label="Palette"
      className="fixed right-0 bottom-0 left-0 z-20 border-t border-(--line) bg-(--bg-elev) text-sm text-(--ink) shadow-[0_-2px_8px_rgba(0,0,0,0.08)] transition-[left] duration-200"
      style={{ left: shell.sidebar && shell.wide ? SIDEBAR_WIDTH : 0 }}
    >
      {shell.footerOpen && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the footer"
          aria-valuenow={bodyHeight ?? undefined}
          aria-valuemin={FOOTER_MIN}
          tabIndex={0}
          title="Drag to resize (double-click: default height)"
          onPointerDown={startResize}
          onDoubleClick={() => shell.setFooterHeight(null)}
          onKeyDown={(e) => {
            const now = body.current?.offsetHeight ?? FOOTER_MIN
            if (e.key === 'ArrowUp') shell.setFooterHeight(clamp(now + 40))
            else if (e.key === 'ArrowDown')
              shell.setFooterHeight(clamp(now - 40))
            else return
            e.preventDefault()
          }}
          className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none hover:bg-(--primary-dim) focus-visible:bg-(--primary-dim)"
        />
      )}
      <div className="flex h-12 items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={shell.footerOpen}
          onClick={() => shell.setFooterOpen(!shell.footerOpen)}
          className="flex h-8 flex-none cursor-pointer items-center gap-2 rounded-lg pr-2.5 pl-1.5 font-semibold hover:bg-(--bg-2)"
        >
          <Chevron open={shell.footerOpen} />
          <span>Palette</span>
        </button>
        <Status pal={pal} />
        <span className="flex-1 sm:hidden" />
        <div
          role="tablist"
          aria-label="Footer views"
          className="flex flex-none gap-1"
        >
          {TAB_LABELS.map(([id, name, hint]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`ds-tab-${id}`}
              aria-selected={shell.footerOpen && shell.footerTab === id}
              aria-controls="ds-footer-body"
              title={hint}
              onClick={() => {
                shell.setFooterTab(id)
                shell.setFooterOpen(true)
              }}
              className="h-8 cursor-pointer rounded-lg px-3 font-medium whitespace-nowrap hover:bg-(--bg-2) aria-selected:bg-(--bg-3)"
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!pal.changes}
          title="Drop the draft: back to the saved palette"
          onClick={pal.reset}
          className={button}
        >
          Reset
        </button>
        <button
          type="button"
          disabled={!pal.changes || saving}
          title="Write the inputs file and regenerate the theme files"
          onClick={() => void pal.save()}
          className="h-8 flex-none cursor-pointer rounded-lg bg-(--primary) px-3 font-medium whitespace-nowrap text-white hover:enabled:brightness-95 disabled:cursor-default disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <Message pal={pal} />
      {shell.footerOpen && (
        <div
          ref={body}
          id="ds-footer-body"
          role="tabpanel"
          aria-labelledby={`ds-tab-${shell.footerTab}`}
          className="overflow-y-auto border-t border-(--line) px-4 pt-1 pb-4"
          style={
            bodyHeight === null
              ? { maxHeight: 'min(45vh, 420px)' }
              : { height: bodyHeight, maxHeight: '80vh' }
          }
        >
          {shell.footerTab === 'inspect' ? (
            <InspectTab pal={pal} />
          ) : (
            <>
              <InputRows pal={pal} mode={shell.mode} />
              <TokenRows pal={pal} />
              {shell.footerTab === 'full' && (
                <GeneratedRows pal={pal} mode={shell.mode} />
              )}
              <p className="mt-2.5 text-[13px] text-(--ink-3)">
                Editing the <b>{shell.mode}</b> mode value of each input (the
                navbar switch picks the mode); token values apply to both modes.
                The draft stays in this browser until you save: Save writes the
                inputs file and regenerates the theme files of the project.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
