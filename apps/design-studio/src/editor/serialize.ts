import type { Editor } from 'grapesjs'
import { applyEdits } from './page-document'

/** The page file with the editor's DOM and rules in it (ids GrapesJS made up and nothing uses are left out). */
export function serializeEditor(editor: Editor, html: string): string {
  const wrapper = editor.getWrapper()
  // `cleanId` is accepted by toHTML but missing from the typings.
  const options = { cleanId: true } as Parameters<
    NonNullable<typeof wrapper>['getInnerHTML']
  >[0]
  return applyEdits(html, {
    body: wrapper?.getInnerHTML(options) ?? '',
    css: editor.getCss({ avoidProtected: true }) ?? '',
  })
}
