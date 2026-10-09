import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { DesignError } from './errors'
import type { DesignErrorCode } from './errors'
import { getStudio } from './studio'

const pageRef = z.object({
  kind: z.enum(['component', 'screen']),
  name: z.string(),
})

export const listPages = createServerFn({ method: 'GET' }).handler(async () =>
  getStudio().project.pages.list(),
)

export const getPageInfo = createServerFn({ method: 'GET' })
  .validator(pageRef.extend({ variant: z.enum(['reference', 'proposal']) }))
  .handler(async ({ data }) => {
    const { hash } = await getStudio().project.pages.read(
      { kind: data.kind, name: data.name },
      data.variant,
    )
    return { hash }
  })

const paletteDraft = z.object({
  inputs: z.record(z.string(), z.object({ lm: z.string(), dm: z.string() })),
  tokens: z.record(z.string(), z.string()),
  overrides: z.record(z.string(), z.string()),
})

export type PaletteFailure = {
  ok: false
  error: DesignErrorCode
  message: string
}

/** Turns a DesignProject error into data, so the browser can tell a Conflict from a bad value. */
async function attempt<T>(
  run: () => Promise<T>,
): Promise<({ ok: true } & T) | PaletteFailure> {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    if (error instanceof DesignError)
      return { ok: false, error: error.code, message: error.message }
    throw error
  }
}

/** The palette as saved, and its preview. Null when the project has no palette. */
async function readPalette() {
  const { project } = getStudio()
  try {
    const state = await project.palette.read()
    const preview = await project.palette.preview(state)
    return { state, preview }
  } catch (error) {
    if (error instanceof DesignError && error.code === 'NotFound') return null
    throw error
  }
}

export const getShell = createServerFn({ method: 'GET' }).handler(async () => ({
  root: getStudio().project.root,
  pages: await getStudio().project.pages.list(),
  palette: await readPalette(),
}))

export const getPalette = createServerFn({ method: 'GET' }).handler(() =>
  readPalette(),
)

export const previewPalette = createServerFn({ method: 'POST' })
  .validator(paletteDraft)
  .handler(({ data }) =>
    attempt(async () => ({
      preview: await getStudio().project.palette.preview(data),
    })),
  )

export const savePalette = createServerFn({ method: 'POST' })
  .validator(z.object({ draft: paletteDraft, baseHash: z.string() }))
  .handler(({ data }) =>
    attempt(() => getStudio().project.palette.save(data.draft, data.baseHash)),
  )
