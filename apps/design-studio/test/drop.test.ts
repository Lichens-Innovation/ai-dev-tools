import { describe, expect, it } from 'vitest'
import {
  acceptsChildren,
  alignStyle,
  axisOf,
  dropStyle,
  markerFor,
  resolveDrop,
  siblingMove,
  treeDrop,
} from '../src/editor/drop'
import type { Level, Rect } from '../src/editor/drop'

const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
): Rect => ({
  left,
  top,
  width,
  height,
})

/** A row 400 wide with three 80px boxes at 0, 100, 200 (the dragged element is not among them). */
const row = (over: Partial<Level> = {}): Level => ({
  rect: rect(0, 0, 400, 40),
  axis: 'x',
  flex: true,
  own: false,
  children: [rect(0, 0, 80, 40), rect(100, 0, 80, 40), rect(200, 0, 80, 40)],
  ...over,
})
const column = (over: Partial<Level> = {}): Level => ({
  rect: rect(0, 0, 200, 300),
  axis: 'y',
  flex: false,
  own: false,
  children: [rect(0, 0, 200, 40), rect(0, 50, 200, 40)],
  ...over,
})

describe('resolveDrop: order', () => {
  it('drops between two siblings of a row at the gap', () => {
    expect(resolveDrop([row()], { x: 90, y: 20 })).toEqual({
      kind: 'between',
      level: 0,
      index: 1,
    })
  })

  it('goes before or after a sibling by which half the pointer is in', () => {
    expect(resolveDrop([row()], { x: 110, y: 20 })).toMatchObject({ index: 1 })
    expect(resolveDrop([row()], { x: 150, y: 20 })).toMatchObject({ index: 2 })
  })

  it('goes first before the first child', () => {
    expect(resolveDrop([row()], { x: 5, y: 20 })).toMatchObject({ index: 0 })
  })

  it('orders a column by y', () => {
    expect(resolveDrop([column()], { x: 100, y: 45 })).toEqual({
      kind: 'between',
      level: 0,
      index: 1,
    })
    expect(resolveDrop([column()], { x: 100, y: 200 })).toEqual({
      kind: 'between',
      level: 0,
      index: 2,
    })
  })
})

describe('resolveDrop: into a box', () => {
  it('drops into an empty box that is not the element’s own', () => {
    const empty = column({ children: [] })
    expect(resolveDrop([empty], { x: 50, y: 50 })).toEqual({
      kind: 'between',
      level: 0,
      index: 0,
    })
  })

  it('drops into the inner box away from its edges', () => {
    const inner = column({
      rect: rect(10, 10, 200, 100),
      indexInParent: 1,
    })
    const outer = row()
    expect(resolveDrop([inner, outer], { x: 110, y: 60 })).toMatchObject({
      kind: 'between',
      level: 0,
    })
  })

  it('drops beside the inner box, in its parent, near its edge along the parent’s axis', () => {
    const inner = column({ rect: rect(100, 0, 80, 40), indexInParent: 1 })
    const outer = row()
    expect(resolveDrop([inner, outer], { x: 102, y: 20 })).toEqual({
      kind: 'between',
      level: 1,
      index: 1,
    })
    expect(resolveDrop([inner, outer], { x: 178, y: 20 })).toEqual({
      kind: 'between',
      level: 1,
      index: 2,
    })
  })

  it('has no drop without a box', () => {
    expect(resolveDrop([], { x: 0, y: 0 })).toBeNull()
  })
})

describe('resolveDrop: push to the end or the centre', () => {
  it('pushes to the end past the last child of a row', () => {
    expect(resolveDrop([row()], { x: 390, y: 20 })).toEqual({
      kind: 'push',
      level: 0,
      index: 3,
      edge: 'end',
    })
  })

  it('pushes to the centre around the middle of the free space', () => {
    expect(resolveDrop([row()], { x: 205 + 80, y: 20 })).toMatchObject({
      kind: 'between',
    })
    expect(resolveDrop([row()], { x: 200, y: 20 })).toMatchObject({
      kind: 'between',
    })
    const sparse = row({ children: [rect(0, 0, 80, 40)] })
    expect(resolveDrop([sparse], { x: 200, y: 20 })).toEqual({
      kind: 'push',
      level: 0,
      index: 1,
      edge: 'center',
    })
  })

  it('only appends just after the last child (no room to push)', () => {
    expect(resolveDrop([row()], { x: 290, y: 20 })).toMatchObject({
      kind: 'between',
      index: 3,
    })
  })

  it('pushes to the bottom of a flex column, not of plain blocks', () => {
    const flexColumn = column({ flex: true })
    expect(resolveDrop([flexColumn], { x: 100, y: 290 })).toMatchObject({
      kind: 'push',
      edge: 'end',
    })
    expect(resolveDrop([column()], { x: 100, y: 290 })).toMatchObject({
      kind: 'between',
      index: 2,
    })
  })

  it('lines up the only child of its box by thirds', () => {
    const lone = row({ children: [], own: true })
    expect(resolveDrop([lone], { x: 30, y: 20 })).toMatchObject({
      kind: 'align',
      side: 'start',
    })
    expect(resolveDrop([lone], { x: 200, y: 20 })).toMatchObject({
      kind: 'align',
      side: 'center',
    })
    expect(resolveDrop([lone], { x: 380, y: 20 })).toMatchObject({
      kind: 'align',
      side: 'end',
    })
  })
})

describe('dropStyle: layout, never coordinates', () => {
  const positional = /^(position|top|left|right|bottom|transform|inset)/

  it('writes margin-left: auto to push a row child to the end', () => {
    const drop = resolveDrop([row()], { x: 390, y: 20 })!
    const { element, container } = dropStyle(drop, row())
    expect(element['margin-left']).toBe('auto')
    expect(element['margin-right']).toBe('')
    expect(container).toEqual({})
  })

  it('writes both auto margins for the centre', () => {
    const { element } = dropStyle(
      { kind: 'push', level: 0, index: 1, edge: 'center' },
      row(),
    )
    expect(element['margin-left']).toBe('auto')
    expect(element['margin-right']).toBe('auto')
  })

  it('turns a plain row into a flex box to push inside it', () => {
    const { container } = dropStyle(
      { kind: 'push', level: 0, index: 1, edge: 'end' },
      row({ flex: false }),
    )
    expect(container).toEqual({ display: 'flex' })
  })

  it('aligns the container when the element is its only child', () => {
    const { container, element } = dropStyle(
      { kind: 'align', level: 0, side: 'end' },
      { axis: 'x', flex: false },
    )
    expect(container).toEqual({
      display: 'flex',
      'justify-content': 'flex-end',
    })
    expect(element['margin-left']).toBe('')
  })

  it('aligns across a column with align-items', () => {
    const { container } = dropStyle(
      { kind: 'align', level: 0, side: 'end' },
      { axis: 'y', flex: false },
    )
    expect(container).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'flex-end',
    })
  })

  it('a plain move writes only empty margins: it forgets an earlier push', () => {
    const { element, container } = dropStyle(
      { kind: 'between', level: 0, index: 0 },
      row(),
    )
    expect(Object.values(element).every((v) => v === '')).toBe(true)
    expect(container).toEqual({})
  })

  it('never writes a positional property', () => {
    for (const drop of [
      { kind: 'between', level: 0, index: 1 },
      { kind: 'push', level: 0, index: 1, edge: 'end' },
      { kind: 'push', level: 0, index: 1, edge: 'center' },
      { kind: 'align', level: 0, side: 'start' },
    ] as const)
      for (const level of [row(), column(), row({ flex: false })]) {
        const { element, container } = dropStyle(drop, level)
        for (const prop of [...Object.keys(element), ...Object.keys(container)])
          expect(prop).not.toMatch(positional)
      }
  })
})

describe('alignStyle, axisOf, siblingMove, treeDrop', () => {
  it('lines up along the row with justify-content, down the column with align-items', () => {
    expect(alignStyle('x', 'end')).toEqual({ 'justify-content': 'flex-end' })
    expect(alignStyle('y', 'center')).toEqual({ 'align-items': 'center' })
    expect(alignStyle('y', 'between')).toEqual({
      'justify-content': 'space-between',
    })
  })

  it('reads the axis from flex, else from where the children sit', () => {
    expect(axisOf({ display: 'flex', flexDirection: 'row' }, [])).toBe('x')
    expect(axisOf({ display: 'flex', flexDirection: 'column' }, [])).toBe('y')
    const side = [rect(0, 0, 50, 20), rect(60, 0, 50, 20)]
    const stacked = [rect(0, 0, 50, 20), rect(0, 30, 50, 20)]
    expect(axisOf({ display: 'block', flexDirection: 'row' }, side)).toBe('x')
    expect(axisOf({ display: 'block', flexDirection: 'row' }, stacked)).toBe(
      'y',
    )
    expect(axisOf({ display: 'block', flexDirection: 'row' }, [])).toBe('y')
  })

  it('moves a sibling by one, and stops at the ends', () => {
    expect(siblingMove(1, 3, 'ArrowLeft')).toBe(0)
    expect(siblingMove(1, 3, 'ArrowDown')).toBe(2)
    expect(siblingMove(0, 3, 'ArrowUp')).toBeNull()
    expect(siblingMove(2, 3, 'ArrowRight')).toBeNull()
    expect(siblingMove(1, 3, 'x')).toBeNull()
  })

  it('drops on a layer row above, below or onto it', () => {
    expect(treeDrop(0.1, true)).toBe('before')
    expect(treeDrop(0.5, true)).toBe('into')
    expect(treeDrop(0.9, true)).toBe('after')
    expect(treeDrop(0.3, false)).toBe('before')
    expect(treeDrop(0.6, false)).toBe('after')
  })

  it('only drops into box tags', () => {
    expect(acceptsChildren('DIV')).toBe(true)
    expect(acceptsChildren('button')).toBe(false)
    expect(acceptsChildren('img')).toBe(false)
  })
})

describe('markerFor', () => {
  it('draws a line between two siblings and outlines the box', () => {
    const level = row()
    const m = markerFor({ kind: 'between', level: 0, index: 1 }, level, 'div')
    expect(m.container).toEqual(level.rect)
    expect(m.line).toMatchObject({ left: 88.5, width: 3, height: 40 })
    expect(m.label).toBe('Between')
  })

  it('names the push and puts the line at the far end', () => {
    const m = markerFor(
      { kind: 'push', level: 0, index: 3, edge: 'end' },
      row(),
      'div',
    )
    expect(m.label).toMatch(/end/)
    expect(m.line!.left + m.line!.width).toBe(400)
  })

  it('shows only the box for an empty one', () => {
    const m = markerFor(
      { kind: 'between', level: 0, index: 0 },
      row({ children: [] }),
      'section',
    )
    expect(m.line).toBeNull()
    expect(m.label).toBe('Into <section>')
  })
})
