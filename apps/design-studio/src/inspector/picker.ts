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
      doc
        .querySelectorAll(`[${MARK}]`)
        .forEach((el) => el.removeAttribute(MARK))
      const picked = pick(target)
      target.setAttribute(MARK, '')
      onPick(picked)
    },
    true,
  )
}
