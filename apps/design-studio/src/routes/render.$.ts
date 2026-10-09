import { createFileRoute } from '@tanstack/react-router'
import path from 'node:path'
import { renderFile } from '#/server/render'
import { getStudio } from '#/server/studio'

export const Route = createFileRoute('/render/$')({
  server: {
    handlers: {
      GET: ({ params }) =>
        renderFile(
          path.join(getStudio().project.root, 'design'),
          params._splat ?? '',
        ),
    },
  },
})
