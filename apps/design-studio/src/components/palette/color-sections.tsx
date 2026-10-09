import { useState } from 'react'
import { modeKey } from '#/palette/draft'
import type { Mode } from '#/palette/draft'
import type { PaletteContext } from '#/palette/palette-state'

export const BRAND = [
  'primary',
  'secondary',
  'tertiary',
  'quaternary',
  'quinary',
]
const STEPS = ['faint', 'soft', '', 'strong', 'intense']
const BASE_ROWS = [
  { input: 'font', token: 'text', label: 'font → --text', steps: true },
  {
    input: 'font-inverted',
    token: 'text-inverted',
    label: 'font-inverted',
    steps: false,
  },
  { input: 'background', token: 'bg', label: 'background → --bg', steps: true },
  {
    input: 'border',
    token: 'border',
    label: 'border → --border',
    steps: false,
  },
]

const mono = 'font-mono'
const heading = 'text-[15px] font-semibold'
const muted = 'text-xs text-(--text-muted)'
export const card =
  'flex flex-col gap-1 rounded-xl border border-(--border) bg-(--bg-elevated) px-5 py-4'

/** The family a contrast check is about, to badge its color row. */
const famOf = (t: string) => {
  if (t.startsWith('text-on-')) return t.slice(8)
  if (t === 'link' || t === 'focus-ring') return 'primary'
  if (t === 'focus-ring-danger') return 'danger'
  if (t === 'border-input') return 'text'
  if (t.startsWith('text-inverted')) return 'text-inverted'
  return t.split('-')[0]
}

interface RowSpec {
  /** The input name. */
  name: string
  /** The token the swatches are named after. */
  token: string
  label: string
  steps: boolean
  removable: boolean
}

function ColorRow({
  pal,
  mode,
  row,
  issues,
}: {
  pal: PaletteContext
  mode: Mode
  row: RowSpec
  issues: number
}) {
  const entry = pal.palette.inputs[row.name]
  const hex = entry[modeKey(mode)]
  return (
    <div className="grid grid-cols-[150px_repeat(5,minmax(0,1fr))] items-center gap-2 max-sm:grid-cols-[96px_repeat(5,minmax(0,1fr))]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`${mono} text-[13px] font-medium`}>{row.label}</span>
          {row.removable && (
            <button
              type="button"
              title="Remove"
              aria-label={`Remove ${row.name}`}
              onClick={pal.removeBrand}
              className="size-[18px] cursor-pointer rounded border border-(--border) bg-transparent p-0 leading-none text-(--text-muted) hover:bg-(--danger-bg) hover:text-(--danger-text)"
            >
              ×
            </button>
          )}
          {issues > 0 && (
            <span className="rounded-full bg-(--danger-bg) px-1.5 text-[10px] font-semibold whitespace-nowrap text-(--danger-text)">
              {issues} {issues > 1 ? 'issues' : 'issue'}
            </span>
          )}
        </div>
        <span className={`${mono} text-[11px] text-(--text-muted) uppercase`}>
          {entry.lm === entry.dm ? entry.lm : `${entry.lm} · ${entry.dm}`}
        </span>
      </div>
      {STEPS.map((step) => {
        const token = step ? `--${row.token}-${step}` : `--${row.token}`
        return (
          <div
            key={step}
            title={token}
            className="relative h-12 rounded-lg"
            style={{
              background: `var(${token})`,
              boxShadow:
                'inset 0 0 0 1px color-mix(in oklch, var(--text) 10%, transparent)',
              outline: step ? 'none' : '2px solid var(--border)',
              outlineOffset: 2,
              opacity: step && !row.steps ? 0 : 1,
            }}
          >
            {!step && (
              <input
                type="color"
                value={hex}
                aria-label={`${row.name} color`}
                onChange={(e) => pal.setInput(row.name, mode, e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The color grid: five steps per input, the base swatch opens the picker for the current mode. */
export function ColorGrid({ pal, mode }: { pal: PaletteContext; mode: Mode }) {
  const { brand, status, audit } = pal.preview
  const issuesBy: Partial<Record<string, number>> = {}
  audit
    .filter((c) => !c.pass && c.m === mode)
    .forEach((c) =>
      new Set([famOf(c.fg), famOf(c.bg)]).forEach((k) => {
        issuesBy[k] = (issuesBy[k] ?? 0) + 1
      }),
    )
  const own = (name: string, token = name): RowSpec => ({
    name,
    token,
    label: `--${name}`,
    steps: true,
    removable: false,
  })
  const groups = [
    {
      title: 'Brand',
      note: `${brand.length} of 5 · from logo`,
      rows: brand.map((n, i) => ({
        ...own(n),
        removable: i === brand.length - 1 && i >= 2,
      })),
      add: brand.length < 5 ? BRAND[brand.length] : null,
    },
    {
      title: 'Base',
      note: 'Inputs for --text, --text-inverted, --bg, --border',
      rows: BASE_ROWS.map(
        (r): RowSpec => ({
          name: r.input,
          token: r.token,
          label: r.label,
          steps: r.steps,
          removable: false,
        }),
      ),
      add: null,
    },
    {
      title: 'Status',
      note: 'Feedback states',
      rows: status.map((n) => own(n)),
      add: null,
    },
  ]
  return groups.map((g) => (
    <div key={g.title} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[150px_repeat(5,minmax(0,1fr))] items-end gap-2 max-sm:grid-cols-[96px_repeat(5,minmax(0,1fr))]">
        <div>
          <div className={heading}>{g.title}</div>
          <div className={muted}>{g.note}</div>
        </div>
        {STEPS.map((s) => (
          <div
            key={s}
            className={`${mono} text-[11px] font-medium text-(--text-muted)`}
          >
            {s || 'base'}
          </div>
        ))}
      </div>
      {g.rows.map((r) => (
        <ColorRow
          key={r.name}
          pal={pal}
          mode={mode}
          row={r}
          issues={issuesBy[r.token] ?? issuesBy[r.name] ?? 0}
        />
      ))}
      {g.add && (
        <div className="pl-[158px]">
          <button
            type="button"
            onClick={pal.addBrand}
            className="h-8 cursor-pointer rounded-lg border border-dashed border-(--border-strong) bg-transparent px-3 text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text)"
          >
            + Add --{g.add}
          </button>
        </div>
      )}
    </div>
  ))
}

const NOTES: Record<string, string> = {
  hue: 'brand may be mistaken for a status',
  input: 'tints and hover will be weak',
  state: 'visible state change',
  line: 'UI boundary',
  brand: 'fill visible on page (advisory)',
}

/** The contrast audit of both modes: the failures, or every check. */
export function AuditCard({ pal }: { pal: PaletteContext }) {
  const [all, setAll] = useState(false)
  const { audit, tokens } = pal.preview
  const hexOf = (name: string, m: string) =>
    tokens.find((t) => t.name === name)?.[m === 'dark' ? 'dark' : 'light'] ??
    '#000000'
  const bad = audit.filter((c) => !c.pass)
  const count = (m: string, level: string) =>
    bad.filter((c) => c.m === m && c.level === level).length
  const shown = (all ? audit : bad)
    .slice()
    .sort(
      (x, y) =>
        Number(x.pass) - Number(y.pass) ||
        Number(x.level !== 'fail') - Number(y.level !== 'fail'),
    )
  const total = (m: string) => audit.filter((c) => c.m === m).length
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-3 pb-2">
        <div className="min-w-[220px] flex-1">
          <div className={heading}>Contrast audit</div>
          <div className={muted}>
            Light: {count('light', 'fail')} fail, {count('light', 'warn')} warn
            · Dark: {count('dark', 'fail')} fail, {count('dark', 'warn')} warn ·{' '}
            {total('light')} light / {total('dark')} dark checks
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="h-8 cursor-pointer rounded-lg border border-(--border) bg-(--bg-elevated) px-3 font-medium hover:bg-(--bg-hover)"
        >
          {all ? 'Show issues only' : 'Show all checks'}
        </button>
      </div>
      {shown.map((c, i) => {
        const tone = c.pass
          ? 'success'
          : c.level === 'fail'
            ? 'danger'
            : 'warning'
        const a = hexOf(c.fg, c.m)
        const b = hexOf(c.bg, c.m)
        const label =
          c.kind === 'hue'
            ? `--${c.fg} looks like --${c.bg}`
            : c.kind === 'input'
              ? `--${c.fg} is very light`
              : `--${c.fg} on --${c.bg}`
        const value =
          c.kind === 'hue'
            ? `Δhue ${c.val.toFixed(0)}° < 25°`
            : c.kind === 'input'
              ? `L ${c.val.toFixed(2)} > 0.9`
              : c.kind === 'state'
                ? `ΔL ${c.val.toFixed(3)} / ${c.need}`
                : `${c.val.toFixed(2)}:1 / ${c.need}:1`
        return (
          <div
            key={`${c.m}-${c.kind}-${c.fg}-${c.bg}-${i}`}
            className="grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-(--border) py-2"
          >
            <div
              className="grid h-8 place-items-center rounded-md font-bold"
              style={{
                background:
                  c.kind === 'hue'
                    ? `linear-gradient(90deg, ${a} 50%, ${b} 50%)`
                    : c.kind === 'state'
                      ? `linear-gradient(90deg, ${b} 50%, ${a} 50%)`
                      : b,
                color: a,
                border:
                  c.kind === 'line'
                    ? `2px solid ${a}`
                    : '1px solid var(--border)',
              }}
            >
              {c.kind === 'text' ? 'Aa' : c.kind === 'brand' ? '●' : ''}
            </div>
            <div className="min-w-0">
              <div
                className={`${mono} text-xs font-medium [overflow-wrap:anywhere]`}
              >
                {label}
              </div>
              <div className={muted}>
                {c.m} mode · {NOTES[c.kind] ?? 'text'}
              </div>
            </div>
            <span className={`${mono} text-xs whitespace-nowrap`}>{value}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: `var(--${tone}-bg)`,
                color: `var(--${tone}-text)`,
              }}
            >
              {c.pass ? 'Pass' : c.level === 'fail' ? 'Fail' : 'Warn'}
            </span>
          </div>
        )
      })}
      {shown.length === 0 && (
        <div className="border-t border-(--border) py-2 text-[13px] text-(--success-text)">
          All checks pass in both modes.
        </div>
      )}
    </div>
  )
}

type SemKind = 'bg' | 'line' | 'text' | 'ring' | 'fx'
const SEM_ROWS: {
  title: string
  note: string
  kind: SemKind
  tokens: [string, string, string?][]
}[] = [
  {
    title: 'Background',
    note: 'bg-*',
    kind: 'bg',
    tokens: [
      ['bg', 'background input'],
      ['bg-elevated', 'lighter than bg (literal)'],
      ['bg-inset', 'darker than bg (literal)'],
      ['bg-hover', '--bg-faint'],
      ['bg-active', '--bg-soft'],
      ['bg-disabled', '--bg-soft'],
    ],
  },
  {
    title: 'Border',
    note: 'border-*',
    kind: 'line',
    tokens: [
      ['border', 'border input'],
      ['border-strong', 'border + 20% font'],
      ['border-input', '--text-faint (3:1)'],
    ],
  },
  {
    title: 'Text',
    note: 'text-*',
    kind: 'text',
    tokens: [
      ['text', 'font input'],
      ['text-muted', '--text-soft (4.5:1)'],
      ['text-disabled', '--text-faint'],
      ['text-inverted', 'font-inverted input'],
    ],
  },
  {
    title: 'Link',
    note: 'text-*-link…',
    kind: 'text',
    tokens: [
      ['link', '--primary-text'],
      ['link-hover', '--primary-strong'],
    ],
  },
  {
    title: 'Focus',
    note: 'ring-*-focus-ring…',
    kind: 'ring',
    tokens: [
      ['focus-ring', '--primary-strong'],
      ['focus-ring-danger', '--danger-border-strong', 'danger'],
    ],
  },
  {
    title: 'Effects',
    note: 'own alpha',
    kind: 'fx',
    tokens: [
      ['overlay', 'black, per mode'],
      ['shadow', 'per mode'],
    ],
  },
]

const semStyle = (kind: SemKind, t: string): React.CSSProperties =>
  kind === 'bg'
    ? { background: `var(--${t})`, boxShadow: 'inset 0 0 0 1px var(--border)' }
    : kind === 'line'
      ? { background: 'var(--bg)', border: `2px solid var(--${t})` }
      : kind === 'text'
        ? {
            color: `var(--${t})`,
            background: t === 'text-inverted' ? 'var(--text)' : 'var(--bg)',
            boxShadow: 'inset 0 0 0 1px var(--border)',
          }
        : kind === 'ring'
          ? {
              background: 'var(--bg-elevated)',
              boxShadow: 'inset 0 0 0 1px var(--border)',
              outline: `2px solid var(--${t})`,
              outlineOffset: 2,
            }
          : t === 'overlay'
            ? {
                background:
                  'linear-gradient(var(--overlay), var(--overlay)), repeating-linear-gradient(45deg, var(--text) 0 6px, var(--bg) 6px 12px)',
              }
            : {
                background: 'var(--bg-elevated)',
                boxShadow:
                  '0 6px 16px var(--shadow), inset 0 0 0 1px var(--border)',
              }

/** What a semantic token points to now, from the generated css. */
const pointsTo = (
  pal: PaletteContext,
  mode: Mode,
  token: string,
  fallback: string,
) => {
  if (token in pal.palette.overrides)
    return `→ --${pal.palette.overrides[token]} (override)`
  const ref = pal.preview.refs[mode][token]
  return ref ? `→ --${ref}` : `→ ${fallback}`
}

export function Semantic({ pal, mode }: { pal: PaletteContext; mode: Mode }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div>
        <div className={heading}>Semantic</div>
        <div className={muted}>
          What components use, and what each token points to in {mode} mode. To
          re-point one, use Advanced in the Palette footer.
        </div>
      </div>
      <div className="flex flex-col">
        {SEM_ROWS.map((g) => (
          <div
            key={g.title}
            className="flex flex-wrap gap-x-4 gap-y-3 border-t border-(--border) py-3"
          >
            <div className="flex flex-[0_0_120px] flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{g.title}</span>
              <span className="text-[11px] text-(--text-muted)">{g.note}</span>
            </div>
            <div className="grid min-w-0 flex-[1_1_320px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {g.tokens.map(([t, map, needs]) => {
                const missing = needs && !pal.preview.status.includes(needs)
                return (
                  <div
                    key={t}
                    title={`--${t}`}
                    className="flex flex-col gap-1.5"
                    style={{ opacity: missing ? 0.6 : 1 }}
                  >
                    <div
                      className="grid h-10 place-items-center rounded-lg text-[15px] font-bold"
                      style={
                        missing
                          ? {
                              background: 'transparent',
                              border: '1px dashed var(--border-strong)',
                            }
                          : semStyle(g.kind, t)
                      }
                    >
                      {!missing && g.kind === 'text' ? 'Aa' : ''}
                    </div>
                    <div className="flex min-w-0 flex-col gap-px">
                      <span
                        className={`${mono} text-[11px] font-medium [overflow-wrap:anywhere]`}
                      >
                        --{t}
                      </span>
                      <span
                        className={`${mono} text-[11px] text-(--text-muted) [overflow-wrap:anywhere]`}
                      >
                        {missing
                          ? `needs a ${needs} status color`
                          : pointsTo(pal, mode, t, map)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <Intents pal={pal} mode={mode} />
    </div>
  )
}

type IntentKind = 'bg' | 'line' | 'on' | 'text'
const INTENT_ROWS: {
  group?: string
  tok: string
  kind: IntentKind
  note?: string
  map?: string
}[] = [
  { group: 'Fill', tok: 'X', kind: 'bg', note: 'bg-*-X' },
  { tok: '-hover', kind: 'bg', map: 'generated' },
  { tok: '-active', kind: 'bg', map: 'generated' },
  { tok: 'text-on-X', kind: 'on', note: 'on the fill, 4.5:1' },
  {
    group: 'Subtle',
    tok: '-bg',
    kind: 'bg',
    map: '--X-faint',
    note: 'bg-*-X-subtle',
  },
  { tok: '-bg-hover', kind: 'bg', map: '--X-soft' },
  { tok: '-bg-active', kind: 'bg', map: 'generated' },
  {
    group: 'Border',
    tok: '-border',
    kind: 'line',
    map: '--X-soft',
    note: 'border-*-X',
  },
  { tok: '-border-strong', kind: 'line', note: '3:1' },
  { group: 'Text', tok: '-text', kind: 'text', note: 'text-*-X, 4.5:1' },
]

function Intents({ pal, mode }: { pal: PaletteContext; mode: Mode }) {
  const ks = [...pal.preview.brand, ...pal.preview.status]
  const cols = `120px repeat(${ks.length}, minmax(92px, 1fr))`
  return (
    <>
      <div className="flex flex-col gap-1 pt-2">
        <div className="text-[13px] font-semibold">Intents</div>
        <div className={muted}>
          One column per brand and status color. An unset brand slot has no
          tokens.
        </div>
      </div>
      <div className="min-w-0 overflow-x-auto pb-1">
        <div
          className="flex flex-col"
          style={{ minWidth: 120 + ks.length * 100 }}
        >
          <div
            className="grid gap-2 pb-2"
            style={{ gridTemplateColumns: cols }}
          >
            <span />
            {ks.map((k) => (
              <div key={k} className="flex min-w-0 flex-col">
                <span
                  className={`${mono} text-xs font-semibold [overflow-wrap:anywhere]`}
                >
                  --{k}
                </span>
                <span className="text-[11px] text-(--text-muted)">
                  {BRAND.includes(k) ? 'brand' : 'status'}
                </span>
              </div>
            ))}
          </div>
          {INTENT_ROWS.map((r) => (
            <div
              key={r.tok}
              className="grid items-start gap-2 py-2"
              style={{
                gridTemplateColumns: cols,
                borderTop: r.group ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  {r.group ?? ''}
                </span>
                <span
                  className={`${mono} text-[11px] font-medium [overflow-wrap:anywhere]`}
                >
                  {r.tok === 'X'
                    ? '--X'
                    : r.tok === 'text-on-X'
                      ? '--text-on-X'
                      : r.tok}
                </span>
                <span className="text-[11px] text-(--text-muted)">
                  {r.note ?? ''}
                </span>
              </div>
              {ks.map((k) => {
                const t =
                  r.tok === 'X'
                    ? k
                    : r.tok === 'text-on-X'
                      ? `text-on-${k}`
                      : k + r.tok
                const v = `var(--${t})`
                const style: React.CSSProperties =
                  r.kind === 'bg'
                    ? {
                        background: v,
                        boxShadow: 'inset 0 0 0 1px var(--border)',
                      }
                    : r.kind === 'line'
                      ? { background: 'var(--bg)', border: `2px solid ${v}` }
                      : r.kind === 'on'
                        ? { background: `var(--${k})`, color: v }
                        : { background: `var(--${k}-bg)`, color: v }
                return (
                  <div key={k} className="flex min-w-0 flex-col gap-1">
                    <span
                      className={`${mono} min-h-[2.6em] text-[10px]/[1.3] font-medium [overflow-wrap:anywhere]`}
                    >
                      --{t}
                    </span>
                    <div
                      className="grid h-7 place-items-center rounded-md text-[13px] font-bold"
                      style={style}
                    >
                      {r.kind === 'on' || r.kind === 'text' ? 'Aa' : ''}
                    </div>
                    <span
                      className={`${mono} text-[10px] text-(--text-muted) [overflow-wrap:anywhere]`}
                    >
                      {pointsTo(
                        pal,
                        mode,
                        t,
                        r.map?.replaceAll('X', k) ?? 'input',
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
