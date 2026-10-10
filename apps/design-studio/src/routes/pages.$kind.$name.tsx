import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageWorkspace } from '#/components/editor/page-workspace'
import type { Variant } from '#/components/shell/page-frame'
import { getPageSource, listPages } from '#/server/functions'
import { BAR_HEIGHT } from '#/studio/shell-state'

export const Route = createFileRoute('/pages/$kind/$name')({
  validateSearch: (search: Record<string, unknown>): { variant?: Variant } =>
    search.variant === 'reference' || search.variant === 'proposal'
      ? { variant: search.variant }
      : {},
  loaderDeps: ({ search }) => ({ variant: search.variant }),
  loader: async ({ params, deps }) => {
    if (params.kind !== 'component' && params.kind !== 'screen')
      throw notFound()
    const { kind, name } = params
    const page = (await listPages()).find(
      (p) => p.kind === kind && p.name === name,
    )
    if (!page) throw notFound()
    // A page opens on its proposal when it has one, else on its reference.
    const variant: Variant =
      deps.variant ?? (page.hasProposal ? 'proposal' : 'reference')
    try {
      const source = await getPageSource({ data: { kind, name, variant } })
      return {
        variant,
        hasProposal: page.hasProposal,
        hasReference: page.hasReference,
        source,
      }
    } catch {
      throw notFound()
    }
  },
  component: PageView,
})

function PageView() {
  const { kind, name } = Route.useParams()
  const { variant, hasProposal, hasReference, source } = Route.useLoaderData()
  if (kind !== 'component' && kind !== 'screen') return null

  return (
    <div
      style={{
        height: `calc(100vh - ${BAR_HEIGHT}px - var(--ds-footer-h, 0px))`,
      }}
    >
      <PageWorkspace
        key={`${kind}/${name}/${variant}`}
        page={{ kind, name }}
        variant={variant}
        hasProposal={hasProposal}
        hasReference={hasReference}
        source={source}
      />
    </div>
  )
}
