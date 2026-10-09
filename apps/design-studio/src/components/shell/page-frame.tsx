import { useEffect, useRef, useState } from 'react'
import { isEmpty } from '#/palette/draft'
import type { Mode } from '#/palette/draft'
import { usePalette } from '#/palette/palette-state'
import { themeDocument } from '#/palette/theme'
import { onStudioMessage } from '#/studio-events'
import { useShell } from '#/studio/shell-state'
import { useNavSections } from '#/studio/use-nav-sections'

export type Variant = 'reference' | 'proposal'
export interface PageRef {
  kind: 'component' | 'screen'
  name: string
}

export const renderPath = ({ kind, name }: PageRef, variant: Variant) => {
  const dir =
    variant === 'reference'
      ? kind === 'component'
        ? 'components'
        : 'screens'
      : kind === 'component'
        ? 'proposals'
        : 'proposals/screens'
  return `/render/${dir}/${name}.html`
}

/**
 * A rendered page in an iframe, in light, dark or both modes side by side (the page mounted twice). The mode is set on
 * the page's <html> and, while there is a palette draft, the page is re-themed with it. Reloads when its file changes.
 */
export function PageFrame({
  page,
  variant,
}: {
  page: PageRef
  variant: Variant
}) {
  const shell = useShell()
  const palette = usePalette()
  const frames = useRef(new Map<Mode, HTMLIFrameElement>())
  const [loaded, setLoaded] = useState(0)
  const modes: Mode[] = shell.sideBySide ? ['light', 'dark'] : [shell.mode]
  const css = palette && !isEmpty(palette.draft) ? palette.preview.css : null

  const apply = (mode: Mode) => {
    const doc = frames.current.get(mode)?.contentDocument
    if (doc?.documentElement) themeDocument(doc, mode, css)
  }

  // Re-theme on every change of mode, view or draft (a frame that is still loading is themed by its onLoad).
  useEffect(() => {
    modes.forEach(apply)
  }, [css, shell.mode, shell.sideBySide, loaded])

  // Reload when the file changes: an MCP write, or an edit made outside the studio.
  useEffect(
    () =>
      onStudioMessage((message) => {
        if (message.type !== 'change' || message.event.kind !== 'page') return
        const { event } = message
        if (
          event.pageKind === page.kind &&
          event.name === page.name &&
          event.variant === variant
        )
          frames.current.forEach((f) => f.contentWindow?.location.reload())
      }),
    [page.kind, page.name, variant],
  )

  useNavSections(() => {
    const frame = frames.current.get(modes[0])
    const win = frame?.contentWindow as (Window & typeof globalThis) | null
    return win?.document.body ? { document: win.document, window: win } : null
  }, [page.kind, page.name, variant, loaded, shell.sideBySide])

  return (
    <div
      className="grid h-full"
      style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
    >
      {modes.map((mode) => (
        <div key={mode} className="relative flex min-w-0 flex-col">
          {shell.sideBySide && (
            <div className="border-b border-(--line) bg-(--bg-2) px-3 py-1 text-xs font-medium text-(--ink-2) capitalize">
              {mode}
            </div>
          )}
          <iframe
            ref={(node) => {
              if (node) frames.current.set(mode, node)
              else frames.current.delete(mode)
            }}
            title={`${page.name} ${variant} (${mode})`}
            src={renderPath(page, variant)}
            onLoad={() => {
              apply(mode)
              setLoaded((n) => n + 1)
            }}
            className="w-full flex-1 border-0 bg-white"
          />
        </div>
      ))}
    </div>
  )
}
