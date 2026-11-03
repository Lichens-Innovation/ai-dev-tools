// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fitText, generateWireframe } from '../src/wireframe/generate'
import type { Look, Probe } from '../src/wireframe/generate'

/** A probe that reads boxes (`data-box="x,y,w,h"`) and looks (`data-bg`, `data-border`, `data-display`) off the markup. */
const probe: Probe = {
  box: (el) => {
    const [x = 0, y = 0, width = 0, height = 0] = (
      el.getAttribute('data-box') ?? '0,0,720,1000'
    )
      .split(',')
      .map(Number)
    return { x, y, width, height }
  },
  look: (el): Look => ({
    display: el.getAttribute('data-display') ?? 'block',
    visibility: 'visible',
    opacity: 1,
    backgroundColor: el.getAttribute('data-bg') ?? 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    borderWidth: Number(el.getAttribute('data-border') ?? 0),
    boxShadow: 'none',
    fontSize: 16,
    fontWeight: 400,
  }),
  textBox: () => null,
}

const draw = (body: string, maxShapes?: number) => {
  document.body.innerHTML = body
  return generateWireframe(document, probe, {
    width: 720,
    idPrefix: 't',
    ...(maxShapes ? { maxShapes } : {}),
  })
}

describe('generateWireframe', () => {
  it('draws a card with its title, field, button and image, grouped under the card', () => {
    const { skeletons, generated, truncated } = draw(`
      <section id="card" data-box="20,20,320,300" data-bg="#fff" data-border="1">
        <h2 data-box="40,40,200,24">Sign in</h2>
        <input id="email" placeholder="Email" data-box="40,80,280,36" />
        <button id="go" data-box="40,130,120,36" data-bg="#0055ff">Continue</button>
        <img src="x.png" data-box="40,180,280,100" />
      </section>
      <p data-box="20,340,300,20">Need help? <a href="#">Contact us</a></p>
      <div data-display="none" data-box="0,0,10,10">hidden</div>
    `)
    expect(truncated).toBe(false)
    const [card, title, field, button, image, help] = skeletons
    expect(skeletons).toHaveLength(6)
    expect(card).toMatchObject({
      type: 'rectangle',
      x: 20,
      y: 20,
      backgroundColor: '#f1f3f5',
      groupIds: [],
    })
    const group = card.customData.source.group
    expect(group).toBeTruthy()
    expect(card.customData.source.selector).toBe('#card')
    expect(title).toMatchObject({
      type: 'text',
      text: 'Sign in',
      groupIds: [group],
    })
    expect(field).toMatchObject({
      type: 'rectangle',
      label: { text: 'Email', textAlign: 'left' },
    })
    expect(field.customData.source).toMatchObject({
      selector: '#email',
      text: 'Email',
    })
    expect(button).toMatchObject({
      label: { text: 'Continue' },
      backgroundColor: '#a5d8ff',
      fillStyle: 'hachure',
    })
    expect(button.customData.source.origin).toEqual({
      x: 40,
      y: 130,
      width: 120,
      height: 36,
    })
    expect(image).toMatchObject({ fillStyle: 'cross-hatch' })
    // A paragraph with an inline link is one text leaf.
    expect(help).toMatchObject({
      type: 'text',
      text: 'Need help? Contact us',
      groupIds: [],
    })
    expect(generated.map((g) => g.id)).toEqual(skeletons.map((s) => s.id))
    // Clean lines (architect) and the Normal font, never the hand-drawn one.
    for (const s of skeletons) expect(s.roughness).toBe(0)
    expect(title.fontFamily).toBe(6)
    expect(field.label?.fontFamily).toBe(6)
    expect(button.label?.fontFamily).toBe(6)
    expect(card.fontFamily).toBeUndefined()
  })

  it('draws small svgs as icons, a container covering the page as nothing, and stops at maxShapes', () => {
    const icon = draw(
      `<main data-box="0,0,720,1000" data-bg="#fff"><svg data-box="10,10,16,16"></svg></main>`,
    )
    expect(icon.skeletons.map((s) => s.type)).toEqual(['ellipse'])

    const many = draw(
      Array.from(
        { length: 5 },
        (_, i) => `<p data-box="0,${i * 30},200,20">Line ${i}</p>`,
      ).join(''),
      3,
    )
    expect(many.skeletons).toHaveLength(3)
    expect(many.truncated).toBe(true)
  })
})

describe('fitText', () => {
  it('wraps to the box and ellipsises what overflows', () => {
    expect(fitText('one two three', 400, 20, 16)).toBe('one two three')
    // 80px at 16px is 9 characters a line; 60px high is 3 lines.
    expect(fitText('one two three four', 80, 60, 16)).toBe(
      'one two\nthree\nfour',
    )
    expect(fitText('one two three four', 60, 60, 16)).toBe('one\ntwo\nthree…')
  })
})
