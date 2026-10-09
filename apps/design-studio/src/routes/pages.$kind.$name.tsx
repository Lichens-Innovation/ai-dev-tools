import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { PageFrame } from '#/components/shell/page-frame'
import type { Variant } from '#/components/shell/page-frame'
import { getPageInfo, listPages } from '#/server/functions'
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
      await getPageInfo({ data: { kind, name, variant } })
    } catch {
      throw notFound()
    }
    return { variant, hasProposal: page.hasProposal }
  },
  component: PageView,
})

function PageView() {
  const { kind, name } = Route.useParams()
  const { variant, hasProposal } = Route.useLoaderData()
  if (kind !== 'component' && kind !== 'screen') return null

  return (
    <div
      className="flex flex-col"
      style={{
        height: `calc(100vh - ${BAR_HEIGHT}px - var(--ds-footer-h, 0px))`,
      }}
    >
      <div className="flex items-center gap-3 border-b border-(--line) px-4 py-1.5 text-sm">
        <span className="font-medium">
          {kind} / {name}
        </span>
        {(['reference', 'proposal'] as const).map((v) =>
          v === 'proposal' && !hasProposal ? (
            <span key={v} className="opacity-40" title="No proposal yet">
              {v}
            </span>
          ) : (
            <Link
              key={v}
              to="/pages/$kind/$name"
              params={{ kind, name }}
              search={{ variant: v }}
              className={
                v === variant ? 'font-semibold underline' : 'opacity-60'
              }
            >
              {v}
            </Link>
          ),
        )}
      </div>
      <div className="min-h-0 flex-1">
        <PageFrame page={{ kind, name }} variant={variant} />
      </div>
    </div>
  )
}
