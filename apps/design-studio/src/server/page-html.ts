import path from 'node:path'
import { invalid } from './errors'

const URL_ATTRS = /\b(?:src|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const SRCSET_ATTR = /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const LINK_TAG = /<(?:link|base)\b[^>]*>/gi
const HREF_ATTR = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/gi
const CSS_IMPORT = /@import\s+(?:"([^"]*)"|'([^']*)')/gi

const SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

const pick = (m: RegExpMatchArray) =>
  (m as (string | undefined)[]).slice(1).find((g) => g !== undefined) ?? ''

function urlsOf(html: string): string[] {
  const urls: string[] = []
  for (const m of html.matchAll(URL_ATTRS)) urls.push(pick(m))
  for (const m of html.matchAll(SRCSET_ATTR)) {
    for (const part of pick(m).split(','))
      urls.push(part.trim().split(/\s+/)[0] ?? '')
  }
  for (const tag of html.matchAll(LINK_TAG)) {
    const href = tag[0].match(HREF_ATTR)
    if (href) urls.push(pick(href))
  }
  for (const m of html.matchAll(CSS_URL)) urls.push(pick(m))
  for (const m of html.matchAll(CSS_IMPORT)) urls.push(pick(m))
  return urls.filter((u) => u !== '')
}

/**
 * A page may load only what lives in design/assets: every URL it loads must resolve there from the page's own
 * directory (`pageDir`, posix, relative to design/, e.g. `proposals/screens`). Data URIs and in-page fragments
 * load nothing from disk or network and pass.
 */
export function assertLoadsOnlyAssets(html: string, pageDir: string): void {
  for (const raw of urlsOf(html)) {
    const url = raw.trim()
    if (url.startsWith('#') || /^data:/i.test(url)) continue
    if (SCHEME.test(url) || url.startsWith('/')) {
      throw invalid(`Page loads "${url}", outside design/assets`)
    }
    const clean = url.split(/[?#]/)[0] ?? ''
    const resolved = path.posix.normalize(path.posix.join(pageDir, clean))
    if (!resolved.startsWith('assets/')) {
      throw invalid(`Page loads "${url}", outside design/assets`)
    }
  }
}

/** A screen proposal sits one directory deeper than its reference, so its asset links gain one `../`. */
export function rebaseForScreenProposal(html: string): string {
  return html.replace(/(["'(])\.\.\/assets\//g, '$1../../assets/')
}
