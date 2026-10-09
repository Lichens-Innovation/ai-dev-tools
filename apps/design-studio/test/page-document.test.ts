// @vitest-environment jsdom
import grapesjs from 'grapesjs'
import { describe, expect, it } from 'vitest'
import { applyEdits, formatCss, parsePage } from '../src/editor/page-document'
import { serializeEditor } from '../src/editor/serialize'

const PAGE = `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <title>Button</title>
    <link rel="stylesheet" href="../assets/project.css" />
    <style>.local { color: red; }</style>
  </head>
  <body>
    <button class="btn">Save</button>
  </body>
</html>
`

describe('parsePage', () => {
  it('splits the body, the studio rules and the stylesheets', () => {
    const withStudio = applyEdits(PAGE, {
      body: '<p>x</p>',
      css: '.a{color:red;}',
    })
    expect(parsePage(withStudio)).toEqual({
      body: '<p>x</p>',
      studioCss: '.a {\n  color: red;\n}',
      stylesheets: ['../assets/project.css'],
      otherCss: '.local { color: red; }',
    })
  })
})

describe('applyEdits', () => {
  it('leaves the head alone, writes one data-studio block, and takes it out again', () => {
    const edited = applyEdits(PAGE, {
      body: '<button class="btn" id="b">Hi</button>',
      css: '#b{background-color:var(--primary);}',
    })
    expect(edited).toContain('<title>Button</title>')
    expect(edited).toContain('<style>.local { color: red; }</style>')
    expect(edited.match(/data-studio/g)).toHaveLength(1)
    expect(edited).toContain('<button class="btn" id="b">Hi</button>')
    // again: the block is rewritten, not duplicated
    const again = applyEdits(edited, {
      body: '<p>z</p>',
      css: '#b{color:red;}',
    })
    expect(again.match(/data-studio/g)).toHaveLength(1)
    expect(again).toContain('color: red')
    expect(again).not.toContain('--primary')
    // no rules: no block
    expect(applyEdits(again, { body: '<p>z</p>', css: '' })).not.toContain(
      'data-studio',
    )
  })

  it('does not change what it was not asked to', () => {
    const same = applyEdits(PAGE, {
      body: '<button class="btn">Save</button>',
      css: '',
    })
    expect(parsePage(same).body).toBe(parsePage(PAGE).body)
    expect(same).toContain(
      '<link rel="stylesheet" href="../assets/project.css" />',
    )
  })
})

describe('formatCss', () => {
  it('puts one declaration per line, and keeps urls and media blocks whole', () => {
    expect(
      formatCss(
        '.a{background:url(data:image/png;base64,AA==);color:red;}@media (max-width:600px){.a{color:blue;}}',
      ),
    ).toBe(
      '.a {\n  background: url(data:image/png;base64,AA==);\n  color: red;\n}\n@media (max-width:600px) {\n  .a {\n    color: blue;\n  }\n}',
    )
  })
})

describe('an edit through the editor, saved and reopened', () => {
  const open = (html: string) => {
    const parts = parsePage(html)
    const editor = grapesjs.init({
      headless: true,
      protectedCss: '',
      storageManager: false,
    })
    editor.setComponents(parts.body)
    editor.setStyle(parts.studioCss)
    return editor
  }
  const save = (editor: ReturnType<typeof open>, html: string) =>
    serializeEditor(editor, html)

  it('shows the same result after reopening', () => {
    const editor = open(PAGE)
    const button = editor.getWrapper()!.components().at(0)
    button.addStyle({
      'background-color': 'var(--primary)',
      'border-radius': 'var(--radius-md)',
    })
    button.components().reset()
    button.append('Send')
    const saved = save(editor, PAGE)
    expect(saved).toContain('Send')
    expect(parsePage(saved).studioCss).toMatch(
      /background-color: var\(--primary\)/,
    )

    // Reopening keeps the rules and the text; the editor only settles the attribute order (id first) once.
    const reopened = save(open(saved), saved)
    expect(parsePage(reopened).studioCss).toBe(parsePage(saved).studioCss)
    expect(parsePage(reopened).body).toContain('>Send</button>')
    expect(save(open(reopened), reopened)).toBe(reopened)
  })
})
