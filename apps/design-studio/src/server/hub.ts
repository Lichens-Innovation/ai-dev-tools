import type { DesignEvent, PageKind } from './design-project'

/** Where `open_page` sends the browser: a reference, a proposal version, or a wireframe. */
export type OpenTarget =
  | { view: 'reference' }
  | { view: 'proposal'; version: string }
  | { view: 'wireframe'; wireframe: string }

/** What the browser hears on the event stream. */
export type StudioMessage =
  | { type: 'change'; event: DesignEvent }
  | { type: 'open'; kind: PageKind; name: string; target: OpenTarget }

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
