import { Link, createFileRoute } from '@tanstack/react-router'
import { listPages } from '#/server/functions'

export const Route = createFileRoute('/')({
  loader: () => listPages(),
  component: Home,
})

function Home() {
  const pages = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Design studio</h1>
      {pages.length === 0 ? (
        <p>No pages yet: the project has nothing under design/.</p>
      ) : (
        <ul className="divide-y">
          {pages.map((page) => {
            const params = { kind: page.kind, name: page.name }
            return (
              <li
                key={`${page.kind}/${page.name}`}
                className="flex items-center gap-3 py-2"
              >
                <span className="w-20 text-sm opacity-60">{page.kind}</span>
                <span className="flex-1 font-medium">{page.name}</span>
                {page.hasReference && (
                  <Link
                    to="/pages/$kind/$name"
                    params={params}
                    search={{ variant: 'reference' }}
                    className="underline"
                  >
                    reference
                  </Link>
                )}
                {page.hasProposal ? (
                  <Link
                    to="/pages/$kind/$name"
                    params={params}
                    search={{ variant: 'proposal' }}
                    className="underline"
                  >
                    proposal
                    {page.alternates.length > 0 &&
                      ` (+${page.alternates.length})`}
                  </Link>
                ) : (
                  <span className="opacity-40">no proposal</span>
                )}
                <Link
                  to="/pages/$kind/$name"
                  params={params}
                  search={{ variant: 'wireframe' }}
                  className="underline"
                >
                  wireframes ({page.wireframes.length})
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
