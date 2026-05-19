import { Link } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import SlidePanel from './SlidePanel'
import { closeSidebar, sidebarStore } from '../store/sidebar-store'
import type { DocMeta } from '../utils/docs'

interface SidebarProps {
  docs: DocMeta[]
}

export default function Sidebar({ docs }: SidebarProps) {
  const isOpen = useSelector(sidebarStore, (s) => s.isOpen)

  return (
    <SlidePanel isOpen={isOpen} onClose={closeSidebar} side="left" toggleDataAttr={['data-sidebar-toggle', 'data-chat-toggle']}>
      <div className="flex items-center border-b border-(--line) px-5 py-3">
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
                className="flex items-center gap-2 rounded-sm px-5 py-2 text-[13px] text-(--ink-2) no-underline hover:bg-(--bg-3) hover:text-(--ink)"
                activeProps={{
                  className:
                    'flex items-center gap-2 rounded-sm px-5 py-2 text-[13px] text-primary no-underline bg-(--primary-dim) border-l-2 border-primary -ml-px',
                }}
              >
                {doc.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </SlidePanel>
  )
}
