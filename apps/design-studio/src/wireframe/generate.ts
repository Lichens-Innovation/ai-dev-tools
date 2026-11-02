/**
 * Draws a rendered page as an Excalidraw wireframe: one clean-lined shape per thing a person sees (boxes, text, buttons,
 * inputs, images, icons), placed where the page lays it out, grouped by the container it sits in. Each shape remembers
 * the element it stands for (`customData.source`), so Claude can tell what the user moved, resized, retexted or
 * deleted. Pure over a document and a probe (measures and computed styles), so jsdom tests can drive it; the browser
 * probe is `probeOf(window)`. The output is Excalidraw element skeletons, for `convertToExcalidrawElements`.
 */
import { selectorFor } from '#/inspector/trace'
import type { Box, ShapeSource } from '#/server/wireframe'

export interface Look {
  display: string
  visibility: string
  opacity: number
  backgroundColor: string
  backgroundImage: string
  borderWidth: number
  boxShadow: string
  fontSize: number
  fontWeight: number
}

/** How the generator sees the page: boxes in page pixels and the computed styles it needs. */
export interface Probe {
  box: (el: Element) => Box
  look: (el: Element) => Look
  /** The box of a text node (null when it cannot be measured). */
  textBox: (node: Text) => Box | null
}

/** An Excalidraw element skeleton (the subset this file writes). */
export interface Skeleton {
  id: string
  type: 'rectangle' | 'ellipse' | 'text' | 'line'
  x: number
  y: number
  width?: number
  height?: number
  text?: string
  fontSize?: number
  strokeColor?: string
  backgroundColor?: string
  fillStyle?: 'hachure' | 'cross-hatch' | 'solid'
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed'
  roundness?: { type: number } | null
  roughness?: number
  fontFamily?: number
  groupIds?: string[]
  label?: {
    text: string
    fontSize?: number
    fontFamily?: number
    strokeColor?: string
    textAlign?: 'left' | 'center'
  }
  customData: { source: ShapeSource }
}

export interface Generated {
  skeletons: Skeleton[]
  /** Every generated shape and its element's selector (the scene's `studio.generated`). */
  generated: { id: string; selector: string }[]
  /** True when the page had more than `maxShapes` shapes: the rest were left out. */
  truncated: boolean
}

/** Excalidraw's "Normal" font (`FONT_FAMILY.Nunito`) and "Architect" sloppiness (`ROUGHNESS.architect`). */
export const FONT_FAMILY = 6
export const ROUGHNESS = 0

const INK = '#1e1e1e'
const MUTED = '#868e96'
const LINK = '#1971c2'
const FILL = '#a5d8ff'
const SURFACE = '#f1f3f5'
const IMAGE = '#ced4da'

const INLINE = new Set([
  'A',
  'ABBR',
  'B',
  'BR',
  'CITE',
  'CODE',
  'EM',
  'I',
  'KBD',
  'LABEL',
  'MARK',
  'Q',
  'S',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
])
const SEMANTIC = new Set([
  'ARTICLE',
  'ASIDE',
  'DIALOG',
  'FIELDSET',
  'FOOTER',
  'FORM',
  'HEADER',
  'MAIN',
  'NAV',
  'SECTION',
  'TABLE',
])
const MEDIA = new Set(['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME'])
const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'NOSCRIPT',
  'META',
  'LINK',
  'HEAD',
])

const transparent = (color: string) =>
  !color ||
  color === 'transparent' ||
  /^rgba\(.*,\s*0(?:\.0+)?\s*\)$/.test(color.replace(/\s+/g, ' '))

const clampFont = (px: number) =>
  Math.round(Math.min(48, Math.max(10, Number.isFinite(px) ? px : 16)))

const textOf = (el: Element) => el.textContent.replace(/\s+/g, ' ').trim()

/** Text cut into lines that fit the box (an approximate hand-font width), the last one ellipsised when it overflows. */
export function fitText(
  text: string,
  width: number,
  height: number,
  fontSize: number,
): string {
  const perLine = Math.max(4, Math.floor(width / (fontSize * 0.55)))
  const maxLines = Math.max(1, Math.floor(height / (fontSize * 1.25)))
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= perLine) line = next
    else {
      if (line) lines.push(line)
      line = word.length > perLine ? `${word.slice(0, perLine - 1)}…` : word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    const last = kept[maxLines - 1]
    kept[maxLines - 1] =
      last.length >= perLine ? `${last.slice(0, perLine - 1)}…` : `${last}…`
    return kept.join('\n')
  }
  return lines.join('\n')
}

const near = (a: Box, b: Box, d = 2) =>
  Math.abs(a.x - b.x) <= d &&
  Math.abs(a.y - b.y) <= d &&
  Math.abs(a.width - b.width) <= d &&
  Math.abs(a.height - b.height) <= d

/** A small inline element with no text of its own: an icon. */
const isIcon = (el: Element, box: Box) =>
  box.width <= 32 &&
  box.height <= 32 &&
  (el.tagName.toLowerCase() === 'svg' ||
    (el.tagName === 'I' && !textOf(el)) ||
    el.getAttribute('role') === 'img')

const isButton = (el: Element) =>
  el.tagName === 'BUTTON' ||
  el.getAttribute('role') === 'button' ||
  (el.tagName === 'INPUT' &&
    ['button', 'submit', 'reset'].includes(
      (el.getAttribute('type') ?? '').toLowerCase(),
    ))

const isField = (el: Element) =>
  el.tagName === 'TEXTAREA' ||
  el.tagName === 'SELECT' ||
  (el.tagName === 'INPUT' &&
    !['hidden', 'button', 'submit', 'reset', 'checkbox', 'radio'].includes(
      (el.getAttribute('type') ?? 'text').toLowerCase(),
    ))

const isCheck = (el: Element) =>
  el.tagName === 'INPUT' &&
  ['checkbox', 'radio'].includes((el.getAttribute('type') ?? '').toLowerCase())

/** Text held directly (not in a block child): the element is a text leaf when all its children are inline. */
const isTextLeaf = (el: Element) =>
  textOf(el) !== '' && [...el.children].every((c) => INLINE.has(c.tagName))

export function generateWireframe(
  doc: Document,
  probe: Probe,
  options: { width: number; maxShapes?: number; idPrefix?: string },
): Generated {
  const maxShapes = options.maxShapes ?? 600
  const prefix =
    options.idPrefix ?? Math.floor(Math.random() * 0xffffff).toString(36)
  const skeletons: Skeleton[] = []
  const generated: Generated['generated'] = []
  let truncated = false
  let n = 0
  const nextId = () => `${prefix}-${(n++).toString(36)}`

  const body = doc.body
  const page = probe.box(body)
  const pageArea = Math.max(1, options.width * Math.max(page.height, 1))

  const add = (
    el: Element | null,
    box: Box,
    shape: Omit<Skeleton, 'id' | 'x' | 'y' | 'customData'>,
    extra: Partial<ShapeSource> = {},
    selector?: string,
  ): string | null => {
    if (skeletons.length >= maxShapes) {
      truncated = true
      return null
    }
    const id = nextId()
    const source: ShapeSource = {
      selector: selector ?? (el ? selectorFor(el) : 'body'),
      origin: { ...box },
      ...extra,
    }
    const component = el?.getAttribute('data-component')
    if (component) source.component = component
    skeletons.push({
      id,
      x: box.x,
      y: box.y,
      roughness: ROUGHNESS,
      ...shape,
      ...(shape.type === 'text' ? { fontFamily: FONT_FAMILY } : {}),
      ...(shape.label
        ? { label: { ...shape.label, fontFamily: FONT_FAMILY } }
        : {}),
      customData: { source },
    })
    generated.push({ id, selector: source.selector })
    return id
  }

  const textShape = (
    el: Element,
    box: Box,
    text: string,
    look: Look,
    groups: string[],
    color = INK,
    selector?: string,
  ) => {
    const fontSize = clampFont(look.fontSize)
    const fitted = fitText(
      text,
      box.width,
      Math.max(box.height, fontSize * 1.25),
      fontSize,
    )
    add(
      el,
      box,
      {
        type: 'text',
        text: fitted,
        fontSize,
        strokeColor: color,
        groupIds: groups,
      },
      { text },
      selector,
    )
  }

  const walk = (
    el: Element,
    parent: Box,
    groups: string[],
    inLink: boolean,
  ) => {
    if (SKIP.has(el.tagName) || truncated) return
    const look = probe.look(el)
    if (
      look.display === 'none' ||
      look.visibility === 'hidden' ||
      look.opacity === 0
    )
      return
    const box = probe.box(el)
    const children = () => {
      for (const child of el.children)
        walk(
          child,
          look.display === 'contents' ? parent : box,
          groups,
          inLink || el.tagName === 'A',
        )
    }
    if (look.display === 'contents' || box.width < 2 || box.height < 2) {
      children()
      return
    }
    const hasFill =
      !transparent(look.backgroundColor) || look.backgroundImage !== 'none'
    const tag = el.tagName.toLowerCase()

    if (MEDIA.has(el.tagName) || (tag === 'svg' && !isIcon(el, box))) {
      add(el, box, {
        type: 'rectangle',
        width: box.width,
        height: box.height,
        strokeColor: INK,
        backgroundColor: IMAGE,
        fillStyle: 'cross-hatch',
        groupIds: groups,
      })
      return
    }
    if (isIcon(el, box)) {
      add(el, box, {
        type: 'ellipse',
        width: box.width,
        height: box.height,
        strokeColor: INK,
        groupIds: groups,
      })
      return
    }
    if (isCheck(el)) {
      const radio = (el.getAttribute('type') ?? '').toLowerCase() === 'radio'
      add(el, box, {
        type: radio ? 'ellipse' : 'rectangle',
        width: box.width,
        height: box.height,
        strokeColor: INK,
        groupIds: groups,
      })
      return
    }
    if (isField(el)) {
      const input = el as HTMLInputElement
      const value =
        (typeof input.value === 'string' && input.value) ||
        el.getAttribute('value') ||
        el.getAttribute('placeholder') ||
        ''
      add(
        el,
        box,
        {
          type: 'rectangle',
          width: box.width,
          height: box.height,
          strokeColor: INK,
          roundness: { type: 3 },
          groupIds: groups,
          ...(value
            ? {
                label: {
                  text: fitText(
                    value,
                    box.width - 16,
                    box.height,
                    clampFont(look.fontSize),
                  ),
                  fontSize: clampFont(look.fontSize),
                  strokeColor: MUTED,
                  textAlign: 'left',
                },
              }
            : {}),
        },
        value ? { text: value } : {},
      )
      return
    }
    if (isButton(el) || (el.tagName === 'A' && hasFill)) {
      const label =
        textOf(el) ||
        el.getAttribute('aria-label') ||
        el.getAttribute('value') ||
        ''
      add(
        el,
        box,
        {
          type: 'rectangle',
          width: box.width,
          height: box.height,
          strokeColor: INK,
          roundness: { type: 3 },
          groupIds: groups,
          ...(hasFill ? { backgroundColor: FILL, fillStyle: 'hachure' } : {}),
          ...(label
            ? {
                label: {
                  text: fitText(
                    label,
                    box.width - 8,
                    box.height,
                    clampFont(look.fontSize),
                  ),
                  fontSize: clampFont(look.fontSize),
                },
              }
            : {}),
        },
        label ? { text: label } : {},
      )
      return
    }

    const boxLike =
      hasFill ||
      look.borderWidth > 0 ||
      (look.boxShadow !== 'none' && look.boxShadow !== '') ||
      SEMANTIC.has(el.tagName)
    const coversPage =
      box.width >= options.width - 2 && box.height >= page.height - 2
    let inner = groups
    if (el !== body && boxLike && !near(box, parent) && !coversPage) {
      const group =
        box.width * box.height <= pageArea * 0.5 ? nextId() : undefined
      const id = add(
        el,
        box,
        {
          type: 'rectangle',
          width: box.width,
          height: box.height,
          strokeColor: INK,
          roundness: { type: 3 },
          groupIds: groups,
          ...(hasFill ? { backgroundColor: SURFACE, fillStyle: 'solid' } : {}),
        },
        group ? { group } : {},
      )
      if (id && group) inner = [group, ...groups]
    }

    if (isTextLeaf(el)) {
      textShape(
        el,
        box,
        textOf(el),
        look,
        inner,
        inLink || el.tagName === 'A' ? LINK : INK,
      )
      return
    }
    // Mixed content: text held directly next to block children, drawn per text node.
    for (const node of el.childNodes) {
      if (node.nodeType !== 3) continue
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
      const at = text ? probe.textBox(node as Text) : null
      if (at && at.width >= 2)
        textShape(el, at, text, look, inner, inLink ? LINK : INK)
    }
    for (const child of el.children)
      walk(child, box, inner, inLink || el.tagName === 'A')
  }

  for (const child of body.children) walk(child, page, [], false)
  return { skeletons, generated, truncated }
}

/** The probe of a live window (an iframe's): boxes in page pixels, computed styles. */
export function probeOf(win: Window): Probe {
  const scroll = () => ({ x: win.scrollX, y: win.scrollY })
  const toBox = (r: DOMRect): Box => {
    const s = scroll()
    return {
      x: Math.round(r.left + s.x),
      y: Math.round(r.top + s.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    }
  }
  return {
    box: (el) => toBox(el.getBoundingClientRect()),
    look: (el) => {
      const s = win.getComputedStyle(el)
      return {
        display: s.display,
        visibility: s.visibility,
        opacity: Number(s.opacity || 1),
        backgroundColor: s.backgroundColor,
        backgroundImage: s.backgroundImage || 'none',
        borderWidth: Math.max(
          parseFloat(s.borderTopWidth) || 0,
          parseFloat(s.borderRightWidth) || 0,
          parseFloat(s.borderBottomWidth) || 0,
          parseFloat(s.borderLeftWidth) || 0,
        ),
        boxShadow: s.boxShadow || 'none',
        fontSize: parseFloat(s.fontSize),
        fontWeight: Number(s.fontWeight) || 400,
      }
    },
    textBox: (node) => {
      const range = win.document.createRange()
      range.selectNodeContents(node)
      const r = range.getBoundingClientRect()
      return r.width || r.height ? toBox(r) : null
    },
  }
}
