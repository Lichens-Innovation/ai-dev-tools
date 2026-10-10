import type { Editor } from 'grapesjs'
import type { TokenInfo } from '#/inspector/trace'

type Kind = 'color' | 'size'

/** The tokens to offer for a field, the ones a designer should reach for first: aliases for colors, the scale for sizes. */
export function orderedTokens(kind: Kind, tokens: TokenInfo[]): TokenInfo[] {
  const rank = (t: TokenInfo) =>
    kind === 'size'
      ? /spac/.test(t.name)
        ? 0
        : t.semantic
          ? 1
          : 2
      : t.semantic
        ? 0
        : 1
  return tokens
    .filter((t) => t.kind === kind)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => t)
}

/**
 * Registers the Style Manager field types `token-color` and `token-size`: a text input whose suggestions are the
 * project's tokens as `var(--x)` first, and any value still accepted. `refresh` re-reads the tokens (the canvas css
 * arrives after the fields are built, and the palette can change them).
 */
export function registerTokenFields(editor: Editor) {
  const lists = new Set<{ kind: Kind; list: HTMLDataListElement }>()
  let tokens: TokenInfo[] = []
  let seq = 0

  const fill = (kind: Kind, list: HTMLDataListElement) => {
    list.replaceChildren(
      ...orderedTokens(kind, tokens).map((t) => {
        const option = document.createElement('option')
        option.value = `var(${t.name})`
        option.label = t.values.light
        return option
      }),
    )
  }

  for (const kind of ['color', 'size'] as const) {
    editor.StyleManager.addType(`token-${kind}`, {
      create({ props, change }) {
        const el = document.createElement('div')
        el.className = 'ds-token-field'
        const input = document.createElement('input')
        const list = document.createElement('datalist')
        list.id = `ds-token-list-${kind}-${++seq}`
        input.setAttribute('list', list.id)
        input.placeholder = String(props.default ?? '')
        input.addEventListener('change', (event) => change({ event }))
        el.append(input, list)
        lists.add({ kind, list })
        fill(kind, list)
        return el
      },
      emit({ updateStyle }, { event }) {
        updateStyle((event.target as HTMLInputElement).value.trim())
      },
      update({ value, el }) {
        const input = el.querySelector('input')
        if (input) input.value = typeof value === 'string' ? value : ''
      },
    })
  }

  return {
    refresh(next: TokenInfo[]) {
      tokens = next
      for (const entry of lists) {
        if (entry.list.isConnected) fill(entry.kind, entry.list)
        else lists.delete(entry)
      }
    },
  }
}

const sizeField = (property: string, label: string) => ({
  type: 'token-size',
  property,
  label,
})
const colorField = (property: string, label: string) => ({
  type: 'token-color',
  property,
  label,
})

export const STYLE_SECTORS = [
  {
    name: 'Typography',
    open: true,
    properties: [
      colorField('color', 'Color'),
      sizeField('font-size', 'Size'),
      {
        type: 'select',
        property: 'font-weight',
        label: 'Weight',
        options: ['400', '500', '600', '700'].map((id) => ({ id })),
      },
      {
        type: 'radio',
        property: 'text-align',
        label: 'Align',
        options: ['left', 'center', 'right'].map((id) => ({ id })),
      },
    ],
  },
  {
    name: 'Background & border',
    open: true,
    properties: [
      colorField('background-color', 'Background'),
      colorField('border-color', 'Border color'),
      sizeField('border-width', 'Border width'),
      sizeField('border-radius', 'Radius'),
    ],
  },
  {
    name: 'Spacing',
    open: true,
    properties: [
      sizeField('padding-top', 'Padding top'),
      sizeField('padding-right', 'Padding right'),
      sizeField('padding-bottom', 'Padding bottom'),
      sizeField('padding-left', 'Padding left'),
      sizeField('margin-top', 'Margin top'),
      sizeField('margin-right', 'Margin right'),
      sizeField('margin-bottom', 'Margin bottom'),
      sizeField('margin-left', 'Margin left'),
      sizeField('gap', 'Gap'),
    ],
  },
  {
    name: 'Size & layout',
    open: false,
    properties: [
      sizeField('width', 'Width'),
      sizeField('height', 'Height'),
      {
        type: 'select',
        property: 'display',
        label: 'Display',
        options: ['block', 'flex', 'grid', 'inline-block', 'none'].map(
          (id) => ({ id }),
        ),
      },
      {
        type: 'select',
        property: 'flex-direction',
        label: 'Direction',
        options: ['row', 'column'].map((id) => ({ id })),
      },
    ],
  },
]

export const BLOCKS = [
  {
    id: 'box',
    label: 'Box',
    content: '<div style="padding:1rem;min-height:3rem"></div>',
  },
  { id: 'heading', label: 'Heading', content: '<h2>Heading</h2>' },
  { id: 'text', label: 'Text', content: '<p>Text</p>' },
  {
    id: 'button',
    label: 'Button',
    content: '<button type="button">Button</button>',
  },
  { id: 'link', label: 'Link', content: '<a href="#">Link</a>' },
  {
    id: 'input',
    label: 'Input',
    content: '<input type="text" placeholder="Text" />',
  },
].map((b) => ({
  ...b,
  category: { id: 'elements', label: 'Elements', order: 1 },
}))

/** The project's captured components come first in the Add tab. */
export const COMPONENTS_CATEGORY = {
  id: 'components',
  label: 'Components',
  order: 0,
  open: true,
}
