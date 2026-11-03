import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject } from '../src/server/design-project'
import type { DesignEvent, DesignProject } from '../src/server/design-project'
import {
  compactWireframe,
  emptyScene,
  parseScene,
  sceneJson,
} from '../src/server/wireframe'
import type { WireframeElement, WireframeScene } from '../src/server/wireframe'
import { tempProject } from './helpers'

let root: string
let cleanup: () => Promise<void>
let project: DesignProject

beforeEach(async () => {
  ;({ root, cleanup } = await tempProject())
  project = openProject(root)
})

afterEach(async () => {
  await project.close()
  await cleanup()
})

const button = { kind: 'component', name: 'button' } as const
const text = (file: string) => readFile(path.join(root, file), 'utf8')
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]).toString('base64')

const rect = (
  id: string,
  extra: Partial<WireframeElement> = {},
): WireframeElement => ({
  id,
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  ...extra,
})

/** A generated card (group g1) with a button in it, a user's note, and a deleted generated title. */
function sample(): WireframeScene {
  const scene = emptyScene({
    base: { variant: 'proposal', version: 'a', hash: 'h' },
    width: 720,
    generated: [
      { id: 'card', selector: '#card' },
      { id: 'btn', selector: '#card > button' },
      { id: 'title', selector: 'body > h1:nth-of-type(1)' },
    ],
  })
  scene.elements = [
    rect('card', {
      width: 300,
      height: 200,
      groupIds: ['g1'],
      backgroundColor: '#f1f3f5',
      customData: {
        source: {
          selector: '#card',
          origin: { x: 0, y: 0, width: 300, height: 200 },
          group: 'g1',
        },
      },
    }),
    rect('btn', {
      x: 52,
      y: 140,
      groupIds: ['g1'],
      customData: {
        source: {
          selector: '#card > button',
          origin: { x: 20, y: 140, width: 100, height: 40 },
          text: 'Save',
        },
      },
    }),
    {
      id: 'btn-label',
      type: 'text',
      x: 60,
      y: 150,
      text: 'Send',
      containerId: 'btn',
    },
    { id: 'note', type: 'text', x: 400, y: 10, text: 'Add a search here' },
    rect('title', { isDeleted: true }),
  ]
  return scene
}

describe('parseScene', () => {
  it('accepts an Excalidraw scene and refuses anything else', () => {
    expect(parseScene(sceneJson(sample())).elements).toHaveLength(5)
    expect(() => parseScene('nope')).toThrow(/not valid JSON/)
    expect(() => parseScene('{"type":"x","elements":[]}')).toThrow(
      /not an Excalidraw scene/,
    )
    expect(() =>
      parseScene('{"type":"excalidraw","elements":[{"id":"a"}]}'),
    ).toThrow(/without id, type or position/)
    expect(() =>
      parseScene(
        '{"type":"excalidraw","elements":[],"studio":{"base":{"variant":"x"},"generated":[]}}',
      ),
    ).toThrow(/bad base page/)
  })
})

describe('compactWireframe', () => {
  it('lists live shapes with their source, changes and parent, and the deleted generated elements', () => {
    const compact = compactWireframe(sample())
    expect(compact.base).toEqual({
      variant: 'proposal',
      version: 'a',
      hash: 'h',
    })
    expect(compact.width).toBe(720)
    expect(compact.partial).toBe(false)
    expect(compact.shapes.map((s) => s.id)).toEqual(['card', 'btn', 'note'])
    const [card, btn, note] = compact.shapes
    expect(card).toMatchObject({
      source: '#card',
      changes: [],
      fill: '#f1f3f5',
    })
    expect(card.parent).toBeUndefined()
    expect(btn).toMatchObject({
      source: '#card > button',
      text: 'Send',
      changes: ['moved', 'retexted'],
      parent: 'card',
    })
    expect(note).toMatchObject({ type: 'text', text: 'Add a search here' })
    expect(note.source).toBeUndefined()
    expect(compact.removed).toEqual(['body > h1:nth-of-type(1)'])
  })

  it('keeps to the selection, and lists no removals for it', () => {
    const compact = compactWireframe(sample(), ['note'])
    expect(compact.partial).toBe(true)
    expect(compact.shapes.map((s) => s.id)).toEqual(['note'])
    expect(compact.removed).toEqual([])
  })
})

describe('wireframes', () => {
  it('creates, lists, saves against a hash and removes', async () => {
    const json = sceneJson(sample())
    const created = await project.wireframes.save(button, 'idea', json, null)
    expect(
      await text('design/wireframes/components/button/idea.excalidraw'),
    ).toBe(json)
    await expect(
      project.wireframes.save(button, 'idea', json, null),
    ).rejects.toMatchObject({ code: 'Conflict' })
    expect(await project.wireframes.list(button)).toEqual(['idea'])

    const next = sceneJson(emptyScene())
    const saved = await project.wireframes.save(
      button,
      'idea',
      next,
      created.hash,
    )
    expect((await project.wireframes.read(button, 'idea')).hash).toBe(
      saved.hash,
    )
    await expect(
      project.wireframes.save(button, 'idea', json, created.hash),
    ).rejects.toMatchObject({ code: 'Conflict' })
    await expect(
      project.wireframes.save(button, 'other', json, 'abc'),
    ).rejects.toMatchObject({ code: 'NotFound' })
    await expect(
      project.wireframes.save(button, 'idea', '{}', saved.hash),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await expect(
      project.wireframes.save(button, '../x', json, null),
    ).rejects.toMatchObject({ code: 'Invalid' })

    await project.wireframes.remove(button, 'idea')
    expect(await project.wireframes.list(button)).toEqual([])
  })

  it('lists a page that only has wireframes, and a blank page once', async () => {
    const page = { kind: 'screen', name: 'settings' } as const
    const blank = await project.pages.createBlank(page)
    expect(blank.wireframe).toBe('main')
    await expect(project.pages.createBlank(page)).rejects.toMatchObject({
      code: 'Conflict',
    })
    await expect(project.pages.createBlank(button)).rejects.toMatchObject({
      code: 'Conflict',
    })
    const listed = (await project.pages.list()).find(
      (p) => p.name === 'settings',
    )
    expect(listed).toMatchObject({
      kind: 'screen',
      hasReference: false,
      hasProposal: false,
      alternates: [],
      wireframes: ['main'],
      width: 1280,
    })
    const scene = parseScene((await project.wireframes.read(page, 'main')).json)
    expect(scene.studio).toMatchObject({ base: null, width: 1280 })
  })
})

describe('proposal versions', () => {
  const page = (body: string) =>
    `<!doctype html><html><head><link rel="stylesheet" href="../assets/project.css" /></head><body>${body}</body></html>`

  it('writes the proposal first, then alternates b, c…', async () => {
    const first = await project.pages.createAlternate(button, page('A'))
    expect(first.version).toBe('a')
    const b = await project.pages.createAlternate(button, page('B'))
    const c = await project.pages.createAlternate(button, page('C'))
    expect([b.version, c.version]).toEqual(['b', 'c'])
    expect(await text('design/proposals/button.b.html')).toContain('B')
    expect((await project.pages.read(button, 'proposal', 'c')).html).toContain(
      'C',
    )
    expect(
      (await project.pages.list()).find((p) => p.name === 'button'),
    ).toMatchObject({ hasProposal: true, alternates: ['b', 'c'] })
    await expect(
      project.pages.createAlternate(button, '<link href="/etc/passwd">'),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })

  it('saves a version against its hash', async () => {
    await project.pages.createAlternate(button, page('A'))
    const b = await project.pages.createAlternate(button, page('B'))
    const saved = await project.pages.saveProposal(
      button,
      page('B2'),
      b.hash,
      'b',
    )
    expect(await text('design/proposals/button.b.html')).toContain('B2')
    expect(await text('design/proposals/button.html')).toContain('A')
    await expect(
      project.pages.saveProposal(button, page('B3'), b.hash, 'b'),
    ).rejects.toMatchObject({ code: 'Conflict' })
    expect(saved.hash).not.toBe(b.hash)
  })

  it('promotes an alternate by swapping it with the proposal, and discards one', async () => {
    await project.pages.createAlternate(button, page('A'))
    await project.pages.createAlternate(button, page('B'))
    await project.pages.promote(button, 'b')
    expect(await text('design/proposals/button.html')).toContain('B')
    expect(await text('design/proposals/button.b.html')).toContain('A')
    await expect(project.pages.promote(button, 'a')).rejects.toMatchObject({
      code: 'Invalid',
    })
    await project.pages.discard(button, 'b')
    expect(existsSync(path.join(root, 'design/proposals/button.b.html'))).toBe(
      false,
    )
    await expect(project.pages.discard(button, 'a')).rejects.toMatchObject({
      code: 'Invalid',
    })
    await expect(project.pages.discard(button, 'c')).rejects.toMatchObject({
      code: 'NotFound',
    })
  })
})

describe('Make real requests', () => {
  beforeEach(async () => {
    await project.wireframes.save(button, 'idea', sceneJson(sample()), null)
  })

  it('records a request for some shapes, compacts them, and resolves it with a version', async () => {
    const request = await project.requests.create({
      page: button,
      wireframe: 'idea',
      shapeIds: ['note'],
      png: PNG,
    })
    expect(request).toMatchObject({
      wireframe: 'idea',
      shapeIds: ['note'],
      status: 'pending',
    })
    const detail = await project.requests.get(request.id)
    expect(detail.wireframe?.partial).toBe(true)
    expect(detail.wireframe?.shapes.map((s) => s.id)).toEqual(['note'])

    await expect(
      project.requests.resolve(request.id, {
        status: 'done',
        note: 'Added a search',
        version: 'b',
      }),
    ).rejects.toMatchObject({ code: 'NotFound' })
    await project.pages.createProposal(button)
    const { version } = await project.pages.createAlternate(
      button,
      await text('design/proposals/button.html'),
    )
    const done = await project.requests.resolve(request.id, {
      status: 'done',
      note: 'Added a search',
      version,
    })
    expect(done).toMatchObject({ status: 'done', version: 'b' })
    // The wireframe stays.
    expect(await project.wireframes.list(button)).toEqual(['idea'])
  })

  it('takes the whole wireframe when no shape is named, and refuses unknown shapes and empty wireframes', async () => {
    const whole = await project.requests.create({
      page: button,
      wireframe: 'idea',
      shapeIds: [],
      png: PNG,
    })
    const detail = await project.requests.get(whole.id)
    expect(detail.wireframe?.partial).toBe(false)
    expect(detail.wireframe?.removed).toEqual(['body > h1:nth-of-type(1)'])

    await expect(
      project.requests.create({
        page: button,
        wireframe: 'idea',
        shapeIds: ['ghost'],
        png: PNG,
      }),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await project.wireframes.save(
      button,
      'empty',
      sceneJson(emptyScene()),
      null,
    )
    await expect(
      project.requests.create({
        page: button,
        wireframe: 'empty',
        shapeIds: [],
        png: PNG,
      }),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })
})

describe('watch', () => {
  it('reports versions, wireframes and deletions', async () => {
    await project.pages.createAlternate(
      button,
      await text('design/components/button.html'),
    )
    const events: DesignEvent[] = []
    const stop = project.watch((e) => events.push(e))
    await project.watching()

    const html = await text('design/proposals/button.html')
    await writeFile(path.join(root, 'design/proposals/button.c.html'), html)
    await expect
      .poll(() => events.find((e) => e.kind === 'page'), { timeout: 5000 })
      .toMatchObject({ kind: 'page', variant: 'proposal', version: 'c' })

    await project.wireframes.save(button, 'idea', sceneJson(sample()), null)
    await expect
      .poll(() => events.find((e) => e.kind === 'wireframe'), {
        timeout: 5000,
      })
      .toMatchObject({
        kind: 'wireframe',
        name: 'button',
        pageKind: 'component',
        wireframe: 'idea',
      })

    await project.wireframes.remove(button, 'idea')
    await expect
      .poll(
        () => events.find((e) => e.kind === 'wireframe' && e.hash === null),
        { timeout: 5000 },
      )
      .toBeTruthy()
    stop()
  })
})
