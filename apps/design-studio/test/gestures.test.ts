// @vitest-environment jsdom
import grapesjs from 'grapesjs'
import type { Component, Editor } from 'grapesjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { remapIds } from '../src/editor/clipboard'
import { componentMarkup, layerLabel } from '../src/editor/component-ref'
import {
  clipFromSelection,
  insertClip,
  moveComponent,
  performDrop,
} from '../src/editor/gestures'
import { serializeEditor } from '../src/editor/serialize'

const PAGE = `<!doctype html><html><head><style data-studio></style></head><body>
<div class="row"><button class="a">A</button><button class="b">B</button></div>
<div class="lone"><button class="c" data-component="Button">C</button></div>
</body></html>`

let editor: Editor
beforeEach(() => {
  editor = grapesjs.init({
    headless: true,
    storageManager: false,
    selectorManager: { componentFirst: true },
    components: `<div class="row"><button class="a">A</button><button class="b">B</button></div><div class="lone"><button class="c" data-component="Button">C</button></div>`,
  })
  editor.UndoManager.clear()
})
afterEach(() => editor.destroy())

// Headless components have no elements to query: walk the model.
const find = (cls: string): Component => {
  let found: Component | undefined
  editor.getWrapper()!.onAll((c: Component) => {
    if (c.getClasses().includes(cls)) found = c
  })
  return found!
}
const out = () => serializeEditor(editor, PAGE)
const steps = () => editor.UndoManager.getStackGroup().length

describe('a drop is only order and layout', () => {
  it('reorders siblings and undoes in one step', async () => {
    const before = out()
    performDrop(
      find('b'),
      find('row'),
      { kind: 'between', level: 0, index: 0 },
      { axis: 'x', flex: true },
    )
    expect(out().indexOf('class="b"')).toBeLessThan(out().indexOf('class="a"'))
    expect(steps()).toBe(1)
    editor.UndoManager.undo()
    expect(out()).toBe(before)
  })

  it('pushes a lone button to the right of its row with the container’s alignment', () => {
    performDrop(
      find('c'),
      find('lone'),
      { kind: 'align', level: 0, side: 'end' },
      { axis: 'x', flex: false },
    )
    const css = out()
    expect(css).toMatch(/justify-content:\s*flex-end/)
    expect(css).toMatch(/display:\s*flex/)
    expect(steps()).toBe(1)
  })

  it('pushes the last button with margin-left: auto and writes nothing positional', () => {
    performDrop(
      find('a'),
      find('row'),
      { kind: 'push', level: 0, index: 1, edge: 'end' },
      { axis: 'x', flex: true },
    )
    const page = out()
    expect(page).toMatch(/margin-left:\s*auto/)
    expect(page).not.toMatch(
      /(^|[\s;{])(position|top|left|right|bottom|inset)\s*:|transform/,
    )
    expect(steps()).toBe(1)
  })

  it('moves into another box and forgets an earlier push when it is just moved', () => {
    performDrop(
      find('a'),
      find('row'),
      { kind: 'push', level: 0, index: 1, edge: 'end' },
      { axis: 'x', flex: true },
    )
    performDrop(
      find('a'),
      find('lone'),
      { kind: 'between', level: 0, index: 0 },
      { axis: 'y', flex: false },
    )
    expect(find('a').parent()).toBe(find('lone'))
    expect(out()).not.toMatch(/margin-left/)
  })

  it('moves among elements only, counting past text', () => {
    const row = find('row')
    row.append('some text')
    moveComponent(find('a'), row, 1)
    expect(find('b').index()).toBeLessThan(find('a').index())
  })
})

describe('copy and duplicate', () => {
  it('keeps data-component on a copy, in one undo step', () => {
    editor.select(find('c'))
    insertClip(editor, clipFromSelection(editor)!)
    expect(out().match(/data-component="Button"/g)).toHaveLength(2)
    expect(steps()).toBe(1)
    editor.UndoManager.undo()
    expect(out().match(/data-component="Button"/g)).toHaveLength(1)
  })

  it('carries an element’s rules along under a new id, so a paste elsewhere keeps its style', () => {
    find('a').addStyle({ color: 'red' })
    editor.select(find('a'))
    const clip = clipFromSelection(editor)!
    expect(clip.css).toMatch(/color:\s*red/)
    insertClip(editor, clip)
    const css = editor.getCss({ avoidProtected: true })!
    expect(css.match(/color:\s*red/g)).toHaveLength(2)
    const ids = [...css.matchAll(/#([\w-]+)\s*\{/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(2)
  })

  it('pastes a clip into another page', () => {
    editor.select(find('c'))
    const clip = clipFromSelection(editor)!
    const other = grapesjs.init({
      headless: true,
      storageManager: false,
      components: '<p>x</p>',
    })
    insertClip(other, clip)
    expect(other.getHtml()).toContain('data-component="Button"')
    other.destroy()
  })
})

describe('remapIds', () => {
  it('renames ids in the markup and in the rules, once', () => {
    const clip = remapIds(
      {
        html: '<i id="a"></i><i id="a-1"></i>',
        css: '#a{color:red}#a-1{color:blue}#b{x:y}',
      },
      new Set(['a']),
    )
    expect(clip.html).toBe('<i id="a-2"></i><i id="a-1-1"></i>')
    expect(clip.css).toBe('#a-2{color:red}#a-1-1{color:blue}#b{x:y}')
  })

  it('leaves a clip without ids alone', () => {
    expect(remapIds({ html: '<p></p>', css: '' }, new Set())).toEqual({
      html: '<p></p>',
      css: '',
    })
  })
})

describe('componentMarkup', () => {
  const ref = (body: string) => `<html><head></head><body>${body}</body></html>`

  it('puts data-component on the single root, classes kept', () => {
    const html = componentMarkup(
      'Button',
      ref('\n<button class="btn">Save</button>\n'),
    )
    expect(html).toBe(
      '<button class="btn" data-component="Button">Save</button>',
    )
  })

  it('wraps several roots in a box that takes no part in the layout', () => {
    const html = componentMarkup(
      'Dialog',
      ref('<div class="scrim"></div><div class="dlg"></div>'),
    )
    expect(html).toMatch(
      /^<div data-component="Dialog" style="display: contents;?">/,
    )
    expect(html).toContain('class="scrim"')
  })

  it('drops scripts', () => {
    expect(
      componentMarkup('X', ref('<p>a</p><script>1</script>')),
    ).not.toContain('script')
  })

  it('survives being inserted: the editor keeps the attribute', () => {
    const added = editor
      .getWrapper()!
      .append(componentMarkup('Button', ref('<button class="btn">S</button>')))
    expect(added[0].getAttributes()['data-component']).toBe('Button')
    expect(out()).toContain('data-component="Button"')
  })
})

describe('layerLabel', () => {
  it('names a component instance by its manifest name', () => {
    expect(
      layerLabel({
        tag: 'button',
        attributes: { 'data-component': 'Button', class: 'btn' },
      }),
    ).toBe('Button')
  })

  it('names a plain element by tag, class and a start of its text', () => {
    expect(
      layerLabel({
        tag: 'h2',
        attributes: { class: 'title big', id: 'i3x9' },
        text: '  Hello   there ',
      }),
    ).toBe('h2.title “Hello there”')
    expect(layerLabel({ tag: 'div', attributes: { id: 'hero' } })).toBe(
      'div#hero',
    )
    expect(layerLabel({ tag: 'p', attributes: {} })).toBe('p')
  })
})
