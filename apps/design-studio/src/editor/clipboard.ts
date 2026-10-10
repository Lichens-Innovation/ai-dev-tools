/**
 * The editor's clipboard: markup plus the rules of its `#id` selectors, kept in the browser per project so an element
 * copied in one proposal can be pasted into another (GrapesJS's own clipboard dies with the page).
 */

export interface Clip {
  html: string
  css: string
}

const keyFor = (root: string) => `design-studio:${root}:clipboard`

export function readClip(root: string): Clip | null {
  try {
    const clip = JSON.parse(
      localStorage.getItem(keyFor(root)) ?? 'null',
    ) as Partial<Clip> | null
    return clip && typeof clip.html === 'string' && clip.html !== ''
      ? { html: clip.html, css: typeof clip.css === 'string' ? clip.css : '' }
      : null
  } catch {
    return null
  }
}

export function writeClip(root: string, clip: Clip): void {
  try {
    localStorage.setItem(keyFor(root), JSON.stringify(clip))
  } catch {
    // Storage full or disabled: copy and paste within this page still works through the caller's own copy.
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The clip with every id in its markup replaced by one `taken` does not hold, and the same in its rules, so a paste
 * (or a second paste) never shares an id, and so a rule, with another element.
 */
export function remapIds(clip: Clip, taken: ReadonlySet<string>): Clip {
  const used = new Set(taken)
  // The ids already in the markup count as taken too, or a new name could land on one of them.
  for (const m of clip.html.matchAll(/\sid\s*=\s*(["'])([^"']+)\1/g))
    used.add(m[2])
  const renamed = new Map<string, string>()
  const html = clip.html.replace(
    /(\sid\s*=\s*)(["'])([^"']+)\2/g,
    (_, head: string, quote: string, id: string) => {
      let next = renamed.get(id)
      if (!next) {
        let n = 1
        while (used.has(`${id}-${n}`)) n++
        next = `${id}-${n}`
        used.add(next)
        renamed.set(id, next)
      }
      return `${head}${quote}${next}${quote}`
    },
  )
  if (renamed.size === 0) return { html, css: clip.css }
  // One pass, longest id first, so a rename is never renamed again.
  const ids = [...renamed.keys()].sort((a, b) => b.length - a.length)
  const css = clip.css.replace(
    new RegExp(`#(${ids.map(escape).join('|')})(?![\\w-])`, 'g'),
    (_, id: string) => `#${renamed.get(id)!}`,
  )
  return { html, css }
}
