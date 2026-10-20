import { useState } from 'react'
import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { createBlankPage } from '#/server/functions'
import type { PageSummary } from '#/server/design-project'
import { usePalette } from '#/palette/palette-state'
import { BAR_HEIGHT, SIDEBAR_WIDTH, useShell } from '#/studio/shell-state'
import { PaletteIcon, TailwindIcon } from './icons'

const row =
  'relative flex h-10 items-center overflow-hidden px-4 pl-3 text-ellipsis whitespace-nowrap text-(--ink) hover:bg-(--bg-2) aria-[current=page]:font-semibold aria-[current=page]:before:absolute aria-[current=page]:before:top-[20%] aria-[current=page]:before:left-0 aria-[current=page]:before:h-3/5 aria-[current=page]:before:w-[3px] aria-[current=page]:before:rounded-r-sm aria-[current=page]:before:bg-(--primary)'

function Group({
  title,
  pages,
  current,
  onPick,
}: {
  title: string
  pages: PageSummary[]
  current: string
  onPick: () => void
}) {
  if (!pages.length) return null
  return (
    <>
      <div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.08em] text-(--ink-3) uppercase">
        {title}
      </div>
      {pages.map((page) => {
        const here = `/pages/${page.kind}/${page.name}`
        return (
          <Link
            key={page.name}
            to="/pages/$kind/$name"
            params={{ kind: page.kind, name: page.name }}
            // A page opens as its proposal when it has one, else as its reference.
            search={{ variant: page.hasProposal ? 'proposal' : 'reference' }}
            title={page.hasProposal ? 'Proposal' : 'Reference'}
            aria-current={current === here ? 'page' : undefined}
            onClick={onPick}
            className={row}
          >
            {page.name}
          </Link>
        )
      })}
    </>
  )
}

/** A blank page: a new empty proposal (component or screen) named by the user, with only a sketch on it. */
function NewPage({ onPick }: { onPick: () => void }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'screen' | 'component'>('screen')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field =
    'h-8 rounded-md border border-(--line) bg-(--bg) px-2 text-[13px] text-(--ink)'
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-3 mt-2 h-8 cursor-pointer rounded-md border border-dashed border-(--line) px-3 text-left text-[13px] text-(--ink-2) hover:bg-(--bg-2)"
      >
        + New blank page
      </button>
    )
  return (
    <form
      className="mx-3 mt-2 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        void createBlankPage({ data: { kind, name: name.trim() } })
          .then(async (result) => {
            if (!result.ok) return setError(result.message)
            await router.invalidate()
            setOpen(false)
            setName('')
            setError(null)
            onPick()
            await navigate({
              to: '/pages/$kind/$name',
              params: { kind, name: name.trim() },
              search: { variant: 'proposal' },
            })
          })
          .catch((err: unknown) =>
            setError(err instanceof Error ? err.message : String(err)),
          )
      }}
    >
      <select
        aria-label="Kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as 'screen' | 'component')}
        className={field}
      >
        <option value="screen">Screen</option>
        <option value="component">Component</option>
      </select>
      <input
        aria-label="Name (kebab-case)"
        placeholder="name-in-kebab-case"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={field}
        required
      />
      {error && (
        <p role="alert" className="text-xs text-(--red)">
          {error}
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          type="submit"
          className="h-8 cursor-pointer rounded-md bg-(--primary) px-3 text-[13px] text-(--bg)"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 cursor-pointer rounded-md border border-(--line) px-3 text-[13px] text-(--ink)"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/** The page list: palette and Tailwind first, then Pages (screens) and Components from design/index.json. */
export function Sidebar({ pages }: { pages: PageSummary[] }) {
  const shell = useShell()
  const palette = usePalette()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const current = decodeURIComponent(pathname)
  // On a narrow screen the sidebar covers the page and closes after a pick.
  const onPick = () => {
    if (!shell.wide) shell.setSidebar(false)
  }
  const open = shell.sidebar
  const topLink =
    'flex h-10 w-10 items-center justify-center rounded-lg text-(--ink) hover:bg-(--bg-2) aria-[current=page]:bg-(--bg-2) aria-[current=page]:text-(--primary)'

  return (
    <aside
      aria-label="Pages"
      className="fixed bottom-0 left-0 z-30 overflow-hidden border-(--line) bg-(--bg-elev) transition-[width] duration-200"
      style={{
        top: BAR_HEIGHT,
        width: open ? (shell.wide ? SIDEBAR_WIDTH : '100%') : 0,
        borderRightWidth: open ? 1 : 0,
      }}
    >
      <nav
        className="h-full overflow-y-auto py-3"
        style={{ width: shell.wide ? SIDEBAR_WIDTH : '100%' }}
      >
        <div className="mx-3 mb-1 flex gap-1">
          {palette && (
            <Link
              to="/palette"
              title="Palette"
              aria-label="Palette"
              aria-current={current === '/palette' ? 'page' : undefined}
              onClick={onPick}
              className={topLink}
            >
              <PaletteIcon />
            </Link>
          )}
          {palette?.namespace && (
            <Link
              to="/tailwind"
              title="Tailwind classes"
              aria-label="Tailwind classes"
              aria-current={current === '/tailwind' ? 'page' : undefined}
              onClick={onPick}
              className={topLink}
            >
              <TailwindIcon />
            </Link>
          )}
        </div>
        <NewPage onPick={onPick} />
        {pages.length === 0 && (
          <p className="px-4 py-2 text-[13px] text-(--ink-3)">
            No pages yet: the project has nothing in design/index.json.
          </p>
        )}
        <Group
          title="Pages"
          pages={pages.filter((p) => p.kind === 'screen')}
          current={current}
          onPick={onPick}
        />
        <Group
          title="Components"
          pages={pages.filter((p) => p.kind === 'component')}
          current={current}
          onPick={onPick}
        />
      </nav>
    </aside>
  )
}
