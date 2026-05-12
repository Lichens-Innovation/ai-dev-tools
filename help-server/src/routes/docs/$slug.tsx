import { createFileRoute, notFound, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Highlighter from 'react-highlight-words'
import { getDocContent } from '../../utils/docs'

export const Route = createFileRoute('/docs/$slug')({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
  }),
  loader: async ({ params }) => {
    try {
      return await getDocContent({ data: params.slug })
    } catch {
      throw notFound()
    }
  },
  component: DocPage,
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function makeHeadingComponent(
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  searchWords: string[],
) {
  const Tag = tag
  return function Heading({ children }: { children?: React.ReactNode }) {
    const text = String(children)
    const id = slugify(text)
    return (
      <Tag id={id}>
        {searchWords.length > 0 ? (
          <Highlighter
            searchWords={searchWords}
            textToHighlight={text}
            autoEscape
            highlightClassName="bg-[var(--amber-dim-2)] text-[var(--amber)] rounded-sm px-0.5"
          />
        ) : (
          children
        )}
      </Tag>
    )
  }
}

function makeTextComponent(searchWords: string[]) {
  if (searchWords.length === 0) return undefined
  return function Text({ children }: { children?: React.ReactNode }) {
    if (typeof children !== 'string') return <>{children}</>
    return (
      <Highlighter
        searchWords={searchWords}
        textToHighlight={children}
        autoEscape
        highlightClassName="bg-[var(--amber-dim-2)] text-[var(--amber)] rounded-sm px-0.5"
      />
    )
  }
}

function DocPage() {
  const { content } = Route.useLoaderData()
  const { q } = useSearch({ from: '/docs/$slug' })

  useEffect(() => {
    if (window.location.hash) {
      const el = document.querySelector(window.location.hash)
      if (el)
        setTimeout(
          () => el.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          100,
        )
    }
  }, [content])

  const searchWords = q ? [q] : []

  const components = {
    h1: makeHeadingComponent('h1', searchWords),
    h2: makeHeadingComponent('h2', searchWords),
    h3: makeHeadingComponent('h3', searchWords),
    h4: makeHeadingComponent('h4', searchWords),
    h5: makeHeadingComponent('h5', searchWords),
    h6: makeHeadingComponent('h6', searchWords),
    ...(searchWords.length > 0 ? { text: makeTextComponent(searchWords) } : {}),
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-10">
      <article className="rise-in mx-auto max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-6 py-10 shadow-[var(--shadow-1)] sm:px-10">
        <div className="prose prose-neutral max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      </article>
    </main>
  )
}
