import { createFileRoute } from '@tanstack/react-router'
import { getStudio } from '#/server/studio'

/** The requests, for the channel server: it asks for the pending ones when it connects. */
export const Route = createFileRoute('/api/requests')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        const all = await getStudio().project.requests.list()
        return Response.json(
          all
            .filter((r) => !status || r.status === status)
            .map((r) => ({ id: r.id, page: r.page, status: r.status })),
        )
      },
    },
  },
})
