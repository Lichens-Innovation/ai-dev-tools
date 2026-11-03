import { describe, expect, it } from 'vitest'
import {
  colorEditFor,
  propertyKind,
  swapCandidates,
  swapToken,
} from '../src/inspector/inspect'
import type { PaletteShape } from '../src/inspector/inspect'
import type { TokenInfo } from '../src/inspector/trace'

const token = (
  name: string,
  kind: TokenInfo['kind'],
  light: string,
  dark = light,
  semantic = false,
): TokenInfo => ({ name, kind, semantic, values: { light, dark } })

const tokens: TokenInfo[] = [
  token('--primary', 'color', '#401f3e', '#8a5585', true),
  token('--bg', 'color', '#fbfaf8', '#17131a', true),
  token('--primary-light', 'color', '#401f3e'),
  token('--spacing-sm', 'size', '0.5rem'),
  token('--spacing-md', 'size', '1rem'),
  token('--radius-sm', 'size', '0.25rem'),
  token('--radius-md', 'size', '0.5rem'),
  token('--text-lg', 'size', '1.25rem'),
  token('--breakpoint-sm', 'size', '640px'),
  token('--font-sans', 'other', 'ui-sans-serif, system-ui'),
  token('--font-inverted', 'color', '#fbfaf8', '#17131a'),
]

const names = (property: string, value = '', query = '') =>
  swapCandidates(
    { property, resolved: { light: value, dark: value } },
    tokens,
    query,
  ).map((t) => t.name)

describe('propertyKind', () => {
  it('tells the kind of token a property takes', () => {
    expect(propertyKind('background-color')).toBe('color')
    expect(propertyKind('border-top-color')).toBe('color')
    expect(propertyKind('padding-left')).toBe('spacing')
    expect(propertyKind('row-gap')).toBe('spacing')
    expect(propertyKind('border-top-left-radius')).toBe('radius')
    expect(propertyKind('font-size')).toBe('font-size')
    expect(propertyKind('box-shadow', '#000000')).toBe('color')
    expect(propertyKind('box-shadow', '0 1px 2px')).toBe('other')
  })
})

describe('swapCandidates', () => {
  it('offers only colors for a color property', () => {
    expect(names('background-color')).toEqual([
      '--primary',
      '--bg',
      '--primary-light',
      '--font-inverted',
    ])
  })
  it('offers the spacing scale for padding, margin and gap', () => {
    for (const property of ['padding', 'margin-top', 'gap'])
      expect(names(property)).toEqual(['--spacing-sm', '--spacing-md'])
  })
  it('offers radii for border-radius and type sizes for font-size', () => {
    expect(names('border-radius')).toEqual(['--radius-sm', '--radius-md'])
    expect(names('font-size')).toEqual(['--text-lg'])
  })
  it('offers font families (not the font color) for font-family', () => {
    expect(names('font-family')).toEqual(['--font-sans'])
  })
  it('offers nothing for a property without a token kind', () => {
    expect(names('box-shadow', '0 1px 2px')).toEqual([])
  })
  it('falls back to the unclaimed size tokens when the scale is not named spacing', () => {
    const plain = [
      token('--gap-1', 'size', '4px'),
      token('--gap-2', 'size', '8px'),
      token('--radius-md', 'size', '8px'),
      token('--breakpoint-sm', 'size', '640px'),
    ]
    const row = { property: 'padding', resolved: { light: '', dark: '' } }
    expect(swapCandidates(row, plain).map((t) => t.name)).toEqual([
      '--gap-1',
      '--gap-2',
    ])
  })
  it('filters by name or by value, in either mode', () => {
    expect(names('background-color', '', 'prim')).toEqual([
      '--primary',
      '--primary-light',
    ])
    expect(names('background-color', '', '17131A')).toEqual([
      '--bg',
      '--font-inverted',
    ])
    expect(names('padding', '', '1rem')).toEqual(['--spacing-md'])
  })
})

describe('swapToken', () => {
  it('reads the first var() from another token', () => {
    expect(swapToken('var(--primary)', '--bg')).toBe('var(--bg)')
    expect(swapToken('1px solid var( --border )', '--primary')).toBe(
      '1px solid var(--primary )',
    )
  })
})

const shape: PaletteShape = {
  inputs: ['primary', 'font', 'background'],
  tokens: [
    'primary',
    'primary-faint',
    'primary-strong',
    'primary-text',
    'link',
    'font',
    'text',
    'bg',
    'bg-faint',
  ],
  refs: {
    light: {
      link: 'primary-text',
      'primary-text': 'primary-strong',
      text: 'font',
    },
    dark: { link: 'primary-text', 'primary-text': 'primary', text: 'font' },
  },
  families: ['primary'],
}

describe('colorEditFor', () => {
  it('edits the input at the end of the chain, per mode', () => {
    expect(
      colorEditFor(['--primary', '--primary-light'], 'light', shape),
    ).toMatchObject({ kind: 'input', input: 'primary' })
    expect(
      colorEditFor(['--primary', '--primary-dark'], 'dark', shape),
    ).toMatchObject({ kind: 'input', input: 'primary' })
  })
  it('counts the tokens that follow the input', () => {
    // primary-faint, primary-strong, primary-text and link (light: via primary-strong, a step of primary)
    const edit = colorEditFor(['--primary'], 'light', shape)
    expect(edit).toEqual({ kind: 'input', input: 'primary', usedBy: 4 })
    // font is read by text only
    expect(colorEditFor(['--font'], 'light', shape)).toEqual({
      kind: 'input',
      input: 'font',
      usedBy: 1,
    })
  })
  it('follows a semantic token the chain stops at to the token that holds the value', () => {
    // light: link -> primary-text -> primary-strong (a step: derived); dark: -> primary (the input)
    expect(colorEditFor(['--link'], 'light', shape)).toEqual({
      kind: 'derived',
      token: 'primary-strong',
      base: 'primary',
    })
    expect(colorEditFor(['--link'], 'dark', shape)).toMatchObject({
      kind: 'input',
      input: 'primary',
    })
  })
  it('does not edit a step derived from a base', () => {
    expect(
      colorEditFor(
        ['--primary-strong', '--primary-strong-light'],
        'light',
        shape,
      ),
    ).toEqual({
      kind: 'derived',
      token: 'primary-strong',
      base: 'primary',
    })
    expect(colorEditFor(['--bg-faint'], 'light', shape)).toEqual({
      kind: 'derived',
      token: 'bg-faint',
      base: null,
    })
  })
  it('edits the input behind a neutral that carries its value', () => {
    expect(colorEditFor(['--bg'], 'light', shape)).toMatchObject({
      kind: 'input',
      input: 'background',
    })
  })
  it('does not edit what is not in the palette', () => {
    expect(colorEditFor(['--blue-base'], 'light', shape)).toEqual({
      kind: 'none',
    })
    expect(colorEditFor([], 'light', shape)).toEqual({ kind: 'none' })
  })
})
