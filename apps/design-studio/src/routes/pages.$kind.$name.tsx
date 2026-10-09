import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { getPageInfo } from '#/server/functions'
import { onStudioMessage } from '#/studio-events'

type Variant = 'reference' | 'proposal'

export const Route = createFileRoute('/pages/$kind/$name')({
  validateSearch: (search: Record<string, unknown>): { variant: Variant } => ({
    variant: search.variant === 'reference' ? 'reference' : 'proposal',
  }),
  loaderDeps: ({ search }) => ({ variant: search.variant }),
  loader: async ({ params, deps }) => {
    if (params.kind !== 'component' && params.kind !== 'screen')
      throw notFound()
    try {
      await getPageInfo({
        data: { kind: params.kind, name: params.name, variant: deps.variant },
      })
    } catch {
      throw notFound()
    }
  },
  component: PageView,
})

const renderPath = (kind: string, name: string, variant: Variant) => {
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

function PageView() {
  const { kind, name } = Route.useParams()
  const { variant } = Route.useSearch()
  const frame = useRef<HTMLIFrameElement>(null)

  // Reload the page when its file changes: an MCP write, or an edit made outside the studio.
  useEffect(
    () =>
      onStudioMessage((message) => {
        if (message.type !== 'change' || message.event.kind !== 'page') return
        const { event } = message
        if (
          event.pageKind === kind &&
          event.name === name &&
          event.variant === variant
        ) {
          frame.current?.contentWindow?.location.reload()
        }
      }),
    [kind, name, variant],
  )

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2 text-sm">
        <Link to="/" className="underline">
          Pages
        </Link>
        <span className="font-medium">
          {kind} / {name}
        </span>
        {(['reference', 'proposal'] as const).map((v) => (
          <Link
            key={v}
            to="/pages/$kind/$name"
            params={{ kind, name }}
            search={{ variant: v }}
            className={v === variant ? 'font-semibold underline' : 'opacity-60'}
          >
            {v}
          </Link>
        ))}
      </header>
      <iframe
        ref={frame}
        title={`${name} ${variant}`}
        src={renderPath(kind, name, variant)}
        className="w-full flex-1 border-0"
      />
    </div>
  )
}
