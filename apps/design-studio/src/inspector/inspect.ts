import type { Mode } from '#/palette/draft'
import type { TokenInfo, TraceRow } from './trace'

/*
 * What the Inspect tab does with a trace row, as pure functions: which tokens a row can be switched to (by the kind of
 * its property) and which palette color a color square edits (the end of the token chain).
 */

// --- the dropdown: tokens of the property's kind -----------------------------

export type PropertyKind =
  | 'color'
  | 'spacing'
  | 'radius'
  | 'font-size'
  | 'font-family'
  | 'other'

const COLOR_PROPS =
  /^(?:color|background(?:-color)?|(?:border|outline|text-decoration|caret|column-rule)(?:-[a-z]+)*-color|fill|stroke|accent-color)$/
const SPACING_PROPS =
  /^(?:padding|margin|gap|row-gap|column-gap|(?:padding|margin)-[a-z-]+|inset(?:-[a-z]+)*|top|right|bottom|left)$/
const RADIUS_PROPS = /^border(?:-[a-z]+)*-radius$/

const COLOR_VALUE =
  /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(.*\))$/i

/** The kind of token a CSS property takes, from its name (and its value for the ones a name cannot tell). */
export function propertyKind(property: string, value = ''): PropertyKind {
  if (COLOR_PROPS.test(property)) return 'color'
  if (RADIUS_PROPS.test(property)) return 'radius'
  if (SPACING_PROPS.test(property)) return 'spacing'
  if (property === 'font-size') return 'font-size'
  if (property === 'font-family') return 'font-family'
  // A border or shadow shorthand: a color value still wants a color.
  return COLOR_VALUE.test(value.trim()) ? 'color' : 'other'
}

const NAME_OF: Partial<Record<PropertyKind, RegExp>> = {
  spacing: /^--spacing(?:-|$)/,
  radius: /^--radius(?:-|$)/,
  'font-size': /^--text(?:-|$)/,
  'font-family': /^--font-(?!inverted$)/,
}

/** The kinds the project names by prefix (Tailwind v4 vocabulary): a size token of one is not offered for another. */
const NAMED = Object.values(NAME_OF)

/**
 * The tokens a row can be switched to, semantic ones first: colors for color properties, the spacing scale for
 * padding, margin and gap, radii for border-radius, type sizes for font-size. A project that does not name its size
 * tokens that way gets every size token that no other kind claims. `query` filters by name or value.
 */
export function swapCandidates(
  row: Pick<TraceRow, 'property' | 'resolved'>,
  tokens: TokenInfo[],
  query = '',
): TokenInfo[] {
  const kind = propertyKind(row.property, row.resolved.light)
  const matching = (t: TokenInfo) => {
    if (kind === 'color') return t.kind === 'color'
    if (kind === 'other') return false
    const named = NAME_OF[kind]
    if (kind === 'font-family') return !!named?.test(t.name)
    if (t.kind !== 'size') return false
    return !!named?.test(t.name)
  }
  let list = tokens.filter(matching)
  if (list.length === 0 && (kind === 'spacing' || kind === 'radius')) {
    // Unnamed scale: any size token that is not a type size, a radius or a breakpoint.
    list = tokens.filter(
      (t) =>
        t.kind === 'size' &&
        !NAMED.some((re) => re.test(t.name)) &&
        !/^--breakpoint-/.test(t.name),
    )
  }
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.values.light.toLowerCase().includes(q) ||
      t.values.dark.toLowerCase().includes(q),
  )
}

/** `declared` with its first `var(--x)` read from `token` instead. */
export const swapToken = (declared: string, token: string) =>
  declared.replace(/var\(\s*--[\w-]+/, `var(${token}`)

// --- the square: which palette color a row edits ----------------------------

/** What the picker needs to know of the drafted palette. Token names are without the leading `--`. */
export interface PaletteShape {
  /** The palette inputs (`primary`, `font`, `info`…): the colors with a value of their own. */
  inputs: string[]
  /** The generated and semantic tokens. */
  tokens: string[]
  /** What each semantic token references, per mode (`link` -> `primary-text`). */
  refs: Record<Mode, Record<string, string>>
  /** The brand and status intents, whose scales derive from their input. */
  families: string[]
}

export type ColorEdit =
  /** The end of the chain is a palette input: the square edits it. `usedBy` counts the tokens that follow it. */
  | { kind: 'input'; input: string; usedBy: number }
  /** A step computed from a base (`primary-strong`) or from the neutrals (`base` null): edit the base. */
  | { kind: 'derived'; token: string; base: string | null }
  /** Not a palette color (a project token, or a raw value). */
  | { kind: 'none' }

const bare = (token: string) => token.replace(/^--/, '')
const SUFFIX = /-(?:light|dark|lm|dm)$/
// The neutral tokens that carry an input's value as is (palette.ts writes `--bg: <background>`).
const NEUTRAL_INPUTS: Record<string, string> = {
  bg: 'background',
  text: 'font',
  'text-inverted': 'font-inverted',
}

/** Follows semantic references to the token that holds a value. */
function followRefs(name: string, mode: Mode, shape: PaletteShape): string {
  const refs = shape.refs[mode]
  let at = name
  for (let guard = 0; guard < 50 && at in refs; guard++) at = refs[at]
  return at
}

function classify(name: string, shape: PaletteShape): ColorEdit {
  const inputs = new Set(shape.inputs)
  const tokens = new Set(shape.tokens)
  // `--primary-light` is the per-mode value of `--primary`.
  const candidates = [name, name.replace(SUFFIX, '')]
  for (const candidate of candidates) {
    const input = inputs.has(candidate) ? candidate : NEUTRAL_INPUTS[candidate]
    if (input && inputs.has(input)) return { kind: 'input', input, usedBy: 0 }
  }
  for (const candidate of candidates) {
    const family = shape.families.find(
      (f) => candidate.startsWith(`${f}-`) || candidate === `text-on-${f}`,
    )
    if (family) return { kind: 'derived', token: candidates[1], base: family }
    if (tokens.has(candidate))
      return { kind: 'derived', token: candidates[1], base: null }
  }
  return { kind: 'none' }
}

/**
 * The palette color behind the end of a row's token chain in `mode`. A semantic token that the chain stops at (a
 * `light-dark()` value, say) is followed through the palette's references to the token that holds the value.
 */
export function colorEditFor(
  chain: string[],
  mode: Mode,
  shape: PaletteShape,
): ColorEdit {
  const end = chain.at(-1)
  if (!end) return { kind: 'none' }
  const target = classify(followRefs(bare(end), mode, shape), shape)
  if (target.kind !== 'input') return target
  const follows = (name: string) => {
    const hit = classify(followRefs(name, mode, shape), shape)
    return (
      (hit.kind === 'input' && hit.input === target.input) ||
      (hit.kind === 'derived' && hit.base === target.input)
    )
  }
  return {
    ...target,
    usedBy: shape.tokens.filter((t) => t !== target.input && follows(t)).length,
  }
}
