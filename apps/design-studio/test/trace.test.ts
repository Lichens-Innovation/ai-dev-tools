// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  excerptOf,
  flagLabel,
  listTokens,
  selectorFor,
  specificityOf,
  traceTokens,
} from '../src/inspector/trace'

/** Loads the css and body into jsdom's own document (a detached document has no style sheets). */
function page(css: string, body: string): Document {
  document.head.innerHTML = ''
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  document.body.innerHTML = body
  return document
}

const row = (rows: ReturnType<typeof traceTokens>, property: string) =>
  rows.find((r) => r.property === property)

describe('specificityOf', () => {
  it('counts ids, classes and types', () => {
    expect(specificityOf('#a .b c')).toEqual([1, 1, 1])
    expect(specificityOf('button.primary[disabled]:hover')).toEqual([0, 3, 1])
    expect(specificityOf(':where(.a) .b')).toEqual([0, 1, 0])
    expect(specificityOf(':not(#a, .b)')).toEqual([1, 0, 0])
    expect(specificityOf(String.raw`.noa\:bg-primary`)).toEqual([0, 1, 0])
  })
})

describe('traceTokens', () => {
  const tokens = `
    :root { --blue-base: #1d4ed8; --primary: var(--blue-base); --bg: #ffffff; --spacing-md: 1rem; --radius-md: 0.5rem; }
    [data-theme='dark'] { --blue-base: #60a5fa; --bg: #111111; }
  `

  it('keeps the winner of the cascade: specificity, then order, inline last', () => {
    const doc = page(
      `${tokens}
       button { background-color: var(--bg); }
       .btn { background-color: var(--primary); }
       .btn { color: var(--bg); }
       button.btn { color: var(--primary); }
       .later { color: var(--bg); }`,
      '<button class="btn later">Go</button>',
    )
    const el = doc.querySelector('button')!
    const rows = traceTokens(el)
    // .btn (0,1,0) beats button (0,0,1)
    expect(row(rows, 'background-color')?.token).toBe('--primary')
    // button.btn (0,1,1) beats .later (0,1,0) even though .later comes last
    expect(row(rows, 'color')?.token).toBe('--primary')

    // an equal specificity goes to the later rule
    doc.head.querySelector('style')!.textContent +=
      ' .btn { color: var(--spacing-md); }'
    expect(row(traceTokens(el), 'color')?.token).toBe('--primary') // button.btn still wins

    // the inline style comes last of all
    el.setAttribute('style', 'background-color: var(--bg)')
    const inline = row(traceTokens(el), 'background-color')
    expect(inline?.token).toBe('--bg')
    expect(inline?.source).toBe('style attribute')
  })

  it('lets !important beat a more specific rule', () => {
    const doc = page(
      `${tokens} .a { color: #ffffff !important; } #x { color: var(--primary); }`,
      '<p id="x" class="a">t</p>',
    )
    // (jsdom drops !important from a var() value, so the important rule holds a raw value)
    const color = row(traceTokens(doc.querySelector('p')!), 'color')
    expect(color?.token).toBeNull()
    expect(color?.flag).toEqual({ kind: 'literal', token: '--bg' })
  })

  it('follows a var() chain through :root and [data-theme], per mode', () => {
    const doc = page(
      `${tokens} .btn { background-color: var(--primary); }`,
      '<button class="btn">Go</button>',
    )
    const r = row(
      traceTokens(doc.querySelector('button')!),
      'background-color',
    )!
    expect(r.token).toBe('--primary')
    expect(r.chain.light).toEqual(['--primary', '--blue-base'])
    expect(r.chain.dark).toEqual(['--primary', '--blue-base'])
    expect(r.resolved).toEqual({ light: '#1d4ed8', dark: '#60a5fa' })
    expect(r.source).toBe('btn')
    expect(r.flag).toBeNull()
  })

  it('uses a var() fallback for an undefined token, and nested calls', () => {
    const doc = page(
      `${tokens} .p { padding: var(--missing, var(--spacing-md)); border-radius: calc(var(--radius-md) * 2); }`,
      '<div class="p"></div>',
    )
    const rows = traceTokens(doc.querySelector('div')!)
    expect(row(rows, 'padding')?.resolved.light).toBe('1rem')
    expect(row(rows, 'border-radius')?.resolved.light).toBe('calc(0.5rem * 2)')
    expect(row(rows, 'border-radius')?.token).toBe('--radius-md')
  })

  it('names the namespaced Tailwind class as the source', () => {
    const doc = page(
      `${tokens}
       :root { --color-noa-primary: var(--primary); }
       .bg-noa-primary { background-color: var(--color-noa-primary); }
       .hover\\:bg-noa-primary:hover { background-color: var(--bg); }`,
      '<button class="bg-noa-primary hover:bg-noa-primary">Go</button>',
    )
    const r = row(
      traceTokens(doc.querySelector('button')!),
      'background-color',
    )!
    expect(r.source).toBe('bg-noa-primary')
    expect(r.chain.light).toEqual([
      '--color-noa-primary',
      '--primary',
      '--blue-base',
    ])
    expect(r.resolved.dark).toBe('#60a5fa')
  })

  it('applies the padding shorthand and its longhands to one cascade', () => {
    const doc = page(
      `${tokens} .p { padding: var(--spacing-md); } .p { padding-top: 0.3rem; }`,
      '<div class="p"></div>',
    )
    const rows = traceTokens(doc.querySelector('div')!)
    expect(row(rows, 'padding')?.token).toBe('--spacing-md')
  })

  it('flags a raw value equal to a token as literal and any other as off-token', () => {
    const doc = page(
      `${tokens} .a { color: #FFF; border-radius: .5rem; padding: 0.37rem; margin: 0; }`,
      '<div class="a"></div>',
    )
    const rows = traceTokens(doc.querySelector('div')!)
    const color = row(rows, 'color')!
    expect(color.token).toBeNull()
    expect(color.flag).toEqual({ kind: 'literal', token: '--bg' })
    expect(flagLabel(color.flag!)).toBe('literal, matches --bg')
    expect(row(rows, 'border-radius')?.flag).toEqual({
      kind: 'literal',
      token: '--radius-md',
    })
    expect(row(rows, 'padding')?.flag).toEqual({ kind: 'off-token' })
    expect(flagLabel(row(rows, 'padding')!.flag!)).toBe('off-token')
    // zero is not worth a token
    expect(row(rows, 'margin')).toBeUndefined()
  })

  it('ignores rules that do not match and properties that are not tokens', () => {
    const doc = page(
      `${tokens} .b { color: var(--bg); } .a { display: block; font-weight: 700; }`,
      '<div class="a"></div>',
    )
    expect(traceTokens(doc.querySelector('div')!)).toEqual([])
  })
})

describe('listTokens', () => {
  it('lists the aliases first, with kind and values per mode', () => {
    const doc = page(
      `:root { --blue-base: #1d4ed8; --primary: var(--blue-base); --spacing-md: 1rem; --font: Inter; }
       [data-theme='dark'] { --blue-base: #60a5fa; }`,
      '',
    )
    const tokens = listTokens(doc)
    expect(tokens[0]).toMatchObject({
      name: '--primary',
      kind: 'color',
      semantic: true,
      values: { light: '#1d4ed8', dark: '#60a5fa' },
    })
    expect(tokens.find((t) => t.name === '--spacing-md')?.kind).toBe('size')
    expect(tokens.find((t) => t.name === '--font')?.kind).toBe('other')
  })
})

describe('selectorFor', () => {
  it('finds the element again, by id when it has a meaningful one', () => {
    const doc = page(
      '',
      '<main><p>a</p><p>b</p><button id="save">x</button></main>',
    )
    for (const el of [
      doc.querySelectorAll('p')[1],
      doc.querySelector('button')!,
      doc.querySelector('main')!,
    ]) {
      expect(doc.querySelector(selectorFor(el))).toBe(el)
    }
    expect(selectorFor(doc.querySelector('button')!)).toBe('#save')
    expect(selectorFor(doc.querySelectorAll('p')[1])).toBe(
      'body > main > p:nth-of-type(2)',
    )
  })

  it('cuts long markup', () => {
    const doc = page('', `<p>${'x'.repeat(2000)}</p>`)
    expect(excerptOf(doc.querySelector('p')!.outerHTML).length).toBeLessThan(
      700,
    )
  })
})
