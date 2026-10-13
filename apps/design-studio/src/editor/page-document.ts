/**
 * A page file as the editor sees it. The body is the DOM the editor edits; the page-local `<style data-studio>` block
 * holds the rules of the edits (restyling, token swaps), so the design loop reads them as overrides on top of the
 * reference. The rest of the head is left exactly as it is. String work only: no parser, so the file is not reformatted.
 */

export interface PageParts {
  /** The inside of `<body>`. */
  body: string
  /** The rules of the `<style data-studio>` block. */
  studioCss: string
  /** The `href` of every linked stylesheet, as written. */
  stylesheets: string[]
  /** The other `<style>` blocks of the head: shown in the canvas, never edited. */
  otherCss: string
}

const BODY = /(<body\b[^>]*>)([\s\S]*?)(<\/body\s*>)/i
const STYLE = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi
const LINK = /<link\b[^>]*>/gi
const isStudio = (attrs: string) => /\bdata-studio\b/i.test(attrs)

export function parsePage(html: string): PageParts {
  const stylesheets: string[] = []
  for (const tag of html.matchAll(LINK)) {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag[0])) continue
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0])
    const url = href?.[1] ?? href?.[2]
    if (url) stylesheets.push(url)
  }
  let studioCss = ''
  const others: string[] = []
  for (const m of html.matchAll(STYLE)) {
    if (isStudio(m[1])) studioCss += m[2]
    else others.push(m[2])
  }
  return {
    body: BODY.exec(html)?.[2]?.trim() ?? '',
    studioCss: studioCss.trim(),
    stylesheets,
    otherCss: others.join('\n'),
  }
}

/** True when the colon at `at` separates a property from its value, not a pseudo-class in a nested selector. */
function endsDeclaration(css: string, at: number): boolean {
  let paren = 0
  for (let i = at + 1; i < css.length; i++) {
    const ch = css[i]
    if (ch === '(') paren++
    else if (ch === ')') paren--
    else if (paren === 0 && (ch === ';' || ch === '}')) return true
    else if (paren === 0 && ch === '{') return false
  }
  return true
}

/** One declaration per line, one rule per block: what a person (or Claude) reads in a diff. */
export function formatCss(css: string): string {
  let out = ''
  let depth = 0
  let paren = 0
  let quote = ''
  const pad = () => '  '.repeat(depth)
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (quote) {
      out += ch
      if (ch === '\\') out += css[++i] ?? ''
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
    } else if (ch === '(') {
      paren++
      out += ch
    } else if (ch === ')') {
      paren--
      out += ch
    } else if (paren > 0) out += ch
    else if (ch === '{') {
      depth++
      out = `${out.trimEnd()} {\n${pad()}`
    } else if (ch === ';') {
      out += `;\n${pad()}`
    } else if (ch === '}') {
      depth--
      out = `${out.trimEnd()}\n${pad()}}\n${pad()}`
    } else if (ch === ':' && depth > 0 && endsDeclaration(css, i)) {
      out += ': '
    } else if (/\s/.test(ch) && /\s$/.test(out)) continue
    else out += ch
  }
  return out
    .replace(/\n\s*\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

const studioBlock = (css: string) =>
  `<style data-studio>\n${formatCss(css)}\n</style>`

/** The file with the editor's body and rules in it. An empty rule set removes the block. */
export function applyEdits(
  html: string,
  edits: { body: string; css: string },
): string {
  let out = html.replace(
    BODY,
    (_, open: string, _body: string, close: string) =>
      `${open}\n${edits.body.trim()}\n${close}`,
  )
  const blocks = [...out.matchAll(STYLE)].filter((m) => isStudio(m[1]))
  const css = edits.css.trim()
  if (blocks.length > 0) {
    // One block only: the first is rewritten, the others dropped.
    let first = true
    out = out.replace(STYLE, (match, attrs: string) => {
      if (!isStudio(attrs)) return match
      if (!first || css === '') return ''
      first = false
      return studioBlock(css)
    })
  } else if (css !== '') {
    out = /<\/head\s*>/i.test(out)
      ? out.replace(/(\s*)(<\/head\s*>)/i, `\n${studioBlock(css)}$1$2`)
      : `${studioBlock(css)}\n${out}`
  }
  return out
}
