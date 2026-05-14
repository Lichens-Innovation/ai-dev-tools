import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

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
    </div>
  )
}
