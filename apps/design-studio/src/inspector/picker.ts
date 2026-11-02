import { pick } from './pick'
import type { Picked } from './pick'

const MARK = 'data-ds-picked'

/**
 * Makes a rendered snapshot clickable: a click picks the element (links and buttons do nothing), outlines it, and
 * hands it over. The outline is a transient attribute on the iframe's copy, never saved.
 */
const attached = new WeakSet<Document>()

export function attachPicker(doc: Document, onPick: (p: Picked) => void) {
  if (attached.has(doc)) return
  attached.add(doc)
  const style = doc.createElement('style')
  style.textContent = `[${MARK}]{outline:2px solid #3b82f6!important;outline-offset:-2px}`
  doc.head.append(style)
  doc.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null
      if (target?.nodeType !== 1) return
      event.preventDefault()
      event.stopPropagation()
      mark(doc, target)
      onPick(pick(target))
    },
    true,
  )
}

function mark(doc: Document, target: Element) {
  doc.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK))
  target.setAttribute(MARK, '')
}

/** Picks the element at `selector` again (the page reloaded after a swap). Null when it is gone. */
export function repick(doc: Document, selector: string): Picked | null {
  let target: Element | null = null
  try {
    target = doc.querySelector(selector)
  } catch {
    return null
  }
  if (!target) return null
  mark(doc, target)
  return pick(target)
}
