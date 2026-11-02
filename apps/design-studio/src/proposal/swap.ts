/**
 * The one edit the HTML view makes by hand: a token swap from the Inspect tab. It writes a `#id { property: value }`
 * rule into the page's `<style data-studio>` block, giving the element a `ds-<hex>` id when it has none, and leaves
 * the rest of the file as it is. Pure over strings and a DOMParser, so it runs in the browser and in jsdom.
 */
import { applyEdits, parsePage } from './page-document'

const IDENT = /^[A-Za-z][\w-]*$/

interface Rule {
  selector: string
  body: string
  start: number
  end: number
}

/** The top-level rules of a stylesheet (at-rules count as rules, their selector being the prelude). */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = []
  let depth = 0
  let open = -1
  let from = 0
  let quote = ''
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '{') {
      if (depth === 0) open = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        rules.push({
          selector: css.slice(from, open).trim(),
          body: css.slice(open + 1, i),
          start: from,
          end: i + 1,
        })
        from = i + 1
      }
    } else if (ch === ';' && depth === 0) from = i + 1
  }
  return rules
}

/** Splits a declaration block on its semicolons, outside parentheses and quotes. */
function declarationsOf(body: string): string[] {
  const out: string[] = []
  let paren = 0
  let quote = ''
  let from = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') paren++
    else if (ch === ')') paren--
    else if (ch === ';' && paren === 0) {
      out.push(body.slice(from, i))
      from = i + 1
    }
  }
  out.push(body.slice(from))
  return out.map((d) => d.trim()).filter(Boolean)
}

/** The stylesheet with `selector { property: value }` set: the declaration replaced, added to the rule, or a new rule. */
export function setDeclaration(
  css: string,
  selector: string,
  property: string,
  value: string,
): string {
  if (/[;{}]/.test(value)) throw new Error('A value cannot contain ; { }')
  const decl = `${property}: ${value}`
  const rule = rulesOf(css).find((r) => r.selector === selector)
  if (!rule) return `${css.trim()}\n${selector} { ${decl}; }`.trim()
  const kept = declarationsOf(rule.body).filter(
    (d) => d.slice(0, d.indexOf(':')).trim().toLowerCase() !== property,
  )
  const next = `${selector} { ${[...kept, decl].join('; ')}; }`
  return css.slice(0, rule.start) + next + css.slice(rule.end)
}

const randomId = () =>
  `ds-${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`

export interface Swap {
  /** The element, as the picker names it (`#id` or a `body > …` path). */
  selector: string
  property: string
  value: string
}

/**
 * The page with the swap written in. Throws when the selector names no element of the file (the page changed since it
 * was picked). `parse` is the window's DOMParser.
 */
export function applySwap(
  html: string,
  swap: Swap,
  parse: (source: string) => Document = (h) =>
    new DOMParser().parseFromString(h, 'text/html'),
): { html: string; selector: string } {
  const doc = parse(html)
  const target = doc.querySelector(swap.selector)
  if (!target || !doc.body.contains(target))
    throw new Error('The element is no longer in the page: pick it again')
  let id = target.id
  const unique =
    id && IDENT.test(id) && doc.querySelectorAll(`#${id}`).length === 1
  let body: string | null = null
  if (!unique) {
    do id = randomId()
    while (doc.getElementById(id))
    target.id = id
    body = doc.body.innerHTML
  }
  const parts = parsePage(html)
  const css = setDeclaration(
    parts.studioCss,
    `#${id}`,
    swap.property,
    swap.value,
  )
  return {
    html: applyEdits(html, { body: body ?? parts.body, css }),
    selector: `#${id}`,
  }
}
