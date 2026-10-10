import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { Navbar } from '#/components/shell/navbar'
import { PaletteFooter } from '#/components/shell/palette-footer'
import { Sidebar } from '#/components/shell/sidebar'
import { InspectProvider } from '#/inspector/inspect-state'
import { PaletteProvider } from '#/palette/palette-state'
import { getShell } from '#/server/functions'
import {
  BAR_HEIGHT,
  SIDEBAR_WIDTH,
  ShellProvider,
  useShell,
} from '#/studio/shell-state'
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
  loader: () => getShell(),
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
  const { root, pages, palette } = Route.useLoaderData()

  return (
    <ShellProvider root={root}>
      <PaletteProvider initial={palette}>
        <InspectProvider>
          <Studio pages={pages} />
        </InspectProvider>
      </PaletteProvider>
    </ShellProvider>
  )
}

function Studio({
  pages,
}: {
  pages: Awaited<ReturnType<typeof getShell>>['pages']
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const shell = useShell()

  useEffect(() => {
    const close = connectStudioStream()
    const off = onStudioMessage((message) => {
      // A page was added, removed or got a proposal: the sidebar and the views read the new list.
      if (message.type === 'change' && message.event.kind === 'page')
        void router.invalidate()
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
  }, [navigate, router])

  return (
    <>
      <Navbar />
      <Sidebar pages={pages} />
      <main
        className="min-h-screen bg-(--bg) text-(--ink) transition-[padding] duration-200"
        style={{
          paddingTop: BAR_HEIGHT,
          paddingBottom: 'var(--ds-footer-h, 0px)',
          paddingLeft: shell.sidebar && shell.wide ? SIDEBAR_WIDTH : 0,
        }}
      >
        <Outlet />
      </main>
      <PaletteFooter />
    </>
  )
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
