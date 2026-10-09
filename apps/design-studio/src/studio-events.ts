import type { StudioMessage } from '#/server/hub'

const target = typeof window === 'undefined' ? null : new EventTarget()

/** Subscribe to the server event stream's messages (see useStudioStream in the root route). */
export function onStudioMessage(
  listener: (message: StudioMessage) => void,
): () => void {
  if (!target) return () => {}
  const handler = (e: Event) =>
    listener((e as CustomEvent<StudioMessage>).detail)
  target.addEventListener('message', handler)
  return () => target.removeEventListener('message', handler)
}

/** Opens the one EventSource of this tab and fans its messages out. Returns the closer. */
export function connectStudioStream(): () => void {
  if (!target) return () => {}
  const source = new EventSource('/events')
  source.onmessage = (e) =>
    target.dispatchEvent(
      new CustomEvent('message', {
        detail: JSON.parse(e.data) as StudioMessage,
      }),
    )
  return () => source.close()
}
