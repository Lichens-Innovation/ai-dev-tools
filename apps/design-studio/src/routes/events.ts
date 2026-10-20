import { createFileRoute } from '@tanstack/react-router'
import { getStudio } from '#/server/studio'

/** Server-sent events: file changes and open_page requests, relayed to the browser. */
export const Route = createFileRoute('/events')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const { hub } = getStudio()
        const encoder = new TextEncoder()
        let cleanup = () => {}
        const stream = new ReadableStream({
          start(controller) {
            const send = (chunk: string) => {
              try {
                controller.enqueue(encoder.encode(chunk))
              } catch {
                cleanup()
              }
            }
            const unsubscribe = hub.subscribe((message) =>
              send(`data: ${JSON.stringify(message)}\n\n`),
            )
            const heartbeat = setInterval(() => send(': keep-alive\n\n'), 20000)
            cleanup = () => {
              clearInterval(heartbeat)
              unsubscribe()
              try {
                controller.close()
              } catch {
                // already closed
              }
            }
            request.signal.addEventListener('abort', cleanup)
            send('retry: 1000\n: connected\n\n')
          },
          cancel: () => cleanup(),
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
