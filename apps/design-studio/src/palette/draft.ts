/*
 * The palette draft: the changes made in the footer or on the palette page on top of the saved palette. Pure data
 * helpers, ported from the Claude Design navbar: the draft only holds what differs from the saved values, so a change
 * that goes back to the saved value drops out.
 */
import type { PaletteInputs } from '#/server/design-project'

export type Mode = 'light' | 'dark'
export type ModeKey = 'lm' | 'dm'

export interface Saved {
  inputs: PaletteInputs
  tokens: Record<string, string>
  overrides: Record<string, string>
  hash: string
}

/** Changed inputs by name (a mode missing keeps its saved value); null removes an input. */
export type InputsDraft = Record<string, { lm?: string; dm?: string } | null>
export interface Draft {
  inputs: InputsDraft
  tokens: Record<string, string>
  /** token -> target; null goes back to the generated reference. */
  overrides: Record<string, string | null>
}

export const EMPTY_DRAFT: Draft = { inputs: {}, tokens: {}, overrides: {} }

export const modeKey = (mode: Mode): ModeKey => (mode === 'dark' ? 'dm' : 'lm')

export function normHex(value: string): string {
  let hex = value.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(hex))
    hex = '#' + [...hex.slice(1)].map((c) => c + c).join('')
  return hex
}
export const isHex = (value: string) => /^#[0-9a-f]{6}$/.test(normHex(value))

export const isBreakpoint = (name: string) => name.startsWith('breakpoint-')
/** A token value that can reach a stylesheet: not empty, no `;`, `{` or `}`. */
export const validToken = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '' && !/[;{}]/.test(value)

export function mergeInputs(saved: Saved, draft: Draft): PaletteInputs {
  const out: PaletteInputs = {}
  for (const [name, value] of Object.entries(saved.inputs)) {
    const change = draft.inputs[name]
    if (change !== null) out[name] = { ...value, ...change }
  }
  for (const [name, change] of Object.entries(draft.inputs)) {
    if (change && !(name in saved.inputs) && change.lm && change.dm)
      out[name] = { lm: change.lm, dm: change.dm }
  }
  return out
}

/** The draft that turns the saved inputs into `inputs`. */
export function diffInputs(saved: Saved, inputs: PaletteInputs): InputsDraft {
  const draft: InputsDraft = {}
  for (const [name, base] of Object.entries(saved.inputs)) {
    const value = inputs[name] as PaletteInputs[string] | undefined
    if (!value) {
      draft[name] = null
      continue
    }
    for (const key of ['lm', 'dm'] as const) {
      if (isHex(value[key]) && normHex(value[key]) !== normHex(base[key]))
        draft[name] = { ...draft[name], [key]: normHex(value[key]) }
    }
  }
  for (const [name, value] of Object.entries(inputs)) {
    if (!(name in saved.inputs) && isHex(value.lm) && isHex(value.dm))
      draft[name] = { lm: normHex(value.lm), dm: normHex(value.dm) }
  }
  return draft
}

export const mergeTokens = (saved: Saved, draft: Draft) => ({
  ...saved.tokens,
  ...draft.tokens,
})

export function diffTokens(
  saved: Saved,
  tokens: Record<string, string>,
): Draft['tokens'] {
  const draft: Draft['tokens'] = {}
  for (const [name, base] of Object.entries(saved.tokens)) {
    const value = tokens[name] as string | undefined
    if (!isBreakpoint(name) && validToken(value) && value.trim() !== base)
      draft[name] = value.trim()
  }
  return draft
}

export function mergeOverrides(
  saved: Saved,
  draft: Draft,
): Record<string, string> {
  const out = { ...saved.overrides }
  for (const [token, target] of Object.entries(draft.overrides)) {
    if (target === null) delete out[token]
    else out[token] = target
  }
  return out
}

export function diffOverrides(
  saved: Saved,
  overrides: Record<string, string>,
): Draft['overrides'] {
  const draft: Draft['overrides'] = {}
  for (const token of Object.keys(saved.overrides)) {
    if (!(token in overrides)) draft[token] = null
  }
  for (const [token, target] of Object.entries(overrides)) {
    if (target !== saved.overrides[token]) draft[token] = target
  }
  return draft
}

export const isEmpty = (draft: Draft) =>
  Object.keys(draft.inputs).length === 0 &&
  Object.keys(draft.tokens).length === 0 &&
  Object.keys(draft.overrides).length === 0

/** The number the footer's badge shows: one per changed mode value, token and override. */
export function countChanges(draft: Draft): number {
  const inputs = Object.values(draft.inputs).reduce(
    (sum, change) => sum + (change ? Object.keys(change).length : 1),
    0,
  )
  return (
    inputs +
    Object.keys(draft.tokens).length +
    Object.keys(draft.overrides).length
  )
}

/** The full palette a draft makes, as the store takes it. */
export const toPalette = (saved: Saved, draft: Draft) => ({
  inputs: mergeInputs(saved, draft),
  tokens: mergeTokens(saved, draft),
  overrides: mergeOverrides(saved, draft),
})

/** The same changes against another saved palette (after the file changed): what no longer differs drops out. */
export function rebase(from: Saved, to: Saved, draft: Draft): Draft {
  const palette = toPalette(from, draft)
  return {
    inputs: diffInputs(to, palette.inputs),
    tokens: diffTokens(to, palette.tokens),
    overrides: diffOverrides(to, palette.overrides),
  }
}

/** A stored draft that is not shaped like one is dropped. */
export function parseDraft(raw: string | null): Draft {
  if (!raw) return EMPTY_DRAFT
  try {
    const value = JSON.parse(raw) as Partial<Draft> | null
    const object = (x: unknown): x is Record<string, unknown> =>
      !!x && typeof x === 'object' && !Array.isArray(x)
    if (
      !object(value) ||
      !object(value.inputs) ||
      !object(value.tokens) ||
      !object(value.overrides)
    )
      return EMPTY_DRAFT
    return value as Draft
  } catch {
    return EMPTY_DRAFT
  }
}
