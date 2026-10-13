import { excerptOf, listTokens, selectorFor, traceTokens } from './trace'
import type { TokenInfo, TraceRow } from './trace'

/** An element picked in a page (the editor's canvas or a rendered snapshot), with what the inspector shows of it. */
export interface Picked {
  element: Element
  selector: string
  excerpt: string
  rows: TraceRow[]
  /** The document's tokens, to offer in swaps. */
  tokens: TokenInfo[]
}

/**
 * `body` is the element that stands for `<body>` and `html` the element's markup as it will be saved, when the page
 * is an editor's canvas (its elements carry the editor's own attributes and wrapper).
 */
export function pick(
  element: Element,
  as?: { body?: Element; html?: string },
): Picked {
  return {
    element,
    selector: selectorFor(element, as?.body),
    excerpt: as?.html ? excerptOf(as.html) : excerptOf(element.outerHTML),
    rows: traceTokens(element),
    tokens: listTokens(element.ownerDocument),
  }
}

/** Tells the palette footer to open a token (`--primary` or `primary`). */
export function openToken(token: string) {
  window.dispatchEvent(
    new CustomEvent('design-studio:token', { detail: { token } }),
  )
}
