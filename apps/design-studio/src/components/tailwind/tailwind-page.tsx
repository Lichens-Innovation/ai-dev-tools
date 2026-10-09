import { useEffect, useMemo, useRef, useState } from 'react'
import type { Mode } from '#/palette/draft'
import { usePalette } from '#/palette/palette-state'
import type { PalettePreview } from '#/server/design-project'
import { useNavSections } from '#/studio/use-nav-sections'
import { ModeColumns, NO_PALETTE } from '#/components/palette/theme-scope'

type Kind = 'text' | 'line' | 'fill'
interface Entry {
  cls: string
  token: string
  kind: Kind
}

const ROLES = [
  ['text', 'Text', 'text-', 'text'],
  ['bg', 'Background', 'bg-', 'fill'],
  ['border', 'Border', 'border-', 'line'],
] as const
const UTILS = [
  'bg',
  'text',
  'border',
  'ring',
  'outline',
  'divide',
  'fill',
  'stroke',
  'shadow',
  'accent',
  'caret',
  'decoration',
  'placeholder',
]
const TEXTISH = ['text', 'caret', 'decoration', 'placeholder']
const LINEISH = ['border', 'ring', 'outline', 'divide', 'stroke']
const SUFFIXES = [
  '',
  '-hover',
  '-active',
  '-faint',
  '-soft',
  '-strong',
  '-intense',
  '-bg',
  '-bg-hover',
  '-bg-active',
  '-border',
  '-border-strong',
  '-text',
]

/** The neutrals first, then each brand and status color, its tokens in the order of SUFFIXES. */
function grouped(entries: Entry[], families: string[]): [string, Entry[]][] {
  const family = (t: string) =>
    t.startsWith('text-on-')
      ? t.slice(8)
      : (families.find((n) => t === n || t.startsWith(`${n}-`)) ?? 'neutral')
  const rank = (t: string, n: string) =>
    n === 'neutral'
      ? 0
      : t.startsWith('text-on-')
        ? SUFFIXES.length
        : SUFFIXES.indexOf(t.slice(n.length))
  const order = ['neutral', ...families]
  return order
    .map((n): [string, Entry[]] => [
      n,
      entries
        .filter((e) => family(e.token) === n)
        .sort((a, b) => rank(a.token, n) - rank(b.token, n)),
    ])
    .filter(([, list]) => list.length)
}

/** How a tile shows a token: as text on its background, as a 2px edge, or as a fill. */
function Swatch({ kind, token }: { kind: Kind; token: string }) {
  const base =
    'grid size-10 flex-none place-items-center rounded-lg text-[15px] font-bold'
  if (kind === 'text') {
    const on = token.startsWith('text-on-')
      ? `var(--${token.slice(8)})`
      : token === 'text-inverted'
        ? 'var(--text)'
        : 'var(--bg)'
    return (
      <div
        className={base}
        style={{
          background: on,
          color: `var(--${token})`,
          boxShadow: 'inset 0 0 0 1px var(--border)',
        }}
      >
        Aa
      </div>
    )
  }
  return (
    <div
      className={base}
      style={{
        background: kind === 'line' ? 'var(--bg)' : `var(--${token})`,
        boxShadow:
          kind === 'line'
            ? `inset 0 0 0 2px var(--${token})`
            : 'inset 0 0 0 1px var(--border)',
      }}
    />
  )
}

function Tile({
  entry,
  value,
  copied,
  onCopy,
}: {
  entry: Entry
  value: string | undefined
  copied: boolean
  onCopy: (cls: string) => void
}) {
  return (
    <button
      type="button"
      aria-label={`Copy ${entry.cls}`}
      onClick={() => onCopy(entry.cls)}
      className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[10px] border border-(--border) bg-(--bg-elevated) p-2 text-left text-inherit hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
    >
      <Swatch kind={entry.kind} token={entry.token} />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-mono text-xs font-medium [overflow-wrap:anywhere]">
          {entry.cls}
        </span>
        <span
          className="font-mono text-[11px] [overflow-wrap:anywhere]"
          style={{
            color: copied ? 'var(--success-text)' : 'var(--text-muted)',
          }}
        >
          {copied ? 'Copied' : `--${entry.token}${value ? ` · ${value}` : ''}`}
        </span>
      </span>
    </button>
  )
}

function Section({
  title,
  note,
  entries,
  families,
  values,
  copied,
  onCopy,
  nav,
  extra,
}: {
  title: string
  note: string
  entries: Entry[]
  families: string[]
  values: Map<string, string>
  copied: string | null
  onCopy: (cls: string) => void
  nav: boolean
  extra?: React.ReactNode
}) {
  const groups = grouped(entries, families)
  return (
    <section
      data-nav-section={nav ? title : undefined}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl tracking-tight">{title}</h2>
          <div className="text-xs text-(--text-muted)">{note}</div>
        </div>
        {extra}
      </div>
      {groups.length ? (
        groups.map(([name, list]) => (
          <div
            key={name}
            className="flex flex-col gap-2 border-t border-(--border) pt-3"
          >
            <div className="text-[11px] font-semibold tracking-wider text-(--text-muted) uppercase">
              {name}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
              {list.map((e) => (
                <Tile
                  key={e.cls}
                  entry={e}
                  value={values.get(e.token)}
                  copied={copied === e.cls}
                  onCopy={onCopy}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="text-(--text-muted)">No class matches the filter.</div>
      )}
    </section>
  )
}

function Classes({
  preview,
  mode,
  first,
  query,
  util,
  setUtil,
  copied,
  onCopy,
}: {
  preview: PalettePreview
  mode: Mode
  first: boolean
  query: string
  util: string
  setUtil: (u: string) => void
  copied: string | null
  onCopy: (cls: string) => void
}) {
  const ns = preview.namespace ?? ''
  const classes = preview.classes
  const families = useMemo(
    () => [...preview.brand, ...preview.status],
    [preview.brand, preview.status],
  )
  const values = useMemo(
    () => new Map(preview.tokens.map((t) => [t.name, t[mode]])),
    [preview.tokens, mode],
  )
  const q = query.trim().toLowerCase()
  const hit = (e: Entry) =>
    !q || e.cls.includes(q) || `--${e.token}`.includes(q)

  const kind: Kind = TEXTISH.includes(util)
    ? 'text'
    : LINEISH.includes(util)
      ? 'line'
      : 'fill'
  const any = preview.tokens
    .map(
      (t): Entry => ({ cls: `${util}-${ns}-${t.name}`, token: t.name, kind }),
    )
    .filter(hit)

  return (
    <div className="flex flex-col gap-12 p-6">
      {classes &&
        ROLES.map(([role, title, prefix, roleKind]) => {
          const all = classes[role].map(
            ([name, token]): Entry => ({
              cls: prefix + name,
              token,
              kind: roleKind,
            }),
          )
          const shown = all.filter(hit)
          return (
            <Section
              key={role}
              title={title}
              note={`${shown.length} of ${all.length} classes`}
              entries={shown}
              families={families}
              values={values}
              copied={copied}
              onCopy={onCopy}
              nav={first}
            />
          )
        })}
      <Section
        title="Any utility"
        note={`Every token by its full name, on any color utility: ${any.length} of ${preview.tokens.length} tokens`}
        entries={any}
        families={families}
        values={values}
        copied={copied}
        onCopy={onCopy}
        nav={first}
        extra={
          <div
            role="group"
            aria-label="Utility"
            className="flex flex-wrap gap-1"
          >
            {UTILS.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={u === util}
                onClick={() => setUtil(u)}
                className="h-[30px] cursor-pointer rounded-[7px] border border-(--border) bg-transparent px-2.5 font-mono text-xs font-medium hover:bg-(--bg-hover) aria-pressed:border-transparent aria-pressed:bg-(--primary) aria-pressed:text-(--text-on-primary)"
              >
                {u}
              </button>
            ))}
          </div>
        }
      />
    </div>
  )
}

/** The Tailwind classes card: every utility the palette generates under the namespace, with a live swatch. A click copies the class. */
export function TailwindPage() {
  const pal = usePalette()
  const [query, setQuery] = useState('')
  const [util, setUtil] = useState('bg')
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  useNavSections(() => ({ document, window }), [pal?.preview.namespace])

  if (!pal) return <p className="p-6 text-(--ink-2)">{NO_PALETTE}</p>

  const onCopy = (cls: string) => {
    void navigator.clipboard.writeText(cls).then(() => {
      setCopied(cls)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), 1200)
    })
  }

  return (
    <div className="mx-auto max-w-[1216px]">
      <header className="flex flex-col gap-3 p-6 pb-0">
        <div>
          <div className="text-xs font-semibold tracking-widest text-(--ink-3) uppercase">
            {pal.preview.namespace ? `Namespace: ${pal.preview.namespace}` : ''}
          </div>
          <h1 className="m-0 text-[28px] tracking-tight">Tailwind classes</h1>
          <p className="mt-1 max-w-[70ch] text-(--ink-2)">
            Every palette utility for the project, with what it points to in the
            current mode. Click a class to copy it. Never add an opacity
            modifier (<code className="font-mono text-xs">/50</code>): use the
            state's own class.
          </p>
        </div>
        {pal.preview.namespace && (
          <input
            type="search"
            value={query}
            placeholder="Filter: muted, danger, hover…"
            aria-label="Filter the classes"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            className="h-[38px] w-[min(360px,100%)] rounded-lg border border-(--line-2) bg-(--bg-elev) px-3 outline-none focus:border-(--primary)"
          />
        )}
      </header>
      {pal.preview.namespace ? (
        <ModeColumns>
          {(mode, first) => (
            <Classes
              preview={pal.preview}
              mode={mode}
              first={first}
              query={query}
              util={util}
              setUtil={setUtil}
              copied={copied}
              onCopy={onCopy}
            />
          )}
        </ModeColumns>
      ) : (
        <p className="m-6 rounded-xl border border-(--line) bg-(--bg-elev) p-4 text-(--ink-2)">
          No Tailwind namespace yet: set palette.namespace in
          design.manifest.json, then re-seed the palette card.
        </p>
      )}
    </div>
  )
}
