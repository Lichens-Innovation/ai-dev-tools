import { openToken } from '#/inspector/pick'
import type { Picked } from '#/inspector/pick'
import { flagLabel } from '#/inspector/trace'
import type { TokenInfo, TraceRow } from '#/inspector/trace'

const isColorProp = (property: string) =>
  /color|background|fill|stroke/.test(property)

/** The tokens a row can be swapped for: the semantic ones of its kind (all of its kind when the project has none). */
export function swapOptions(row: TraceRow, tokens: TokenInfo[]): TokenInfo[] {
  const kind = isColorProp(row.property) ? 'color' : 'size'
  const ofKind = tokens.filter((t) => t.kind === kind)
  const semantic = ofKind.filter((t) => t.semantic)
  return semantic.length > 0 ? semantic : ofKind
}

/** `declared` with its first `var(--x)` read from `token` instead. */
export const swapToken = (declared: string, token: string) =>
  declared.replace(/var\(\s*--[\w-]+/, `var(${token}`)

function Swatch({ value }: { value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <i
        className="size-3.5 flex-none rounded-sm border border-(--line-2)"
        style={{ background: value || 'transparent' }}
        hidden={!value}
      />
      <code className="truncate">{value || 'unset'}</code>
    </span>
  )
}

function TokenButton({ token }: { token: string }) {
  return (
    <button
      type="button"
      onClick={() => openToken(token)}
      title="Open in the palette"
      className="cursor-pointer rounded bg-(--primary-dim) px-1.5 font-mono text-(--primary) hover:underline"
    >
      {token}
    </button>
  )
}

function Row({
  row,
  options,
  onSwap,
}: {
  row: TraceRow
  options: TokenInfo[] | null
  onSwap: (target: TraceRow, token: string) => void
}) {
  const colorful = isColorProp(row.property)
  const chain = row.chain.light
  const darkChain = row.chain.dark
  return (
    <li className="space-y-1 border-b border-(--line) px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <b className="font-mono">{row.property}</b>
        <span className="truncate text-(--ink-3)" title="Where it comes from">
          {row.source}
        </span>
      </div>
      {row.token && (
        <div className="flex flex-wrap items-center gap-1">
          {chain.map((token, i) => (
            <span key={token} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>→</span>}
              <TokenButton token={token} />
            </span>
          ))}
          {darkChain.join() !== chain.join() && (
            <span className="text-(--ink-3)">
              (dark: {darkChain.join(' → ')})
            </span>
          )}
        </div>
      )}
      {row.flag && (
        <div
          className={`font-medium ${row.flag.kind === 'off-token' ? 'text-(--red)' : 'text-(--ink-2)'}`}
        >
          {flagLabel(row.flag)}
          {row.flag.kind === 'literal' && (
            <>
              {' '}
              <TokenButton token={row.flag.token} />
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(['light', 'dark'] as const).map((mode) => (
          <div key={mode} className="min-w-0">
            <small className="text-(--ink-3)">{mode}</small>
            {colorful ? (
              <Swatch value={row.resolved[mode]} />
            ) : (
              <code className="block truncate">
                {row.resolved[mode] || 'unset'}
              </code>
            )}
          </div>
        ))}
      </div>
      {options && row.token && options.length > 0 && (
        <label className="flex items-center gap-2 text-(--ink-3)">
          Swap
          <select
            value=""
            onChange={(e) => e.target.value && onSwap(row, e.target.value)}
            className="min-w-0 flex-1 rounded border border-(--line) bg-(--bg-elev) px-1 py-0.5 text-(--ink)"
          >
            <option value="">for another token…</option>
            {options
              .filter((t) => t.name !== row.token)
              .map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.values.light})
                </option>
              ))}
          </select>
        </label>
      )}
    </li>
  )
}

/**
 * The side panel of the selected element: every property that comes from a token (and the raw values worth a token),
 * with the chain, both modes' values and the source. In a proposal (`onSwap` given) a token can be swapped.
 */
export function TokenInspector({
  picked,
  onSwap,
}: {
  picked: Picked | null
  onSwap?: (row: TraceRow, token: string) => void
}) {
  if (!picked)
    return (
      <p className="p-3 text-xs text-(--ink-3)">
        Click an element to see the tokens it uses.
      </p>
    )
  return (
    <section aria-label="Token inspector">
      <header className="border-b border-(--line) px-3 py-2">
        <code className="block truncate text-xs" title={picked.selector}>
          {picked.selector}
        </code>
      </header>
      {picked.rows.length === 0 ? (
        <p className="p-3 text-xs text-(--ink-3)">
          No token or measurable value on this element.
        </p>
      ) : (
        <ul>
          {picked.rows.map((row) => (
            <Row
              key={row.property}
              row={row}
              options={onSwap ? swapOptions(row, picked.tokens) : null}
              onSwap={onSwap ?? (() => {})}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
