import type { DesignEvent, PageKind, PageVariant } from './design-project'

/** What the browser hears on the event stream. */
export type StudioMessage =
  | { type: 'change'; event: DesignEvent }
  | { type: 'open'; kind: PageKind; name: string; variant: PageVariant }

export function createHub() {
  const subscribers = new Set<(message: StudioMessage) => void>()
  return {
    subscribe(fn: (message: StudioMessage) => void) {
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
    publish(message: StudioMessage) {
      for (const fn of [...subscribers]) fn(message)
    },
  }
}

export type Hub = ReturnType<typeof createHub>
