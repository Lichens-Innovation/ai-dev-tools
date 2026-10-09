import type { Mode } from './draft'

export const STYLE_ID = 'design-studio-palette'

/** Pins a stylesheet generated for `:root` to one element, so the studio's own tokens are left alone. */
export const scopeCss = (css: string, selector = '[data-studio-theme]') =>
  css.replaceAll(':root', selector)

/**
 * Themes a rendered page: the mode on <html> (data-theme and color-scheme) and, while there is a draft, the
 * regenerated tokens after the page's own stylesheets. Without a draft the saved outputs in the page apply as is.
 */
export function themeDocument(doc: Document, mode: Mode, css: string | null) {
  const html = doc.documentElement
  html.dataset.theme = mode
  html.style.colorScheme = mode
  let style = doc.getElementById(STYLE_ID)
  if (css === null) {
    style?.remove()
    return
  }
  if (!style) {
    style = doc.createElement('style')
    style.id = STYLE_ID
  }
  if (style.textContent !== css) style.textContent = css
  // Last in <head>, so it wins over the page's own links.
  if (style.parentNode !== doc.head || doc.head.lastElementChild !== style)
    doc.head.append(style)
}
