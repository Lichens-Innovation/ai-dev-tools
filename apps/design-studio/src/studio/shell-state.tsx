import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Mode } from '#/palette/draft'

/** Below this width the sidebar covers the page instead of pushing it. */
export const WIDE = 900
export const BAR_HEIGHT = 56
export const SIDEBAR_WIDTH = 280

interface Prefs {
  mode: Mode
  sideBySide: boolean
  sidebar: boolean
  footerOpen: boolean
  advanced: boolean
}

const DEFAULTS: Prefs = {
  mode: 'light',
  sideBySide: false,
  sidebar: true,
  footerOpen: false,
  advanced: false,
}

const keyFor = (root: string) => `design-studio:${root}`

function load(root: string): Partial<Prefs> {
  try {
    const value = JSON.parse(
      localStorage.getItem(keyFor(root)) ?? 'null',
    ) as Partial<Prefs> | null
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export interface NavSection {
  label: string
  element: Element
}

interface ShellState extends Prefs {
  /** The section shortcuts of the open view, and the one in sight. */
  sections: NavSection[]
  activeSection: string | null
  publishSections: (sections: NavSection[], active: string | null) => void
  root: string
  /** False until the saved choices were read in the browser: render the defaults until then. */
  ready: boolean
  wide: boolean
  setMode: (mode: Mode) => void
  setSideBySide: (on: boolean) => void
  setSidebar: (open: boolean) => void
  setFooterOpen: (open: boolean) => void
  setAdvanced: (on: boolean) => void
}

const Context = createContext<ShellState | null>(null)

export function useShell(): ShellState {
  const value = useContext(Context)
  if (!value) throw new Error('useShell needs a ShellProvider')
  return value
}

/** Light/dark, side-by-side, sidebar and footer choices, remembered per project in the browser. */
export function ShellProvider({
  root,
  children,
}: {
  root: string
  children: ReactNode
}) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [ready, setReady] = useState(false)
  const [wide, setWide] = useState(true)
  const [nav, setNav] = useState<{
    sections: NavSection[]
    active: string | null
  }>({ sections: [], active: null })

  useEffect(() => {
    const isWide = window.innerWidth >= WIDE
    const saved = load(root)
    setWide(isWide)
    setPrefs({
      ...DEFAULTS,
      ...saved,
      mode: saved.mode === 'dark' ? 'dark' : 'light',
      // A narrow screen starts with the sidebar closed.
      sidebar: isWide && saved.sidebar !== false,
    })
    setReady(true)
    const onResize = () => setWide(window.innerWidth >= WIDE)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [root])

  const update = useCallback(
    (change: Partial<Prefs>) => {
      setPrefs((current) => {
        const next = { ...current, ...change }
        try {
          // The sidebar choice is only remembered from a wide screen, where it is not forced.
          localStorage.setItem(
            keyFor(root),
            JSON.stringify({
              ...next,
              sidebar:
                window.innerWidth >= WIDE
                  ? next.sidebar
                  : (load(root).sidebar ?? true),
            }),
          )
        } catch {
          // Storage can be unavailable (private mode): the choice then lasts for the tab.
        }
        return next
      })
    },
    [root],
  )

  const value = useMemo<ShellState>(
    () => ({
      ...prefs,
      sections: nav.sections,
      activeSection: nav.active,
      publishSections: (sections, active) => setNav({ sections, active }),
      root,
      ready,
      wide,
      setMode: (mode) => update({ mode }),
      setSideBySide: (sideBySide) => update({ sideBySide }),
      setSidebar: (sidebar) => update({ sidebar }),
      setFooterOpen: (footerOpen) => update({ footerOpen }),
      setAdvanced: (advanced) => update({ advanced }),
    }),
    [prefs, nav, root, ready, wide, update],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}
