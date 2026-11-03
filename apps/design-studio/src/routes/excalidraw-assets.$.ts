import { createFileRoute } from '@tanstack/react-router'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/* Excalidraw loads its fonts at run time from `EXCALIDRAW_ASSET_PATH` (a CDN by default). The studio serves them from
   its own dependency instead, so nothing leaves the machine. Fonts only. */
const FONTS = path.resolve(
  'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
)

export const Route = createFileRoute('/excalidraw-assets/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const missing = () => new Response('Not found', { status: 404 })
        let rel: string
        try {
          rel = decodeURIComponent(params._splat ?? '')
        } catch {
          return missing()
        }
        const file = path.resolve(FONTS, rel.replace(/^fonts\//, ''))
        if (!file.startsWith(FONTS + path.sep) || !/\.woff2?$/.test(file))
          return missing()
        try {
          return new Response(new Uint8Array(await readFile(file)), {
            headers: {
              'Content-Type': 'font/woff2',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        } catch {
          return missing()
        }
      },
    },
  },
})
