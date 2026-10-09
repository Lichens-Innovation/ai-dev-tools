import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { connectStudioStream, onStudioMessage } from '#/studio-events'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Design studio' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootLayout,
  notFoundComponent: () => (
    <main className="p-6">
      <p>Not found.</p>
      <a href="/" className="underline">
        Back to the pages
      </a>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootLayout() {
  const navigate = useNavigate()

  useEffect(() => {
    const close = connectStudioStream()
    const off = onStudioMessage((message) => {
      if (message.type !== 'open') return
      void navigate({
        to: '/pages/$kind/$name',
        params: { kind: message.kind, name: message.name },
        search: { variant: message.variant },
      })
    })
    return () => {
      off()
      close()
    }
  }, [navigate])

  return <Outlet />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
