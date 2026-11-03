/* eslint-disable @typescript-eslint/no-unnecessary-condition -- the CSSOM and regex groups are loosely typed: rules, groups and `style` can be missing at runtime */
import type { Mode } from '#/palette/draft'

/**
 * The token inspector's engine: a pure function over a document's CSSOM (the iframe's, in the studio). For an element
 * it keeps the winning declaration per property and follows `var()` chains through the custom properties set on
 * `:root` and `[data-theme]`. Nothing here touches the DOM beyond reading `styleSheets` and calling `matches`.
 */

export const MODES: Mode[] = ['light', 'dark']

export type ByMode<T> = Record<Mode, T>

export type Flag = { kind: 'literal'; token: string } | { kind: 'off-token' }

export interface TraceRow {
  /** The CSS property as declared (`padding`, `background-color`…). */
  property: string
  /** The winning declaration's value, as written. */
  declared: string
  /** The class (`bg-noa-primary`), the rule's selector, or `style attribute`. */
  source: string
  /** The first token the value reads (`--primary`); null for a raw value. */
  token: string | null
  /** From `token`, the tokens each points to (`--primary`, `--blue-base`), per mode. */
  chain: ByMode<string[]>
  /** The value with every `var()` replaced, per mode. */
  resolved: ByMode<string>
  /** Set on a raw value: it equals a token's value, or it matches none. */
  flag: Flag | null
}

export interface TokenInfo {
  name: string
  kind: 'color' | 'size' | 'other'
  /** An alias of another token (`--primary: var(--blue-base)`): the layer designers should use. */
  semantic: boolean
  values: ByMode<string>
}

// --- cascade -----------------------------------------------------------------

type Spec = [number, number, number]

const LAYER_NONE = Number.MAX_SAFE_INTEGER

interface RuleEntry {
  rule: CSSStyleRule
  selectors: string[]
  /** Index of the cascade layer by first appearance; LAYER_NONE when unlayered. */
  layer: number
  order: number
}

interface Decl {
  prop: string
  value: string
  important: boolean
  inline: boolean
  layer: number
  spec: Spec
  order: number
  /** The selector that matched (or, for a root token, the one that scopes it). */
  selector: string
}

/** Splits at the commas that are not inside parentheses, brackets or quotes. */
function splitTop(text: string, separator = ','): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

const IDENT = String.raw`(?:\\.|[\w-])+`

const compareSpec = (a: Spec, b: Spec) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** The specificity of one complex selector. */
export function specificityOf(selector: string): Spec {
  let [a, b, c]: Spec = [0, 0, 0]
  let s = selector
  s = s.replace(new RegExp(`:where\\((?:[^()]|\\([^()]*\\))*\\)`, 'gi'), '')
  // :is() / :not() / :has() count as their most specific argument.
  s = s.replace(
    /:(?:is|not|has|matches|-webkit-any)\(((?:[^()]|\([^()]*\))*)\)/gi,
    (_, args: string) => {
      const best = splitTop(args).map(specificityOf).sort(compareSpec).at(-1)
      if (best) {
        a += best[0]
        b += best[1]
        c += best[2]
      }
      return ''
    },
  )
  s = s.replace(/\[[^\]]*\]/g, () => {
    b++
    return ''
  })
  s = s.replace(new RegExp(`#${IDENT}`, 'g'), () => {
    a++
    return ''
  })
  s = s.replace(new RegExp(`\\.${IDENT}`, 'g'), () => {
    b++
    return ''
  })
  s = s.replace(/::[\w-]+(?:\([^)]*\))?/g, () => {
    c++
    return ''
  })
  s = s.replace(/:[\w-]+(?:\([^)]*\))?/g, () => {
    b++
    return ''
  })
  s = s.replace(/(^|[\s>+~(])([a-zA-Z][\w-]*)/g, (_m, lead: string) => {
    c++
    return lead
  })
  return [a, b, c]
}

interface RuleLike {
  constructor: { name: string }
  cssRules?: ArrayLike<RuleLike>
  selectorText?: string
  conditionText?: string
  media?: { mediaText: string }
  name?: string
  nameList?: string[]
}

/**
 * Every style rule of the document, in cascade order, with its layer. Media and supports conditions are evaluated
 * against the document's window; rules of an unreadable (cross-origin) sheet are skipped.
 */
function collectRules(doc: Document): RuleEntry[] {
  const entries: RuleEntry[] = []
  const layers: string[] = []
  const win = doc.defaultView
  let order = 0

  const layerIndex = (name: string) => {
    let i = layers.indexOf(name)
    if (i < 0) i = layers.push(name) - 1
    return i
  }

  const walk = (rules: ArrayLike<RuleLike>, layerPath: string | null) => {
    for (const rule of Array.from(rules)) {
      const kind = rule.constructor.name
      if (rule.selectorText !== undefined) {
        entries.push({
          rule: rule as unknown as CSSStyleRule,
          selectors: splitTop(rule.selectorText),
          layer: layerPath === null ? LAYER_NONE : layerIndex(layerPath),
          order: order++,
        })
      } else if (kind === 'CSSLayerStatementRule') {
        for (const name of rule.nameList ?? []) layerIndex(name)
      } else if (kind === 'CSSLayerBlockRule' && rule.cssRules) {
        const name = rule.name || `(anonymous ${layers.length})`
        const path = layerPath === null ? name : `${layerPath}.${name}`
        layerIndex(path)
        walk(rule.cssRules, path)
      } else if (kind === 'CSSMediaRule' && rule.cssRules) {
        const text = rule.media?.mediaText ?? rule.conditionText ?? ''
        let on = true
        try {
          on = win ? win.matchMedia(text).matches : true
        } catch {
          // an unparsable query: keep the rules
        }
        if (on) walk(rule.cssRules, layerPath)
      } else if (kind === 'CSSSupportsRule' && rule.cssRules) {
        let on = true
        try {
          on = win?.CSS?.supports
            ? win.CSS.supports(rule.conditionText ?? '')
            : true
        } catch {
          // keep the rules
        }
        if (on) walk(rule.cssRules, layerPath)
      }
    }
  }

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    walk(rules, null)
  }
  return entries
}

/** Parses the declarations of a style block from its serialization (which keeps shorthands that hold a `var()`). */
export function parseDeclarations(
  cssText: string,
): { prop: string; value: string; important: boolean }[] {
  const out: { prop: string; value: string; important: boolean }[] = []
  for (const part of splitTop(cssText, ';')) {
    const colon = part.indexOf(':')
    if (colon < 1) continue
    const prop = part.slice(0, colon).trim()
    let value = part.slice(colon + 1).trim()
    const important = /\s*!\s*important$/i.test(value)
    if (important) value = value.replace(/\s*!\s*important$/i, '')
    out.push({
      prop: prop.startsWith('--') ? prop : prop.toLowerCase(),
      value,
      important,
    })
  }
  return out
}

/** A shorthand takes part in the cascade of the longhands it sets. */
const COVERS: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'border-radius': [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ],
  gap: ['row-gap', 'column-gap'],
  background: ['background-color'],
  'border-color': [
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
  ],
}
const slotsOf = (prop: string) => COVERS[prop] ?? [prop]

/** True when `a` wins over `b`: importance, then inline, then layer, then specificity, then order. */
function beats(a: Decl, b: Decl): boolean {
  if (a.important !== b.important) return a.important
  if (a.inline !== b.inline) return a.inline
  // Layers flip for important declarations: the earliest layer wins.
  const la = a.important ? -a.layer : a.layer
  const lb = b.important ? -b.layer : b.layer
  if (la !== lb) return la > lb
  const s = compareSpec(a.spec, b.spec)
  if (s !== 0) return s > 0
  return a.order > b.order
}

function declsOf(
  entry: RuleEntry,
  selector: string,
  spec: Spec,
  only?: (prop: string) => boolean,
): Decl[] {
  return parseDeclarations(entry.rule.style.cssText)
    .filter((d) => !only || only(d.prop))
    .map((d) => ({
      ...d,
      inline: false,
      layer: entry.layer,
      spec,
      order: entry.order,
      selector,
    }))
}

// --- root tokens ------------------------------------------------------------

const ROOT_SCOPE = new RegExp(
  String.raw`^(?::root|html|:host)?(?:\[data-theme(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([\w-]+)))?\s*\]|\.(dark|light))?$`,
  'i',
)

/** The modes a selector scopes tokens to (`:root` all of them, `[data-theme='dark']` one), or null if it is neither. */
function rootScopeOf(selector: string): Mode[] | null {
  const m = ROOT_SCOPE.exec(selector.trim())
  if (!m || selector.trim() === '') return null
  const value = m[1] ?? m[2] ?? m[3] ?? m[4]
  if (value === undefined) return MODES
  return MODES.filter((mode) => mode === value.toLowerCase())
}

type RootTokens = ByMode<Map<string, Decl>>

/** The winning declaration of every custom property set on `:root` / `[data-theme]`, per mode. */
function collectRootTokens(entries: RuleEntry[]): RootTokens {
  const roots: RootTokens = { light: new Map(), dark: new Map() }
  for (const entry of entries) {
    for (const selector of entry.selectors) {
      const modes = rootScopeOf(selector)
      if (!modes || modes.length === 0) continue
      const spec = specificityOf(selector)
      for (const d of declsOf(entry, selector, spec, (p) =>
        p.startsWith('--'),
      )) {
        for (const mode of modes) {
          const current = roots[mode].get(d.prop)
          if (!current || beats(d, current)) roots[mode].set(d.prop, d)
        }
      }
    }
  }
  return roots
}

const VAR_START = /var\(\s*(--[\w-]+)/g

/** Finds each `var(--x, fallback)` in a value: its span, name and fallback. */
function varCalls(value: string) {
  const calls: {
    start: number
    end: number
    name: string
    fallback: string | null
  }[] = []
  let from = 0
  for (;;) {
    const i = value.indexOf('var(', from)
    if (i < 0) break
    let depth = 0
    let end = -1
    for (let j = i + 3; j < value.length; j++) {
      if (value[j] === '(') depth++
      else if (value[j] === ')' && --depth === 0) {
        end = j + 1
        break
      }
    }
    if (end < 0) break
    const [name = '', ...rest] = splitTop(value.slice(i + 4, end - 1))
    calls.push({
      start: i,
      end,
      name: name.trim(),
      fallback: rest.length ? rest.join(',').trim() : null,
    })
    from = end
  }
  return calls
}

/** The value with every `var()` replaced by what it resolves to in `mode`. */
function resolve(
  value: string,
  mode: Mode,
  roots: RootTokens,
  depth = 0,
): string {
  if (depth > 16) return value
  let out = ''
  let at = 0
  for (const call of varCalls(value)) {
    out += value.slice(at, call.start)
    const token = roots[mode].get(call.name)
    const inner = token
      ? resolve(token.value, mode, roots, depth + 1)
      : call.fallback !== null
        ? resolve(call.fallback, mode, roots, depth + 1)
        : ''
    out += inner
    at = call.end
  }
  return (out + value.slice(at)).replace(/\s+/g, ' ').trim()
}

/** `--primary`, then the token it is an alias of, and so on. */
function chainOf(token: string, mode: Mode, roots: RootTokens): string[] {
  const chain = [token]
  for (let i = 0; i < 16; i++) {
    const decl = roots[mode].get(chain.at(-1)!)
    const calls = decl ? varCalls(decl.value) : []
    const only = calls[0]
    if (
      !decl ||
      !only ||
      only.start !== 0 ||
      only.end !== decl.value.length ||
      chain.includes(only.name)
    )
      break
    chain.push(only.name)
  }
  return chain
}

// --- values ------------------------------------------------------------------

const COLOR_LIKE =
  /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(.*\))$/i
const SIZE_LIKE = /^-?(?:\d*\.)?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|ch|pt)$/i
const isZero = (v: string) => parseFloat(v) === 0

/** Properties whose raw values are worth comparing with the tokens. */
const TOKEN_PROPS =
  /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?-color|outline-color|fill|stroke|caret-color|border-color|(?:border-(?:top|bottom)-(?:left|right)-)?radius|border-radius|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|(?:row-|column-)?gap|font-size)$/

function normalize(value: string): string {
  let v = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (short)
    v = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(v)
  if (rgb)
    v =
      '#' +
      [rgb[1], rgb[2], rgb[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
  return v
}

const kindOf = (value: string): TokenInfo['kind'] =>
  COLOR_LIKE.test(value.trim())
    ? 'color'
    : SIZE_LIKE.test(value.trim())
      ? 'size'
      : 'other'

/** The custom properties of the document, resolved per mode. Aliases first, then the others in source order. */
export function listTokens(doc: Document): TokenInfo[] {
  return tokensFrom(collectRootTokens(collectRules(doc)))
}

function tokensFrom(roots: RootTokens): TokenInfo[] {
  const names = new Set([...roots.light.keys(), ...roots.dark.keys()])
  const tokens: TokenInfo[] = []
  for (const name of names) {
    const values: ByMode<string> = {
      light: resolve(`var(${name})`, 'light', roots),
      dark: resolve(`var(${name})`, 'dark', roots),
    }
    const raw =
      roots.light.get(name)?.value ?? roots.dark.get(name)?.value ?? ''
    const calls = varCalls(raw)
    tokens.push({
      name,
      kind: kindOf(values.light || values.dark),
      semantic:
        calls.length === 1 &&
        calls[0].start === 0 &&
        calls[0].end === raw.length,
      values,
    })
  }
  return tokens.sort((a, b) => Number(b.semantic) - Number(a.semantic))
}

// --- the trace ---------------------------------------------------------------

const unescapeIdent = (s: string) =>
  s
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/\\(.)/g, '$1')

/** `.bg-noa-primary` -> `bg-noa-primary` (also `.hover\:x` unescaped); any other selector stays as written. */
function sourceOf(decl: Decl): string {
  if (decl.inline) return 'style attribute'
  const single = new RegExp(`^\\.(${IDENT})$`).exec(decl.selector)
  return single ? unescapeIdent(single[1]) : decl.selector
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector)
  } catch {
    return false
  }
}

/** The winning declaration per property for an element. */
function winners(el: Element, entries: RuleEntry[]): Decl[] {
  const matched: Decl[] = []
  for (const entry of entries) {
    let best: { selector: string; spec: Spec } | null = null
    for (const selector of entry.selectors) {
      if (!safeMatches(el, selector)) continue
      const spec = specificityOf(selector)
      if (!best || compareSpec(spec, best.spec) > 0) best = { selector, spec }
    }
    if (best) matched.push(...declsOf(entry, best.selector, best.spec))
  }
  const style = (el as HTMLElement).style
  if (style?.cssText) {
    for (const d of parseDeclarations(style.cssText))
      matched.push({
        ...d,
        inline: true,
        layer: LAYER_NONE,
        spec: [1, 0, 0],
        order: Number.MAX_SAFE_INTEGER,
        selector: '',
      })
  }
  const slotBest = new Map<string, Decl>()
  for (const d of matched) {
    if (d.prop.startsWith('--')) continue
    for (const slot of slotsOf(d.prop)) {
      const current = slotBest.get(slot)
      if (!current || beats(d, current)) slotBest.set(slot, d)
    }
  }
  return [...new Set(slotBest.values())]
}

/** A raw value's token: the (preferably semantic) token whose value it equals, in either mode. */
function matchLiteral(
  value: string,
  tokens: TokenInfo[],
): string | null | false {
  const parts = splitTop(value, ' ').filter((p) => {
    const v = p.trim()
    return (COLOR_LIKE.test(v) || SIZE_LIKE.test(v)) && !isZero(v)
  })
  if (parts.length === 0) return false
  for (const part of parts) {
    const want = normalize(part)
    const hit = tokens.find(
      (t) =>
        t.kind !== 'other' &&
        MODES.some(
          (m) => t.values[m] !== '' && normalize(t.values[m]) === want,
        ),
    )
    if (hit) return hit.name
  }
  return null
}

/**
 * Every style property of `el` that comes from a token, or holds a raw value worth tracing back to one. A value read
 * from `var(--x)` is a token row; a raw color, radius, spacing or font size is flagged `literal` when it equals a
 * token's value and `off-token` when it matches none.
 */
export function traceTokens(el: Element): TraceRow[] {
  const doc = el.ownerDocument
  const entries = collectRules(doc)
  const roots = collectRootTokens(entries)
  const tokens = tokensFrom(roots)
  const rows: TraceRow[] = []

  for (const decl of winners(el, entries)) {
    const first = new RegExp(VAR_START.source).exec(decl.value)
    const both = <T>(f: (mode: Mode) => T): ByMode<T> => ({
      light: f('light'),
      dark: f('dark'),
    })
    if (first) {
      const token = first[1]
      rows.push({
        property: decl.prop,
        declared: decl.value,
        source: sourceOf(decl),
        token,
        chain: both((m) => chainOf(token, m, roots)),
        resolved: both((m) => resolve(decl.value, m, roots)),
        flag: null,
      })
      continue
    }
    if (!TOKEN_PROPS.test(decl.prop)) continue
    const match = matchLiteral(decl.value, tokens)
    if (match === false) continue
    rows.push({
      property: decl.prop,
      declared: decl.value,
      source: sourceOf(decl),
      token: null,
      chain: { light: [], dark: [] },
      resolved: { light: decl.value, dark: decl.value },
      flag:
        match === null
          ? { kind: 'off-token' }
          : { kind: 'literal', token: match },
    })
  }
  return rows
}

/** A short human label of a flag: `literal, matches --x` or `off-token`. */
export const flagLabel = (flag: Flag) =>
  flag.kind === 'literal' ? `literal, matches ${flag.token}` : 'off-token'

// --- a stable selector -------------------------------------------------------

// GrapesJS names the elements it creates `i` + a few base-36 characters: not stable across a reload.
const GENERATED_ID = /^i[a-z0-9]{2,5}$/

const cssEscape = (s: string) => s.replace(/([^\w-])/g, '\\$1')

/**
 * A selector that finds `el` again in its document: its id when it has a meaningful one, else a structural path.
 * `root` is the element standing for `<body>` (the editor's canvas wraps the body in one).
 */
export function selectorFor(el: Element, root?: Element): string {
  const doc = el.ownerDocument
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== doc.documentElement) {
    if (node === (root ?? doc.body)) {
      parts.unshift('body')
      break
    }
    if (node.id && !GENERATED_ID.test(node.id)) {
      const sel = `#${cssEscape(node.id)}`
      if (doc.querySelectorAll(sel).length === 1) {
        parts.unshift(sel)
        break
      }
    }
    const tag = node.tagName.toLowerCase()
    const same = Array.from(node.parentElement?.children ?? []).filter(
      (c) => c.tagName === node!.tagName,
    )
    parts.unshift(
      same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag,
    )
    node = node.parentElement
  }
  return parts.join(' > ')
}

/** Markup cut to `max` characters. */
export function excerptOf(html: string, max = 600): string {
  return html.length > max ? `${html.slice(0, max)}…` : html
}
