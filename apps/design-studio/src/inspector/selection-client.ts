import type { Picked } from './pick'

export interface OpenPage {
  kind: 'component' | 'screen'
  name: string
  variant: 'reference' | 'proposal'
}

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Hands the selection to the server's holder, where MCP get_selection reads it: the open page and, when an element is
 * picked, its selector, markup excerpt and token trace. A null page clears it. Coalesced: only the last call goes.
 */
export function pushSelection(page: OpenPage | null, picked: Picked | null) {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const body = !page
      ? {}
      : {
          page,
          ...(picked && {
            element: {
              selector: picked.selector,
              excerpt: picked.excerpt,
              tokens: picked.rows,
            },
          }),
        }
    void fetch('/api/selection', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // The server is gone or restarting: the next selection is pushed again.
    })
  }, 60)
}
