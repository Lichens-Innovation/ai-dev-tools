import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject } from '../src/server/design-project'
import type { DesignEvent, DesignProject } from '../src/server/design-project'
import {
  compactShapes,
  emptyScene,
  parseScene,
  removeShapes,
} from '../src/server/sketch'
import type { SketchElement } from '../src/server/sketch'
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
const home = { kind: 'screen', name: 'home' } as const
const file = (rel: string) => path.join(root, rel)

// 1x1 transparent PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const rect = (
  id: string,
  extra: Partial<SketchElement> = {},
): SketchElement => ({
  id,
  type: 'rectangle',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  ...extra,
})

const sceneOf = (elements: SketchElement[]) =>
  JSON.stringify({ ...emptyScene(), elements })

describe('sketch scene helpers', () => {
  it('refuses what is not an Excalidraw scene', () => {
    expect(() => parseScene('nope')).toThrow(/not valid JSON/)
    expect(() => parseScene('{"type":"other","elements":[]}')).toThrow(
      /not an Excalidraw scene/,
    )
    expect(() =>
      parseScene('{"type":"excalidraw","elements":[{"id":1}]}'),
    ).toThrow(/without id/)
  })

  it('lists shapes compactly: text, arrow ends, anchors', () => {
    const scene = parseScene(
      sceneOf([
        rect('a', {
          backgroundColor: '#ffc9c9',
          customData: { anchor: { selector: '#hero', dx: 1, dy: 2 } },
        }),
        {
          id: 'a-text',
          type: 'text',
          x: 12,
          y: 30,
          text: 'make this bigger',
          containerId: 'a',
        },
        {
          id: 'arrow',
          type: 'arrow',
          x: 200,
          y: 100,
          width: 50,
          height: 10,
          points: [
            [0, 0],
            [50, 10],
          ],
          customData: {
            anchor: { selector: '#hero', dx: 0, dy: 0 },
            endAnchor: { selector: 'main > p:nth-of-type(2)', dx: 3, dy: 4 },
          },
        },
        rect('other'),
        rect('gone', { isDeleted: true }),
      ]),
    )
    const shapes = compactShapes(scene, ['a', 'arrow', 'gone', 'missing'])
    expect(shapes.map((s) => s.id)).toEqual(['a', 'arrow'])
    expect(shapes[0]).toMatchObject({
      type: 'rectangle',
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      text: 'make this bigger',
      fill: '#ffc9c9',
      anchor: '#hero',
    })
    expect(shapes[1]).toMatchObject({
      start: { x: 200, y: 100 },
      end: { x: 250, y: 110 },
      anchor: '#hero',
      endAnchor: 'main > p:nth-of-type(2)',
    })
  })

  it('removes shapes and the text bound inside them', () => {
    const scene = parseScene(
      sceneOf([
        rect('a'),
        { id: 't', type: 'text', x: 0, y: 0, containerId: 'a' },
        rect('b'),
      ]),
    )
    expect(removeShapes(scene, ['a']).elements.map((e) => e.id)).toEqual(['b'])
  })
})

describe('sketch store', () => {
  it('reads an empty sketch for a proposal without one', async () => {
    await project.pages.createProposal(button)
    const read = await project.sketch.read(button)
    expect(parseScene(read.json).elements).toEqual([])
    expect(read.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('saves next to the proposal, as <proposal>.excalidraw, atomically', async () => {
    await project.pages.createProposal(button)
    await project.pages.createProposal(home)
    const base = (await project.sketch.read(button)).hash
    const json = sceneOf([rect('a')])
    const { hash } = await project.sketch.save(button, json, base)
    expect(
      await readFile(file('design/proposals/button.excalidraw'), 'utf8'),
    ).toBe(json)
    expect((await project.sketch.read(button)).hash).toBe(hash)

    const screenBase = (await project.sketch.read(home)).hash
    await project.sketch.save(home, json, screenBase)
    await stat(file('design/proposals/screens/home.excalidraw'))

    // No temp files are left behind.
    expect(
      (await readdir(file('design/proposals'))).filter((n) =>
        n.endsWith('.tmp'),
      ),
    ).toEqual([])
  })

  it('refuses a stale base hash (changed on disk) and bad content', async () => {
    await project.pages.createProposal(button)
    const base = (await project.sketch.read(button)).hash
    await project.sketch.save(button, sceneOf([rect('a')]), base)
    await expect(
      project.sketch.save(button, sceneOf([rect('b')]), base),
    ).rejects.toMatchObject({ code: 'Conflict' })
    const fresh = (await project.sketch.read(button)).hash
    await expect(
      project.sketch.save(button, 'nope', fresh),
    ).rejects.toMatchObject({
      code: 'Invalid',
    })
  })

  it('has no sketch without a proposal, and never takes a path', async () => {
    await expect(
      project.sketch.save(button, sceneOf([]), 'x'),
    ).rejects.toMatchObject({ code: 'NotFound' })
    await expect(
      project.sketch.read({ kind: 'component', name: '../../etc/passwd' }),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })

  it('emits a sketch event when the file changes outside', async () => {
    await project.pages.createProposal(button)
    const events: DesignEvent[] = []
    project.watch((e) => events.push(e))
    await project.watching()
    await writeFile(
      file('design/proposals/button.excalidraw'),
      sceneOf([rect('a')]),
    )
    await expect
      .poll(() => events.find((e) => e.kind === 'sketch'), { timeout: 5000 })
      .toMatchObject({ kind: 'sketch', name: 'button', pageKind: 'component' })
  })
})

describe('blank pages', () => {
  it('creates an empty proposal with no reference, listed and sketchable', async () => {
    const { hash } = await project.pages.createBlank({
      kind: 'screen',
      name: 'pricing',
    })
    const html = await readFile(
      file('design/proposals/screens/pricing.html'),
      'utf8',
    )
    expect(html).toContain('href="../../assets/project.css"')
    expect(html).toMatch(/<body>\s*<\/body>/)
    const page = (await project.pages.list()).find((p) => p.name === 'pricing')
    expect(page).toMatchObject({
      kind: 'screen',
      hasReference: false,
      hasProposal: true,
      referenceHash: null,
      proposalHash: hash,
    })
    await project.sketch.save(
      { kind: 'screen', name: 'pricing' },
      sceneOf([rect('a')]),
      (await project.sketch.read({ kind: 'screen', name: 'pricing' })).hash,
    )
  })

  it('refuses a name that already exists, as reference or proposal', async () => {
    await expect(project.pages.createBlank(button)).rejects.toMatchObject({
      code: 'Conflict',
    })
    await project.pages.createBlank({ kind: 'component', name: 'card' })
    await expect(
      project.pages.createBlank({ kind: 'component', name: 'card' }),
    ).rejects.toMatchObject({ code: 'Conflict' })
    await expect(
      project.pages.createBlank({ kind: 'component', name: 'Bad Name' }),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })
})

describe('requests', () => {
  async function sketched() {
    await project.pages.createProposal(button)
    const base = (await project.sketch.read(button)).hash
    await project.sketch.save(
      button,
      sceneOf([
        rect('a'),
        {
          id: 'a-text',
          type: 'text',
          x: 12,
          y: 30,
          text: 'a bigger primary button',
          containerId: 'a',
        },
        rect('b'),
      ]),
      base,
    )
  }

  it('records a pending request with ids and a PNG file, in a git-ignored folder', async () => {
    await sketched()
    const events: DesignEvent[] = []
    project.watch((e) => events.push(e))
    const request = await project.requests.create({
      page: button,
      shapeIds: ['a'],
      png: PNG,
    })
    expect(request).toMatchObject({
      page: button,
      shapeIds: ['a'],
      status: 'pending',
      png: `${request.id}.png`,
    })
    expect(request.id).toMatch(/^rq-[0-9a-f]{8}$/)
    // Only ids and file references: no text of the page in the record.
    expect(JSON.stringify(request)).not.toContain('bigger')
    const bytes = await readFile(file(`design/requests/${request.id}.png`))
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(await readFile(file('design/requests/.gitignore'), 'utf8')).toBe(
      '*\n',
    )
    expect(events).toContainEqual({ kind: 'request', request })
    expect(await project.requests.list()).toEqual([request])
  })

  it('refuses unknown shapes, a bad PNG and a page without a proposal', async () => {
    await sketched()
    await expect(
      project.requests.create({ page: button, shapeIds: ['nope'], png: PNG }),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await expect(
      project.requests.create({ page: button, shapeIds: [], png: PNG }),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await expect(
      project.requests.create({
        page: button,
        shapeIds: ['a'],
        png: Buffer.from('not a png').toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await expect(
      project.requests.create({ page: home, shapeIds: ['a'], png: PNG }),
    ).rejects.toMatchObject({ code: 'NotFound' })
    await expect(project.requests.get('../x')).rejects.toMatchObject({
      code: 'Invalid',
    })
  })

  it('moves pending -> sent -> done, filters the list, and done removes the shapes', async () => {
    await sketched()
    const { id } = await project.requests.create({
      page: button,
      shapeIds: ['a'],
      png: PNG,
    })
    const detail = await project.requests.get(id)
    expect(detail.shapes).toMatchObject([
      { id: 'a', text: 'a bigger primary button' },
    ])

    expect((await project.requests.markSent(id)).status).toBe('sent')
    expect((await project.requests.markSent(id)).status).toBe('sent')
    expect(await project.requests.list({ status: 'pending' })).toEqual([])
    expect(await project.requests.list({ status: 'sent' })).toHaveLength(1)
    expect(await project.requests.list({ page: home })).toEqual([])

    const done = await project.requests.resolve(id, {
      status: 'done',
      note: 'Added a Button',
    })
    expect(done).toMatchObject({ status: 'done', resolution: 'Added a Button' })
    const scene = parseScene((await project.sketch.read(button)).json)
    expect(scene.elements.map((e) => e.id)).toEqual(['b'])

    // Resolved is final, and a late "sent" does not reopen it.
    expect((await project.requests.markSent(id)).status).toBe('done')
    await expect(
      project.requests.resolve(id, { status: 'failed', note: 'x' }),
    ).rejects.toMatchObject({ code: 'Conflict' })
  })

  it('failed needs a reason and keeps the shapes', async () => {
    await sketched()
    const { id } = await project.requests.create({
      page: button,
      shapeIds: ['a'],
      png: PNG,
    })
    await expect(
      project.requests.resolve(id, { status: 'failed', note: ' ' }),
    ).rejects.toMatchObject({ code: 'Invalid' })
    const failed = await project.requests.resolve(id, {
      status: 'failed',
      note: 'No such component',
    })
    expect(failed.status).toBe('failed')
    expect(
      parseScene((await project.sketch.read(button)).json).elements,
    ).toHaveLength(3)
  })

  it('does not lose a state when updates race', async () => {
    await sketched()
    const { id } = await project.requests.create({
      page: button,
      shapeIds: ['a'],
      png: PNG,
    })
    await Promise.all([
      project.requests.markSent(id),
      project.requests.resolve(id, { status: 'done', note: 'ok' }),
      project.requests.markSent(id),
    ])
    expect((await project.requests.get(id)).request.status).toBe('done')
  })
})
