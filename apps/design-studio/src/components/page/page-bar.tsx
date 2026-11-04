import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PageSummary } from '#/server/design-project'
import { discardVersion, promoteVersion } from '#/server/functions'

export const button =
  'h-7 cursor-pointer rounded-md border border-(--line) px-2.5 text-xs font-medium whitespace-nowrap hover:bg-(--bg-2) disabled:cursor-default disabled:opacity-40'
export const primaryButton = `${button} border-(--primary) bg-(--primary) text-(--bg) hover:bg-(--primary)`

/** What the page shows: its reference, a proposal version, or its wireframes. */
export type View =
  | { variant: 'reference' }
  | { variant: 'proposal'; version: string }
  | { variant: 'wireframe'; wireframe: string | null }

const tab =
  'rounded-md px-2 py-1 text-[13px] hover:bg-(--bg-2) aria-[current=true]:bg-(--bg-2) aria-[current=true]:font-semibold'
const chip =
  'flex h-6 min-w-6 items-center justify-center rounded border border-(--line) px-1.5 font-mono text-[11px] hover:bg-(--bg-2) aria-[current=true]:border-(--primary) aria-[current=true]:text-(--primary)'

/**
 * The page's bar: Reference | Proposal and its versions (A is the proposal, B… alternates made from wireframes, with
 * Use this version and Discard) | Wireframes. `children` are the open view's own tools, on the right.
 */
export function PageBar({
  summary,
  view,
  children,
}: {
  summary: PageSummary
  view: View
  children?: ReactNode
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const params = { kind: summary.kind, name: summary.name }
  const versions = [
    ...(summary.hasProposal ? ['a'] : []),
    ...summary.alternates,
  ]
  const alternate =
    view.variant === 'proposal' && view.version !== 'a' ? view.version : null

  const promote = async (version: string) => {
    const result = await promoteVersion({ data: { ...params, version } })
    if (!result.ok) return setError(result.message)
    setError(null)
    await router.invalidate()
    await navigate({
      to: '/pages/$kind/$name',
      params,
      search: { variant: 'proposal', version: 'a' },
    })
  }

  const discard = async (version: string) => {
    if (
      !window.confirm(
        `Delete version ${version.toUpperCase()} of ${summary.name}?`,
      )
    )
      return
    const result = await discardVersion({ data: { ...params, version } })
    if (!result.ok) return setError(result.message)
    setError(null)
    await router.invalidate()
    await navigate({
      to: '/pages/$kind/$name',
      params,
      search: summary.hasProposal ? { variant: 'proposal' } : {},
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--line) px-4 py-1.5 text-sm">
      <span className="font-medium">
        {summary.kind} / {summary.name}
      </span>
      <nav aria-label="Views" className="flex items-center gap-1">
        {summary.hasReference && (
          <Link
            to="/pages/$kind/$name"
            params={params}
            search={{ variant: 'reference' }}
            aria-current={view.variant === 'reference'}
            className={tab}
          >
            Reference
          </Link>
        )}
        {versions.length > 0 ? (
          <span className="flex items-center gap-1">
            <Link
              to="/pages/$kind/$name"
              params={params}
              search={{ variant: 'proposal' }}
              aria-current={view.variant === 'proposal'}
              className={tab}
            >
              Proposal
            </Link>
            {versions.length > 1 &&
              versions.map((v) => (
                <Link
                  key={v}
                  to="/pages/$kind/$name"
                  params={params}
                  search={{ variant: 'proposal', version: v }}
                  aria-current={
                    view.variant === 'proposal' && view.version === v
                  }
                  title={
                    v === 'a'
                      ? 'The proposal: what implement-design implements'
                      : `Alternate ${v.toUpperCase()}`
                  }
                  className={chip}
                >
                  {v.toUpperCase()}
                </Link>
              ))}
          </span>
        ) : (
          <span className="px-2 text-[13px] opacity-40" title="No proposal yet">
            Proposal
          </span>
        )}
        <Link
          to="/pages/$kind/$name"
          params={params}
          search={{ variant: 'wireframe' }}
          aria-current={view.variant === 'wireframe'}
          className={tab}
        >
          Wireframes
          {summary.wireframes.length > 0 && (
            <span className="ml-1 text-(--ink-3)">
              {summary.wireframes.length}
            </span>
          )}
        </Link>
      </nav>
      {alternate && (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            className={primaryButton}
            title="This version becomes the proposal (A), the one implement-design implements"
            onClick={() => void promote(alternate)}
          >
            Use this version
          </button>
          <button
            type="button"
            className={button}
            onClick={() => void discard(alternate)}
          >
            Discard
          </button>
        </span>
      )}
      <span className="flex-1" />
      {children}
      {error && (
        <span role="alert" className="w-full text-xs text-(--red)">
          {error}
        </span>
      )}
    </div>
  )
}
