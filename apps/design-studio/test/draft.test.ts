import { describe, expect, it } from 'vitest'
import {
  EMPTY_DRAFT,
  countChanges,
  diffInputs,
  diffOverrides,
  diffTokens,
  mergeInputs,
  mergeOverrides,
  mergeTokens,
  parseDraft,
  rebase,
  toPalette,
  validToken,
} from '../src/palette/draft'
import type { Draft, Saved } from '../src/palette/draft'

const saved: Saved = {
  inputs: {
    primary: { lm: '#401f3e', dm: '#8a5585' },
    font: { lm: '#1f1a24', dm: '#eee8f0' },
  },
  tokens: { 'spacing-md': '1rem', 'breakpoint-sm': '640px' },
  overrides: { link: 'info-text' },
  hash: 'a',
}

describe('palette draft', () => {
  it('keeps only what differs from the saved values', () => {
    const inputs = diffInputs(saved, {
      primary: { lm: '#1D4ED8', dm: '#8a5585' },
      font: saved.inputs.font,
    })
    expect(inputs).toEqual({ primary: { lm: '#1d4ed8' } })
    expect(mergeInputs(saved, { ...EMPTY_DRAFT, inputs }).primary).toEqual({
      lm: '#1d4ed8',
      dm: '#8a5585',
    })
    expect(diffInputs(saved, saved.inputs)).toEqual({})
  })

  it('expands short hex, ignores invalid ones, adds and removes inputs', () => {
    const inputs = diffInputs(saved, {
      primary: { lm: '#fff', dm: 'nope' },
      tertiary: { lm: '#123456', dm: '#654321' },
    })
    expect(inputs).toEqual({
      primary: { lm: '#ffffff' },
      font: null,
      tertiary: { lm: '#123456', dm: '#654321' },
    })
    const merged = mergeInputs(saved, { ...EMPTY_DRAFT, inputs })
    expect(Object.keys(merged)).toEqual(['primary', 'tertiary'])
  })

  it('drafts valid token values only, never a breakpoint', () => {
    expect(validToken('1rem')).toBe(true)
    expect(validToken('')).toBe(false)
    expect(validToken('1rem; color: red')).toBe(false)
    const tokens = diffTokens(saved, {
      'spacing-md': ' 2rem ',
      'breakpoint-sm': '10px',
    })
    expect(tokens).toEqual({ 'spacing-md': '2rem' })
    expect(diffTokens(saved, { 'spacing-md': '{' })).toEqual({})
    expect(mergeTokens(saved, { ...EMPTY_DRAFT, tokens })).toEqual({
      'spacing-md': '2rem',
      'breakpoint-sm': '640px',
    })
  })

  it('drafts overrides, with null going back to the generated reference', () => {
    const overrides = diffOverrides(saved, { 'text-muted': 'text-soft' })
    expect(overrides).toEqual({ link: null, 'text-muted': 'text-soft' })
    expect(mergeOverrides(saved, { ...EMPTY_DRAFT, overrides })).toEqual({
      'text-muted': 'text-soft',
    })
  })

  it('counts one change per mode value, token and override', () => {
    const draft: Draft = {
      inputs: { primary: { lm: '#111111', dm: '#222222' }, font: null },
      tokens: { 'spacing-md': '2rem' },
      overrides: { link: null },
    }
    expect(countChanges(draft)).toBe(5)
    expect(countChanges(EMPTY_DRAFT)).toBe(0)
  })

  it('rebases onto a saved palette that changed, dropping what it already has', () => {
    const draft: Draft = {
      inputs: { primary: { lm: '#1d4ed8' }, font: { dm: '#ffffff' } },
      tokens: { 'spacing-md': '2rem' },
      overrides: {},
    }
    const next: Saved = {
      ...saved,
      inputs: { ...saved.inputs, primary: { lm: '#1d4ed8', dm: '#8a5585' } },
      tokens: { ...saved.tokens, 'spacing-md': '1.5rem' },
      hash: 'b',
    }
    const rebased = rebase(saved, next, draft)
    expect(rebased.inputs).toEqual({ font: { dm: '#ffffff' } })
    expect(rebased.tokens).toEqual({ 'spacing-md': '2rem' })
    expect(toPalette(next, rebased).inputs.primary.lm).toBe('#1d4ed8')
  })

  it('drops a stored draft that is not shaped like one', () => {
    expect(parseDraft(null)).toEqual(EMPTY_DRAFT)
    expect(parseDraft('{oops')).toEqual(EMPTY_DRAFT)
    expect(parseDraft('{"inputs":[]}')).toEqual(EMPTY_DRAFT)
    expect(
      parseDraft('{"inputs":{},"tokens":{"a":"1"},"overrides":{}}').tokens,
    ).toEqual({ a: '1' })
  })
})
