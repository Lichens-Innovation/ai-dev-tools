import type { ReactNode } from 'react'
import type { Mode } from '#/palette/draft'
import { usePalette } from '#/palette/palette-state'
import { scopeCss } from '#/palette/theme'
import { useShell } from '#/studio/shell-state'

export const NO_PALETTE =
  'This project has no palette: add palette.inputs and palette.script to design.manifest.json.'

/** The project's tokens (with the draft applied) for everything inside, in one mode. The studio's own chrome keeps its tokens. */
export function ThemeScope({
  mode,
  children,
}: {
  mode: Mode
  children: ReactNode
}) {
  const pal = usePalette()
  return (
    <div
      data-studio-theme=""
      data-theme={mode}
      className="min-w-0 bg-(--bg) text-(--text)"
      style={{ colorScheme: mode, font: '14px/1.5 system-ui, sans-serif' }}
    >
      {pal && <style>{scopeCss(pal.preview.css)}</style>}
      {children}
    </div>
  )
}

/** A view mounted once for the current mode, or twice (light, dark) in side-by-side. Only the first one carries the nav sections. */
export function ModeColumns({
  children,
}: {
  children: (mode: Mode, first: boolean) => ReactNode
}) {
  const shell = useShell()
  const modes: Mode[] = shell.sideBySide ? ['light', 'dark'] : [shell.mode]
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
    >
      {modes.map((mode, i) => (
        <ThemeScope key={mode} mode={mode}>
          {shell.sideBySide && (
            <div className="border-b border-(--border) px-4 py-1 text-xs font-medium text-(--text-muted) capitalize">
              {mode}
            </div>
          )}
          {children(mode, i === 0)}
        </ThemeScope>
      ))}
    </div>
  )
}
