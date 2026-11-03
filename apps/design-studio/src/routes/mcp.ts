import { createFileRoute } from '@tanstack/react-router'
import { handleMcp } from '#/server/mcp'
import { getStudio } from '#/server/studio'

const handle = ({ request }: { request: Request }) =>
  handleMcp(request, getStudio())

export const Route = createFileRoute('/mcp')({
  server: { handlers: { GET: handle, POST: handle, DELETE: handle } },
})
