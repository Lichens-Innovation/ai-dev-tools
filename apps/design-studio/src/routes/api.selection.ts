import { createFileRoute } from '@tanstack/react-router'
import { getStudio } from '#/server/studio'

/** The browser pushes the editor selection here; MCP get_selection reads it. */
export const Route = createFileRoute('/api/selection')({
  server: {
    handlers: {
      GET: () => Response.json(getStudio().selection.get()),
      PUT: async ({ request }) => {
        getStudio().selection.set(await request.json())
        return new Response(null, { status: 204 })
      },
    },
  },
})
