export interface EditorSelection {
  /** The page open in the browser, when one is. */
  page?: {
    kind: 'component' | 'screen'
    name: string
    variant: 'reference' | 'proposal'
  }
  /** Whatever the editor reports for the selected element (selector, outerHTML…). Opaque to the server. */
  element?: unknown
}

/** What is selected in the browser right now: the browser pushes it, MCP reads it. Memory only, single user. */
export function createSelectionHolder() {
  let current: EditorSelection = {}
  return {
    get: (): EditorSelection => current,
    set(next: EditorSelection | null) {
      current = next ?? {}
    },
    clear() {
      current = {}
    },
  }
}

export type SelectionHolder = ReturnType<typeof createSelectionHolder>
