import { createFileRoute, notFound } from '@tanstack/react-router'
import { HtmlView } from '#/components/page/html-view'
import { WireframeWorkspace } from '#/components/page/wireframe-workspace'
import { getPageSource, listPages } from '#/server/functions'
import { BAR_HEIGHT } from '#/studio/shell-state'

interface PageSearch {
  variant?: 'reference' | 'proposal' | 'wireframe'
  /** A proposal version: `a` (the proposal) or an alternate letter. */
  version?: string
  wireframe?: string
}

const VARIANTS = ['reference', 'proposal', 'wireframe'] as const

export const Route = createFileRoute('/pages/$kind/$name')({
  validateSearch: (search: Record<string, unknown>): PageSearch => ({
    ...(VARIANTS.includes(search.variant as never) && {
      variant: search.variant as PageSearch['variant'],
    }),
    ...(typeof search.version === 'string' &&
      /^[a-z]$/.test(search.version) && { version: search.version }),
    ...(typeof search.wireframe === 'string' && {
      wireframe: search.wireframe,
    }),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    if (params.kind !== 'component' && params.kind !== 'screen')
      throw notFound()
    const { kind, name } = params
    const summary = (await listPages()).find(
      (p) => p.kind === kind && p.name === name,
    )
    if (!summary) throw notFound()
    // A page opens on its proposal when it has one, else on its reference, else on its wireframes.
    const variant =
      deps.variant ??
      (summary.hasProposal
        ? 'proposal'
        : summary.hasReference
          ? 'reference'
          : 'wireframe')
    if (variant === 'wireframe') {
      const wireframe =
        deps.wireframe && summary.wireframes.includes(deps.wireframe)
          ? deps.wireframe
          : (summary.wireframes[0] ?? null)
      return { summary, view: { variant, wireframe } as const }
    }
    const version =
      variant === 'proposal' &&
      deps.version &&
      summary.alternates.includes(deps.version)
        ? deps.version
        : 'a'
    try {
      const source = await getPageSource({
        data: { kind, name, variant, version },
      })
      return { summary, view: { variant, version, source } as const }
    } catch {
      throw notFound()
    }
  },
  component: PageView,
})

function PageView() {
  const { summary, view } = Route.useLoaderData()
  const key = `${summary.kind}/${summary.name}`

  return (
    <div
      style={{
        height: `calc(100vh - ${BAR_HEIGHT}px - var(--ds-footer-h, 0px))`,
      }}
    >
      {view.variant === 'wireframe' ? (
        <WireframeWorkspace
          key={`${key}/wireframes`}
          summary={summary}
          wireframe={view.wireframe}
        />
      ) : (
        <HtmlView
          key={`${key}/${view.variant}/${view.version}`}
          summary={summary}
          variant={view.variant}
          version={view.version}
          source={view.source}
        />
      )}
    </div>
  )
}
