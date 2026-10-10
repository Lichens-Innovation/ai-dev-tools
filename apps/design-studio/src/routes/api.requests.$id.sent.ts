import { createFileRoute } from '@tanstack/react-router'
import { isDesignError } from '#/server/errors'
import { getStudio } from '#/server/studio'

/** The channel server delivered a request to Claude Code: pending becomes sent. */
export const Route = createFileRoute('/api/requests/$id/sent')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const request = await getStudio().project.requests.markSent(params.id)
          return Response.json({ id: request.id, status: request.status })
        } catch (error) {
          if (isDesignError(error))
            return Response.json(
              { error: error.code, message: error.message },
              { status: error.code === 'NotFound' ? 404 : 400 },
            )
          throw error
        }
      },
    },
  },
})
