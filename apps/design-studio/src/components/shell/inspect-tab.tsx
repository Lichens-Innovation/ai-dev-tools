import { useEffect, useMemo, useState } from 'react'
import { colorEditFor, propertyKind, swapCandidates } from '#/inspector/inspect'
import type { ColorEdit, PaletteShape } from '#/inspector/inspect'
import { useInspected } from '#/inspector/inspect-state'
import { openToken } from '#/inspector/pick'
import type { Picked } from '#/inspector/pick'
import { flagLabel, listTokens, traceTokens } from '#/inspector/trace'
import type { TraceRow } from '#/inspector/trace'
import { isEmpty, modeKey } from '#/palette/draft'
import type { Mode } from '#/palette/draft'
import type { PaletteContext } from '#/palette/palette-state'
import { useShell } from '#/studio/shell-state'
import { TokenSelect } from './token-select'

const MODES: Mode[] = ['light', 'dark']
const th =
  'sticky top-0 z-10 bg-(--bg-elev) px-2 py-1.5 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-(--ink-3) uppercase'
const td = 'border-t border-(--line) px-2 py-1.5 align-top'
const frame = 'rounded border border-(--line-2)'

/** The elements of the palette the picker needs, from the footer's draft. */
const shapeOf = (pal: PaletteContext): PaletteShape => ({
  inputs: Object.keys(pal.palette.inputs),
  tokens: pal.preview.tokens.map((t) => t.name),
  refs: pal.preview.refs,
  families: [...pal.preview.brand, ...pal.preview.status],
})

/**
 * The picked element, traced again whenever the palette draft changes: the page re-themes first, then the rows
 * follow it. Picking another element replaces it at once.
 */
function useLivePicked(picked: Picked | null, css: string | null) {
  const [live, setLive] = useState(picked)
  useEffect(() => setLive(picked), [picked])
  useEffect(() => {
    if (!picked?.element.isConnected) return
    const timer = setTimeout(() => {
      const { element } = picked
      if (!element.isConnected) return
      setLive({
        ...picked,
        rows: traceTokens(element),
        tokens: listTokens(element.ownerDocument),
      })
    }, 100)
    return () => clearTimeout(timer)
  }, [picked, css])
  return live
}

function TokenButton({ token }: { token: string }) {
  return (
    <button
      type="button"
      onClick={() => openToken(token)}
      title="Open in the palette"
      className="cursor-pointer rounded bg-(--primary-dim) px-1.5 font-mono text-xs text-(--primary) hover:underline"
    >
      {token}
    </button>
  )
}

function editNote(edit: ColorEdit, mode: Mode) {
  if (edit.kind === 'input')
    return (
      <>
        edits <code>--{edit.input}</code>
        {mode === 'dark' ? ' (dark)' : ' (light)'}, used by {edit.usedBy}{' '}
        {edit.usedBy === 1 ? 'token' : 'tokens'}
      </>
    )
  if (edit.kind === 'derived')
    return edit.base ? (
      <>
        <code>--{edit.token}</code> is derived: edit the base{' '}
        <code>--{edit.base}</code>
      </>
    ) : (
      <>
        <code>--{edit.token}</code> is derived from the neutrals: edit{' '}
        <code>--background</code> and <code>--font</code>
      </>
    )
  return null
}

/** One mode's value of a row: a color square that edits the end of the chain, or the plain value. */
function ValueCell({
  row,
  mode,
  pal,
  shape,
}: {
  row: TraceRow
  mode: Mode
  pal: PaletteContext
  shape: PaletteShape
}) {
  const value = row.resolved[mode]
  const color = propertyKind(row.property, row.resolved.light) === 'color'
  if (!color) return <code className="block truncate">{value || 'unset'}</code>
  const edit: ColorEdit = row.token
    ? colorEditFor(row.chain[mode], mode, shape)
    : { kind: 'none' }
  const picking = edit.kind === 'input'
  const input = picking ? pal.palette.inputs[edit.input] : null
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {input ? (
          <input
            type="color"
            aria-label={`${mode} color of ${row.property}: edit --${edit.kind === 'input' ? edit.input : ''}`}
            title={`Change --${edit.kind === 'input' ? edit.input : ''} in ${mode} mode`}
            value={input[modeKey(mode)]}
            onChange={(e) =>
              edit.kind === 'input' &&
              pal.setInput(edit.input, mode, e.target.value)
            }
            className={`${frame} size-6 flex-none cursor-pointer bg-transparent p-0`}
          />
        ) : (
          <i
            className={`${frame} size-6 flex-none`}
            style={{ background: value || 'transparent' }}
            title={
              edit.kind === 'derived'
                ? 'Derived from a base color: edit the base'
                : value
            }
          />
        )}
        <code className="truncate">{value || 'unset'}</code>
      </div>
      <div className="mt-0.5 text-[11px] text-(--ink-3)">
        {editNote(edit, mode)}
      </div>
    </div>
  )
}

function RowView({
  row,
  picked,
  pal,
  shape,
  swap,
}: {
  row: TraceRow
  picked: Picked
  pal: PaletteContext
  shape: PaletteShape
  swap: ((target: TraceRow, token: string) => void) | null
}) {
  const chain = row.chain.light
  const darkChain = row.chain.dark
  const [first, ...rest] = chain
  const color = propertyKind(row.property, row.resolved.light) === 'color'
  return (
    <tr>
      <td className={`${td} font-mono font-semibold`}>{row.property}</td>
      <td className={td}>
        {row.token ? (
          <div className="flex flex-wrap items-center gap-1">
            <TokenSelect
              current={first}
              color={color}
              disabled={!swap}
              title={
                swap
                  ? 'Use another token for this element only'
                  : 'A reference is read only: create a proposal to switch tokens'
              }
              options={(query) => swapCandidates(row, picked.tokens, query)}
              onPick={(token) => swap?.(row, token)}
            />
            {rest.map((token) => (
              <span key={token} className="flex items-center gap-1">
                <span aria-hidden>→</span>
                <TokenButton token={token} />
              </span>
            ))}
            {rest.length === 0 && (
              <button
                type="button"
                onClick={() => openToken(first)}
                title="Open in the palette"
                aria-label={`Open ${first} in the palette`}
                className="cursor-pointer text-(--ink-3) hover:text-(--ink)"
              >
                ↗
              </button>
            )}
            {darkChain.join() !== chain.join() && (
              <span className="text-(--ink-3)">
                (dark: {darkChain.join(' → ')})
              </span>
            )}
          </div>
        ) : (
          <span className="text-(--ink-3)">raw value</span>
        )}
      </td>
      {MODES.map((mode) => (
        <td key={mode} className={`${td} max-w-[220px]`}>
          <ValueCell row={row} mode={mode} pal={pal} shape={shape} />
        </td>
      ))}
      <td className={`${td} text-(--ink-3)`} title="Where it comes from">
        {row.source}
      </td>
      <td className={td}>
        {row.flag && (
          <span
            className={`font-medium ${row.flag.kind === 'off-token' ? 'text-(--red)' : 'text-(--ink-2)'}`}
          >
            {flagLabel(row.flag)}
            {row.flag.kind === 'literal' && (
              <>
                {' '}
                <TokenButton token={row.flag.token} />
              </>
            )}
          </span>
        )}
      </td>
    </tr>
  )
}

/**
 * The token trace of the element selected in the page: property, token chain, light and dark values, source and flags.
 * Each row has two actions: the color square edits the palette color at the end of the chain (the shared draft, so the
 * whole palette changes), the token name switches the token for this element only.
 */
export function InspectTab({ pal }: { pal: PaletteContext }) {
  const inspected = useInspected()
  const shell = useShell()
  const css = isEmpty(pal.draft) ? null : pal.preview.css
  const live = useLivePicked(inspected.picked, css)
  const shape = useMemo(() => shapeOf(pal), [pal.palette, pal.preview])

  if (!live)
    return (
      <p className="py-3 text-[13px] text-(--ink-3)">
        Nothing selected. Click an element in a reference, or select one in the
        editor of a proposal, to see the tokens it uses.
      </p>
    )
  const { createProposal, swap } = inspected
  return (
    <div className="pt-1">
      <div className="flex flex-wrap items-center gap-3 py-1.5">
        <code className="min-w-0 truncate text-xs" title={live.selector}>
          {live.selector}
        </code>
        {createProposal && (
          <>
            <span className="text-xs text-(--ink-3)">
              A reference is read only.
            </span>
            <button
              type="button"
              onClick={createProposal}
              className="h-7 cursor-pointer rounded-md border border-(--line) px-3 text-xs font-medium hover:bg-(--bg-2)"
            >
              Create proposal
            </button>
          </>
        )}
      </div>
      {live.rows.length === 0 ? (
        <p className="py-2 text-[13px] text-(--ink-3)">
          No token or measurable value on this element.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[820px] border-collapse text-xs"
            aria-label="Token trace"
          >
            <thead>
              <tr>
                {[
                  'Property',
                  'Token',
                  `Light${shell.mode === 'light' ? ' (shown)' : ''}`,
                  `Dark${shell.mode === 'dark' ? ' (shown)' : ''}`,
                  'Source',
                  'Flags',
                ].map((name) => (
                  <th key={name} className={th}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {live.rows.map((row) => (
                <RowView
                  key={row.property}
                  row={row}
                  picked={live}
                  pal={pal}
                  shape={shape}
                  swap={swap}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
