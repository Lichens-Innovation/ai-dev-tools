import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

const PAGES = [
  { path: '/create-skill', label: 'Create Skill' },
  { path: '/create-subagent', label: 'Create Subagent' },
  { path: '/create-plugin', label: 'Create Plugin' },
  { path: '/create-marketplace', label: 'Create Marketplace' },
  { path: '/workflows', label: 'Workflows' },
  { path: '/rules', label: 'Rules' },
  { path: '/session-log', label: 'Session Log' },
]

function Home() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6"
      style={{ background: 'var(--bg)' }}
    >
      <img src="/logo192.png" alt="AI Tools Manager" width={80} height={80} />
      <div className="text-center">
        <h1 className="mb-1 text-xl font-semibold text-(--ink)">AI Tools Manager</h1>
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
          Use a skill in Claude Code to get started.
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm" style={{ color: 'var(--ink-3)' }}>
        {PAGES.map(({ path, label }) => (
          <li key={path}>
            <Link
              to={path}
              className="hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              {path}
            </Link>
            <span className="ml-2">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
