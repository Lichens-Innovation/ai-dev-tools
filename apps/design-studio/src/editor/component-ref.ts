import { parsePage } from './page-document'

/**
 * `data-component="<manifest name>"` on an element says: this is an instance of that component. The design loop
 * implements it with the component, not with new markup. The Add tab inserts a captured reference's real markup
 * (its classes, so it looks right at once) with the attribute on its root; copies of the element keep it, being
 * plain attributes.
 */
export const COMPONENT_ATTR = 'data-component'

/**
 * The markup to insert for a component reference page. A reference with one root element gets the attribute there;
 * several roots (a dialog and its backdrop) are wrapped in a box that takes no part in the layout.
 */
export function componentMarkup(name: string, referenceHtml: string): string {
  const template = document.createElement('template')
  template.innerHTML = parsePage(referenceHtml).body
  // Captured scripts are stripped; keep it that way if one slipped in.
  template.content.querySelectorAll('script').forEach((s) => s.remove())
  const roots = [...template.content.childNodes].filter(
    (n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent?.trim()),
  )
  const only = roots.length === 1 ? roots[0] : undefined
  if (only instanceof Element) {
    only.setAttribute(COMPONENT_ATTR, name)
    return only.outerHTML
  }
  const wrapper = document.createElement('div')
  wrapper.setAttribute(COMPONENT_ATTR, name)
  wrapper.style.display = 'contents'
  wrapper.append(template.content)
  return wrapper.outerHTML
}

export interface LayerFacts {
  tag: string
  attributes: Record<string, string | undefined>
  /** The element's own text, if it has any and no children. */
  text?: string
}

/** A row's name in the Layers tree: the component's name if it is one, else the tag with what identifies it. */
export function layerLabel({ tag, attributes, text }: LayerFacts): string {
  const component = attributes[COMPONENT_ATTR]
  if (component) return component
  const id = attributes.id
  const cls = attributes.class?.split(/\s+/).find(Boolean)
  // The id comes second: the editor invents ids for elements it styled, and a class says more.
  const ident = cls ? `.${cls}` : id ? `#${id}` : ''
  const snippet = text?.trim().replace(/\s+/g, ' ').slice(0, 24)
  return `${tag}${ident}${snippet ? ` “${snippet}”` : ''}`
}
