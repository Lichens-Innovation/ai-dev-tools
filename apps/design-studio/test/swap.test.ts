// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parsePage } from '../src/proposal/page-document'
import { applySwap, setDeclaration } from '../src/proposal/swap'

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="../assets/project.css" />
  </head>
  <body>
    <main><button id="save" class="btn">Save</button><p class="note">Hi</p></main>
  </body>
</html>
`

describe('setDeclaration', () => {
  it('replaces a declaration, adds one to a rule, or adds the rule', () => {
    const css =
      '#a { color: red; padding: 1px; }\n@media (x) { #a { color: blue; } }'
    expect(setDeclaration(css, '#a', 'color', 'var(--ink)')).toBe(
      '#a { padding: 1px; color: var(--ink); }\n@media (x) { #a { color: blue; } }',
    )
    expect(setDeclaration('', '#b', 'gap', 'var(--spacing-2)')).toBe(
      '#b { gap: var(--spacing-2); }',
    )
    expect(() => setDeclaration('', '#b', 'color', 'red; x: y')).toThrow()
  })
})

describe('applySwap', () => {
  it('writes a rule for an element with an id and leaves the body alone', () => {
    const { html, selector } = applySwap(PAGE, {
      selector: '#save',
      property: 'background-color',
      value: 'var(--accent)',
    })
    expect(selector).toBe('#save')
    expect(parsePage(html).studioCss).toMatch(
      /#save \{\n\s+background-color: var\(--accent\);/,
    )
    expect(parsePage(html).body).toBe(parsePage(PAGE).body)
    expect(html).toContain('../assets/project.css')
  })

  it('gives an element without an id one, and the next swap reuses it', () => {
    const first = applySwap(PAGE, {
      selector: 'body > main:nth-of-type(1) > p:nth-of-type(1)',
      property: 'color',
      value: 'var(--muted)',
    })
    expect(first.selector).toMatch(/^#ds-[0-9a-f]{6}$/)
    expect(first.html).toContain(
      `<p class="note" id="${first.selector.slice(1)}">`,
    )
    const second = applySwap(first.html, {
      selector: first.selector,
      property: 'color',
      value: 'var(--ink)',
    })
    expect(second.selector).toBe(first.selector)
    const css = parsePage(second.html).studioCss
    expect(css).toContain('var(--ink)')
    expect(css).not.toContain('var(--muted)')
  })

  it('refuses an element that is not in the page any more', () => {
    expect(() =>
      applySwap(PAGE, { selector: '#gone', property: 'color', value: 'red' }),
    ).toThrow(/no longer in the page/)
  })
})
