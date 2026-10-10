/* The DOM and Excalidraw hand back missing frames, windows and elements at runtime that their types call present. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  anchored,
  createAnchoring,
  domMetrics,
  selectorFor,
} from '../src/sketch/anchors'
import type { PageMetrics, Rect } from '../src/sketch/anchors'
import type { SketchElement } from '../src/server/sketch'
import { sameView, sketchView, toScreen } from '../src/sketch/view'

/** jsdom has no layout: boxes come from a table the test edits to move things. */
function page(html: string, boxes: Record<string, Rect>) {
  document.body.innerHTML = html
  const table = { ...boxes }
  for (const el of document.body.querySelectorAll('*')) {
    el.getBoundingClientRect = () => {
      const r = table[el.getAttribute('data-box') ?? '']
      return {
        left: r?.x ?? 0,
        top: r?.y ?? 0,
        width: r?.w ?? 0,
        height: r?.h ?? 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    }
  }
  return table
}

const html = `
  <main id="app" data-box="app">
    <section data-box="s1"><h1 data-box="h1">Title</h1></section>
    <section data-box="s2"><button id="buy" data-box="buy">Buy</button><p data-box="p">Text</p></section>
  </main>`
const boxes = {
  app: { x: 0, y: 0, w: 800, h: 600 },
  s1: { x: 0, y: 0, w: 800, h: 100 },
  h1: { x: 20, y: 20, w: 200, h: 40 },
  s2: { x: 0, y: 100, w: 800, h: 200 },
  buy: { x: 100, y: 120, w: 80, h: 30 },
  p: { x: 100, y: 200, w: 300, h: 20 },
}

const shape = (extra: Partial<SketchElement> = {}): SketchElement => ({
  id: 's',
  type: 'rectangle',
  x: 90,
  y: 110,
  width: 100,
  height: 50,
  version: 1,
  ...extra,
})

describe('selectorFor', () => {
  it('prefers an id, else the path from the nearest id', () => {
    page(html, boxes)
    expect(selectorFor(document.querySelector('#buy')!)).toBe('#buy')
    expect(selectorFor(document.querySelector('h1')!)).toBe(
      '#app > section:nth-of-type(1) > h1',
    )
    expect(selectorFor(document.querySelector('p')!)).toBe(
      '#app > section:nth-of-type(2) > p',
    )
  })

  it('ignores ids the saved file would not keep', () => {
    page(html, boxes)
    const sel = selectorFor(
      document.querySelector('#buy')!,
      (id) => id !== 'buy',
    )
    expect(sel).toBe('#app > section:nth-of-type(2) > button')
    expect(document.querySelector(sel)).toBe(document.querySelector('#buy'))
  })

  it('falls back to a path from body when there is no id at all', () => {
    page('<div><p>a</p><p>b</p></div>', {})
    expect(selectorFor(document.querySelectorAll('p')[1])).toBe(
      'body > div > p:nth-of-type(2)',
    )
  })
})

describe('anchors', () => {
  it('anchors a shape on the smallest element around its centre', () => {
    page(html, boxes)
    const out = anchored(shape(), domMetrics(document))
    // Centre (140,135) is inside the button (100..180, 120..150).
    expect(out.customData?.anchor).toEqual({ selector: '#buy', dx: 40, dy: 15 })
    expect(out.customData?.endAnchor).toBeUndefined()
  })

  it('anchors an arrow at its start and its tip', () => {
    page(html, boxes)
    const arrow = shape({
      type: 'arrow',
      x: 300,
      y: 300,
      width: -180,
      height: -165,
      points: [
        [0, 0],
        [-180, -165],
      ],
    })
    const out = anchored(arrow, domMetrics(document))
    // Start (300,300) is in #app only (s2 ends at 300 inclusive: smallest is s2).
    expect(out.customData?.anchor?.selector).toBe(
      '#app > section:nth-of-type(2)',
    )
    // Tip (120,135) is in the button.
    expect(out.customData?.endAnchor).toEqual({
      selector: '#buy',
      dx: 20,
      dy: 15,
    })
  })

  it('records nothing for a point outside every element', () => {
    page(html, boxes)
    const out = anchored(shape({ x: 2000, y: 2000 }), domMetrics(document))
    expect(out.customData?.anchor).toBeUndefined()
  })
})

describe('sync: the note follows the element', () => {
  it('anchors a new shape, then moves it when the element moves', () => {
    const table = page(html, boxes)
    const anchoring = createAnchoring(domMetrics(document))

    const first = anchoring.sync([shape()], true)
    expect(first?.[0]?.customData?.anchor?.selector).toBe('#buy')
    expect(anchoring.sync(first!, true)).toBeNull()

    table.buy = { x: 300, y: 400, w: 80, h: 30 }
    const moved = anchoring.sync(first!, true)
    expect(moved?.[0]).toMatchObject({ x: 290, y: 390 })
    expect(moved?.[0]?.version).toBeGreaterThan(first![0].version as number)
    expect(anchoring.sync(moved!, true)).toBeNull()
  })

  it('moves the text bound inside a shape with it', () => {
    const table = page(html, boxes)
    const anchoring = createAnchoring(domMetrics(document))
    const text: SketchElement = {
      id: 't',
      type: 'text',
      x: 100,
      y: 120,
      width: 40,
      height: 20,
      containerId: 's',
    }
    const first = anchoring.sync([shape(), text], true)!
    table.buy = { x: 110, y: 130, w: 80, h: 30 }
    const moved = anchoring.sync(first, true)!
    expect(moved.map((e) => [e.x, e.y])).toEqual([
      [100, 120],
      [110, 130],
    ])
  })

  it('follows a file loaded after the layout changed', () => {
    const table = page(html, boxes)
    const saved = anchored(shape(), domMetrics(document))
    table.buy = { x: 150, y: 120, w: 80, h: 30 }
    const out = createAnchoring(domMetrics(document)).sync([saved], true)
    expect(out?.[0]).toMatchObject({ x: 140, y: 110 })
    expect(out?.[0]?.customData?.anchor?.selector).toBe('#buy')
  })

  it('anchors again where the user dropped a moved shape, but not while dragging', () => {
    page(html, boxes)
    const anchoring = createAnchoring(domMetrics(document))
    const first = anchoring.sync([shape()], true)!
    const dragged = { ...first[0], x: 20, y: 15 }
    expect(anchoring.sync([dragged], false)).toBeNull()
    const dropped = anchoring.sync([dragged], true)
    // Centre (70,40) is in the title (20..220, 20..60).
    expect(dropped?.[0]?.customData?.anchor?.selector).toBe(
      '#app > section:nth-of-type(1) > h1',
    )
    expect([dropped?.[0]?.x, dropped?.[0]?.y]).toEqual([20, 15])
  })

  it('stretches an arrow whose tip follows an element while its start stays', () => {
    const table = page(html, boxes)
    const anchoring = createAnchoring(domMetrics(document))
    const arrow = shape({
      type: 'arrow',
      x: 300,
      y: 500,
      width: -180,
      height: -365,
      points: [
        [0, 0],
        [-180, -365],
      ],
    })
    const first = anchoring.sync([arrow], true)!
    expect(first[0]?.customData?.endAnchor?.selector).toBe('#buy')
    table.buy = { x: 100, y: 220, w: 80, h: 30 }
    const out = anchoring.sync(first, true)!
    // The tip moved by (0,100); the start's element (#app) did not move.
    expect(out[0]?.x).toBe(300)
    expect(out[0]?.y).toBe(500)
    expect(out[0]?.points).toEqual([
      [0, 0],
      [-180, -265],
    ])
    expect(out[0]?.height).toBe(265)
  })

  it('keeps the stored selector in step when a path-selected element moves in the tree', () => {
    const table = page(html, boxes)
    const metrics = domMetrics(document)
    const anchoring = createAnchoring(metrics)
    const first = anchoring.sync(
      [shape({ x: 90, y: 200, height: 20, width: 100 })],
      true,
    )!
    const sel = first[0].customData!.anchor!.selector
    expect(sel).toBe('#app > section:nth-of-type(2) > p')
    // Move the paragraph into the first section: same node, new path and box.
    const p = document.querySelector('section:nth-of-type(2) > p')!
    document.querySelector('section')!.append(p)
    table.p = { x: 300, y: 20, w: 300, h: 20 }
    const out = anchoring.sync(first, true)!
    expect(out[0]?.customData?.anchor?.selector).toBe(
      '#app > section:nth-of-type(1) > p',
    )
    expect(out[0]?.x).toBeGreaterThan(200)
  })

  it('leaves a shape alone when its element is gone', () => {
    page(html, boxes)
    const anchoring = createAnchoring(domMetrics(document))
    const first = anchoring.sync([shape()], true)!
    document.querySelector('#buy')!.remove()
    expect(anchoring.sync(first, true)).toBeNull()
  })

  it('ignores deleted shapes', () => {
    page(html, boxes)
    const anchoring = createAnchoring(domMetrics(document))
    expect(anchoring.sync([shape({ isDeleted: true })], true)).toBeNull()
  })
})

describe('view', () => {
  const metrics: PageMetrics = domMetrics(document)
  it('is the page viewport: scroll and zoom of the frame', () => {
    void metrics
    const host = { left: 100, top: 50 }
    const view = sketchView(
      {
        left: 100,
        top: 50,
        width: 400,
        offsetWidth: 800,
        scrollX: 0,
        scrollY: 300,
      },
      host,
    )
    expect(view).toEqual({ zoom: 0.5, scrollX: 0, scrollY: -300 })
    // The page point (40, 300) is at the frame's top-left, at screen (20, 0) of the host.
    expect(toScreen(view, 40, 300)).toEqual({ x: 20, y: 0 })
  })

  it('accounts for the frame being offset inside the host, and tells equal views apart', () => {
    const a = sketchView(
      {
        left: 160,
        top: 90,
        width: 800,
        offsetWidth: 800,
        scrollX: 10,
        scrollY: 0,
      },
      { left: 100, top: 50 },
    )
    expect(a).toEqual({ zoom: 1, scrollX: 50, scrollY: 40 })
    expect(sameView(a, { ...a, scrollX: a.scrollX + 0.1 })).toBe(true)
    expect(sameView(a, { ...a, zoom: 1.1 })).toBe(false)
  })
})
