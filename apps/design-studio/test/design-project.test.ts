import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject } from '../src/server/design-project'
import type { DesignEvent, DesignProject } from '../src/server/design-project'
import { FIXTURE, tempProject } from './helpers'

const run = promisify(execFile)

let root: string
let cleanup: () => Promise<void>
let project: DesignProject

beforeEach(async () => {
  ;({ root, cleanup } = await tempProject())
  project = openProject(root)
})

afterEach(async () => {
  await project.close()
  await cleanup()
})

const button = { kind: 'component', name: 'button' } as const
const home = { kind: 'screen', name: 'home' } as const
const text = (file: string) => readFile(path.join(root, file), 'utf8')

describe('pages: list and read', () => {
  it('lists reference pages with their proposal state', async () => {
    const pages = await project.pages.list()
    expect(pages.map((p) => [p.kind, p.name, p.hasProposal])).toEqual([
      ['component', 'button', false],
      ['screen', 'home', false],
    ])
    expect(pages[0]?.referenceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(pages[0]?.proposalHash).toBeNull()
  })

  it('reads a reference and rejects a missing proposal', async () => {
    const { html, hash } = await project.pages.read(button, 'reference')
    expect(html).toContain('../assets/project.css')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    await expect(project.pages.read(button, 'proposal')).rejects.toMatchObject({
      code: 'NotFound',
    })
    await expect(
      project.pages.read({ kind: 'component', name: 'nope' }, 'reference'),
    ).rejects.toMatchObject({
      code: 'NotFound',
    })
  })
})

describe('pages: proposals', () => {
  it('creates a proposal as a copy of the reference, once', async () => {
    const { hash } = await project.pages.createProposal(button)
    expect(await text('design/proposals/button.html')).toBe(
      await text('design/components/button.html'),
    )
    expect((await project.pages.read(button, 'proposal')).hash).toBe(hash)
    await expect(project.pages.createProposal(button)).rejects.toMatchObject({
      code: 'Conflict',
    })
    expect((await project.pages.list())[0]).toMatchObject({
      hasProposal: true,
      proposalHash: hash,
    })
  })

  it('rebases asset links of a screen proposal one directory deeper', async () => {
    await project.pages.createProposal(home)
    const html = await text('design/proposals/screens/home.html')
    expect(html).toContain('../../assets/project.css')
    expect(html).not.toContain('"../assets/')
  })

  it('saves a proposal against the current hash', async () => {
    const created = await project.pages.createProposal(button)
    const html = (await text('design/proposals/button.html')).replace(
      'Save',
      'Save changes',
    )
    const saved = await project.pages.saveProposal(button, html, created.hash)
    expect(saved.hash).not.toBe(created.hash)
    expect(await text('design/proposals/button.html')).toBe(html)
  })

  it('fails with Conflict on a stale baseHash and keeps the file', async () => {
    const created = await project.pages.createProposal(button)
    const first = (await text('design/proposals/button.html')).replace(
      'Save',
      'One',
    )
    await project.pages.saveProposal(button, first, created.hash)
    await expect(
      project.pages.saveProposal(button, '<p>two</p>', created.hash),
    ).rejects.toMatchObject({
      code: 'Conflict',
    })
    expect(await text('design/proposals/button.html')).toBe(first)
  })

  it('never writes a reference, and saving without a proposal is NotFound', async () => {
    const before = await text('design/components/button.html')
    await expect(
      project.pages.saveProposal(button, '<p>x</p>', 'abc'),
    ).rejects.toMatchObject({ code: 'NotFound' })
    await project.pages.createProposal(button)
    const current = await project.pages.read(button, 'proposal')
    await project.pages.saveProposal(button, current.html + '\n', current.hash)
    expect(await text('design/components/button.html')).toBe(before)
  })

  it.each([
    '../components/button',
    'proposals/button',
    'button.html',
    '..',
    'Button',
    'a/b',
    '',
  ])('rejects the path-like name %j', async (name) => {
    const ref = { kind: 'component' as const, name }
    await expect(project.pages.read(ref, 'reference')).rejects.toMatchObject({
      code: 'Invalid',
    })
    await expect(project.pages.createProposal(ref)).rejects.toMatchObject({
      code: 'Invalid',
    })
    await expect(
      project.pages.saveProposal(ref, '<p/>', 'x'),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })

  it.each([
    '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
    '<link rel="stylesheet" href="../../secrets.css">',
    '<img src="/etc/passwd">',
    '<img src="../components/button.html">',
    '<style>@import "../x.css"; body { background: url(../../x.png) }</style>',
    '<img srcset="../assets/a.png 1x, http://evil/b.png 2x">',
  ])('rejects HTML loading outside design/assets: %s', async (snippet) => {
    const { hash } = await project.pages.createProposal(button)
    const before = await text('design/proposals/button.html')
    await expect(
      project.pages.saveProposal(button, `<html>${snippet}</html>`, hash),
    ).rejects.toMatchObject({
      code: 'Invalid',
    })
    expect(await text('design/proposals/button.html')).toBe(before)
  })

  it('accepts assets, data URIs and fragments', async () => {
    const { hash } = await project.pages.createProposal(button)
    const html =
      '<link rel="stylesheet" href="../assets/project.css"><img src="../assets/a1b2.png"><img src="data:image/png;base64,AAAA"><a href="#top">top</a><style>.x{background:url(../assets/f.woff2)}</style>'
    await expect(
      project.pages.saveProposal(button, html, hash),
    ).resolves.toBeDefined()
  })
})

describe('palette', () => {
  it('ships the plugin palette.ts byte for byte in the fixture', async () => {
    const plugin = path.resolve(
      FIXTURE,
      '../../../../../plugins/design/skills/design-palette/scripts/palette.ts',
    )
    expect(
      await readFile(path.join(FIXTURE, 'theme/scripts/palette.ts'), 'utf8'),
    ).toBe(await readFile(plugin, 'utf8'))
  })

  it('reads inputs, tokens, namespace and audit', async () => {
    const state = await project.palette.read()
    expect(state.inputs.primary).toEqual({ lm: '#401f3e', dm: '#8a5585' })
    expect(state.tokens['spacing-md']).toBe('1rem')
    expect(state.namespace).toBe('demo')
    expect(state.overrides).toEqual({})
    expect(state.audit.length).toBeGreaterThan(0)
    expect(state.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('writes outputs identical to running palette.ts on the same inputs', async () => {
    const state = await project.palette.read()
    const draft = {
      inputs: { ...state.inputs, primary: { lm: '#1d4ed8', dm: '#93b4ff' } },
      tokens: { ...state.tokens, 'spacing-md': '1.25rem' },
      overrides: { link: 'info-text' },
    }
    const { written, audit } = await project.palette.save(draft, state.hash)
    expect(written).toEqual([
      'theme/theme.inputs.css',
      'theme/generated/theme.css',
      'theme/generated/scheme.css',
      'theme/generated/tailwind.css',
      'theme/generated/palette.json',
    ])
    expect(audit.length).toBeGreaterThan(0)

    // The same inputs file, run through the project's own script from a second copy of the project.
    const other = await tempProject()
    try {
      await writeFile(
        path.join(other.root, 'theme/theme.inputs.css'),
        await text('theme/theme.inputs.css'),
      )
      await run(
        'node',
        [
          'theme/scripts/palette.ts',
          'theme/theme.inputs.css',
          '--theme',
          'theme/generated/theme.css',
          '--scheme',
          'theme/generated/scheme.css',
          '--mobile',
          'theme/generated/tailwind.css',
          '--json',
          'theme/generated/palette.json',
          '--namespace',
          'demo',
        ],
        { cwd: other.root },
      )
      for (const file of written.filter((f) => f.includes('generated/'))) {
        expect(await text(file), file).toBe(
          await readFile(path.join(other.root, file), 'utf8'),
        )
      }
    } finally {
      await other.cleanup()
    }

    const after = await project.palette.read()
    expect(after.inputs.primary).toEqual({ lm: '#1d4ed8', dm: '#93b4ff' })
    expect(after.tokens['spacing-md']).toBe('1.25rem')
    expect(after.overrides).toEqual({ link: 'info-text' })
  })

  it('fails with Conflict on a stale hash, Invalid on bad values', async () => {
    const state = await project.palette.read()
    const draft = {
      inputs: state.inputs,
      tokens: state.tokens,
      overrides: state.overrides,
    }
    await expect(project.palette.save(draft, 'stale')).rejects.toMatchObject({
      code: 'Conflict',
    })
    await expect(
      project.palette.save(
        {
          ...draft,
          inputs: { ...state.inputs, primary: { lm: 'red', dm: '#fff' } },
        },
        state.hash,
      ),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await expect(
      project.palette.save(
        { ...draft, tokens: { 'spacing-md': '1rem; color: red' } },
        state.hash,
      ),
    ).rejects.toMatchObject({ code: 'Invalid' })
    await expect(
      project.palette.save(
        { ...draft, overrides: { primary: 'info' } },
        state.hash,
      ),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })
})

describe('palette preview', () => {
  it('computes the theme, resolved tokens and references of a draft without writing', async () => {
    const state = await project.palette.read()
    const before = state.hash
    const draft = {
      inputs: { ...state.inputs, primary: { lm: '#1d4ed8', dm: '#93b4ff' } },
      tokens: { ...state.tokens, 'spacing-md': '1.25rem' },
      overrides: { link: 'info-text' },
    }
    const preview = await project.palette.preview(draft)
    expect(preview.css).toContain('--primary-lm: #1d4ed8;')
    expect(preview.css).toContain('--spacing-md: 1.25rem;')
    expect(preview.css).toContain('light-dark(')
    expect(preview.brand).toEqual(['primary', 'secondary'])
    expect(preview.status).toEqual(['info', 'danger', 'success', 'warning'])
    expect(preview.refs.light.link).toBe('info-text')
    expect(preview.autoRefs.light.link).toBe('primary-text')
    expect(preview.refs.light['bg-hover']).toBe('bg-faint')
    expect(preview.overridable).toContain('link')
    expect(preview.tokens.find((t) => t.name === 'primary')).toMatchObject({
      light: '#1d4ed8',
      dark: '#93b4ff',
    })
    expect(preview.classes?.text.length).toBeGreaterThan(0)
    expect(preview.exports.mobile).toContain('@import "tailwindcss"')
    expect((await project.palette.read()).hash).toBe(before)
  })

  it('ignores overrides the engine refuses and says why', async () => {
    const state = await project.palette.read()
    const preview = await project.palette.preview({
      inputs: state.inputs,
      tokens: state.tokens,
      overrides: { primary: 'info' },
    })
    expect(preview.overrideErrors.length).toBeGreaterThan(0)
    expect(preview.refs.light.primary).toBeUndefined()
  })

  it('rejects a draft that is not valid', async () => {
    const state = await project.palette.read()
    await expect(
      project.palette.preview({
        inputs: { ...state.inputs, primary: { lm: 'red', dm: '#fff' } },
        tokens: state.tokens,
        overrides: {},
      }),
    ).rejects.toMatchObject({ code: 'Invalid' })
  })
})

describe('watch', () => {
  it('emits after an external write, once per change', async () => {
    const created = await project.pages.createProposal(button)
    const events: DesignEvent[] = []
    const stop = project.watch((e) => events.push(e))
    await project.watching()

    const html = '<html><body>changed outside</body></html>'
    await writeFile(path.join(root, 'design/proposals/button.html'), html)
    await expect.poll(() => events.length, { timeout: 5000 }).toBe(1)
    expect(events[0]).toMatchObject({
      kind: 'page',
      name: 'button',
      pageKind: 'component',
      variant: 'proposal',
    })
    expect(events[0]?.hash).not.toBe(created.hash)

    await writeFile(
      path.join(root, 'theme/theme.inputs.css'),
      (await text('theme/theme.inputs.css')) + '\n',
    )
    await expect
      .poll(() => events.some((e) => e.kind === 'palette'), { timeout: 5000 })
      .toBe(true)

    stop()
    const count = events.length
    await writeFile(
      path.join(root, 'design/proposals/button.html'),
      '<html>again</html>',
    )
    await new Promise((r) => setTimeout(r, 400))
    expect(events.length).toBe(count)
  })
})
