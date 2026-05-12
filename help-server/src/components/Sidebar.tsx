import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { useEffect, useRef } from 'react'
import { closeSidebar, sidebarStore } from '../store/sidebar-store'
import type { DocMeta } from '../utils/docs'

interface SidebarProps {
  docs: DocMeta[]
}

export default function Sidebar({ docs }: SidebarProps) {
  const isOpen = useStore(sidebarStore, (s) => s.isOpen)
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[data-sidebar-toggle]')) return
      if (asideRef.current && !asideRef.current.contains(target)) {
        closeSidebar()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen])

  return (
    <>
      <aside
        ref={asideRef}
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-[var(--line)] bg-[var(--bg)] pt-14 shadow-[var(--shadow-2)] transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center border-b border-[var(--line)] px-5 py-3">
          <span className="section-label">Docs</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="m-0 list-none p-0">
            {docs.map((doc) => (
              <li key={doc.slug}>
                <Link
                  to="/docs/$slug"
                  params={{ slug: doc.slug }}
                  search={{ q: '' }}
                  onClick={closeSidebar}
                  className="flex items-center gap-2 rounded-sm px-5 py-2 text-[13px] text-[var(--ink-2)] no-underline hover:bg-[var(--bg-3)] hover:text-(--ink)"
                  activeProps={{
                    className:
                      'flex items-center gap-2 rounded-sm px-5 py-2 text-[13px] text-[var(--amber)] no-underline bg-[var(--amber-dim)] border-l-2 border-[var(--amber)] -ml-px',
                  }}
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}
