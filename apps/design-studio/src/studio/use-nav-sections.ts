import { useEffect } from 'react'
import { BAR_HEIGHT, useShell } from './shell-state'
import type { NavSection } from './shell-state'

interface Scope {
  document: Document
  window: Window & typeof globalThis
}

/**
 * Publishes to the navbar the elements marked data-nav-section="<label>" of a document (the studio's own or a
 * rendered page's), kept in step with it, and the one whose top has scrolled under the navbar.
 */
export function useNavSections(
  scope: () => Scope | null,
  deps: readonly unknown[],
) {
  const { publishSections } = useShell()

  useEffect(() => {
    const target = scope()
    if (!target) return
    const { document: doc, window: win } = target
    // The studio's own document scrolls under the navbar; a rendered page starts below it.
    const offset = doc === document ? BAR_HEIGHT : 0
    let queued = false
    let latest: NavSection[] = []
    let active: string | null = null

    const spy = () => {
      const end =
        win.scrollY + win.innerHeight >= doc.documentElement.scrollHeight - 2
      const current = !latest.length
        ? null
        : win.scrollY < 1
          ? latest[0]
          : end
            ? latest[latest.length - 1]
            : (latest
                .filter(
                  (s) => s.element.getBoundingClientRect().top <= offset + 24,
                )
                .pop() ?? latest[0])
      const label = current?.label ?? null
      if (label !== active) {
        active = label
        publishSections(latest, active)
      }
    }
    const scan = () => {
      queued = false
      const next = [...doc.querySelectorAll<HTMLElement>('[data-nav-section]')]
        .map((element) => ({
          label: element.dataset.navSection?.trim() ?? '',
          element,
        }))
        .filter((s) => s.label)
      const same =
        next.length === latest.length &&
        next.every(
          (s, i) =>
            s.element === latest[i].element && s.label === latest[i].label,
        )
      if (!same) {
        latest = next
        publishSections(latest, active)
      }
      spy()
    }
    const queue = () => {
      if (queued) return
      queued = true
      win.requestAnimationFrame(scan)
    }
    scan()
    const observer = new win.MutationObserver(queue)
    observer.observe(doc.body, { childList: true, subtree: true })
    win.addEventListener('scroll', spy, { passive: true })
    return () => {
      observer.disconnect()
      win.removeEventListener('scroll', spy)
      publishSections([], null)
    }
    // The scope function is recreated every render: the caller names what should re-scan.
  }, deps)
}

/** Scrolls a section into view, under the navbar when it is in the studio's own document. */
export function jumpTo(section: NavSection) {
  const doc = section.element.ownerDocument
  const win = doc.defaultView
  if (!win) return
  const offset = doc === document ? BAR_HEIGHT : 0
  const top = section.element.getBoundingClientRect().top + win.scrollY
  win.scrollTo({ top: Math.max(0, top - offset - 16), behavior: 'smooth' })
}
