import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderFile } from '../src/server/render'
import { FIXTURE } from './helpers'

const designDir = path.join(FIXTURE, 'design')

describe('renderFile', () => {
  it('serves a page with scripts disabled', async () => {
    const res = await renderFile(designDir, 'components/button.html')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toMatch(/^text\/html/)
    expect(res.headers.get('Content-Security-Policy')).toContain(
      "script-src 'none'",
    )
  })

  it('serves assets with their type', async () => {
    const res = await renderFile(designDir, 'assets/project.css')
    expect(res.headers.get('Content-Type')).toMatch(/^text\/css/)
  })

  it.each([
    '../design.manifest.json',
    '..%2fdesign.manifest.json',
    '.gitkeep',
    'proposals/.gitkeep',
    'index.json/../../design.manifest.json',
  ])('refuses %s', async (splat) => {
    expect((await renderFile(designDir, splat)).status).toBe(404)
  })
})
