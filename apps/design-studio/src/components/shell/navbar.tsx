import { Link, useRouterState } from '@tanstack/react-router'
import { usePalette } from '#/palette/palette-state'
import { BAR_HEIGHT, useShell } from '#/studio/shell-state'
import { jumpTo } from '#/studio/use-nav-sections'
import { Burger, PaletteIcon, TailwindIcon } from './icons'

const iconLink =
  'flex size-9 flex-none items-center justify-center rounded-lg text-(--ink) hover:bg-(--bg-2) [&[aria-current=page]]:text-(--primary)'

function usePageTitle(): string {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const page = /^\/pages\/(component|screen)\/([^/]+)/.exec(pathname)
  if (page) return decodeURIComponent(page[2])
  return pathname === '/' ? 'Design studio' : ''
}

/** The fixed bar of every page: sidebar toggle, palette and Tailwind links, title, sections, light/dark switch. */
export function Navbar() {
  const shell = useShell()
  const palette = usePalette()
  const title = usePageTitle()

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-(--line) bg-(--bg-elev) px-4 text-sm text-(--ink)"
      style={{ height: BAR_HEIGHT }}
    >
      <button
        type="button"
        title="Pages"
        aria-label="Toggle the page list"
        aria-expanded={shell.sidebar}
        onClick={() => shell.setSidebar(!shell.sidebar)}
        className="size-9 flex-none cursor-pointer rounded-lg hover:bg-(--bg-2)"
      >
        <Burger open={shell.sidebar} />
      </button>
      {palette && (
        <Link
          to="/palette"
          title="Palette"
          aria-label="Palette"
          className={iconLink}
        >
          <PaletteIcon />
        </Link>
      )}
      {palette?.namespace && (
        <Link
          to="/tailwind"
          title="Tailwind classes"
          aria-label="Tailwind classes"
          className={iconLink}
        >
          <TailwindIcon />
        </Link>
      )}
      <div className="max-w-[30vw] flex-none truncate text-[15px] font-semibold">
        {title}
      </div>
      <nav
        aria-label="Sections"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {shell.sections.map((section) => (
          <button
            key={section.label}
            type="button"
            onClick={() => jumpTo(section)}
            aria-current={section.label === shell.activeSection || undefined}
            className="h-8 flex-none cursor-pointer rounded-lg px-3 font-medium whitespace-nowrap hover:bg-(--bg-2) aria-[current]:bg-(--primary-dim) aria-[current]:font-semibold aria-[current]:text-(--primary)"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <button
        type="button"
        aria-pressed={shell.sideBySide}
        title="Show light and dark side by side"
        onClick={() => shell.setSideBySide(!shell.sideBySide)}
        className="h-8 flex-none cursor-pointer rounded-lg border border-(--line) px-3 font-medium whitespace-nowrap hover:bg-(--bg-2) aria-pressed:bg-(--bg-3)"
      >
        Side by side
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={shell.mode === 'dark'}
        aria-label="Dark mode"
        onClick={() => shell.setMode(shell.mode === 'dark' ? 'light' : 'dark')}
        className="flex flex-none cursor-pointer items-center gap-2 font-medium"
      >
        <small className="text-[13px] text-(--ink-3) max-sm:hidden">
          {shell.mode === 'dark' ? 'Dark' : 'Light'}
        </small>
        <span
          className={`relative h-[22px] w-10 rounded-full transition-colors ${shell.mode === 'dark' ? 'bg-(--primary)' : 'bg-(--line-2)'}`}
        >
          <i
            className={`absolute top-[3px] size-4 rounded-full bg-white shadow transition-all ${shell.mode === 'dark' ? 'left-[21px]' : 'left-[3px]'}`}
          />
        </span>
      </button>
    </header>
  )
}
