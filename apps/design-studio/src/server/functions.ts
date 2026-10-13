import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { isDesignError } from './errors'
import type { DesignErrorCode } from './errors'
import { getStudio } from './studio'

const pageRef = z.object({
  kind: z.enum(['component', 'screen']),
  name: z.string(),
})

export const listPages = createServerFn({ method: 'GET' }).handler(async () =>
  getStudio().project.pages.list(),
)

/** The captured components, for the editor's Add tab. */
export const listComponentReferences = createServerFn({
  method: 'GET',
}).handler(() => getStudio().project.pages.components())

const paletteDraft = z.object({
  inputs: z.record(z.string(), z.object({ lm: z.string(), dm: z.string() })),
  tokens: z.record(z.string(), z.string()),
  overrides: z.record(z.string(), z.string()),
})

export type Failure = {
  ok: false
  error: DesignErrorCode
  message: string
}

/** Turns a DesignProject error into data, so the browser can tell a Conflict from a bad value. */
async function attempt<T>(
  run: () => Promise<T>,
): Promise<({ ok: true } & T) | Failure> {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    if (isDesignError(error))
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
    if (isDesignError(error) && error.code === 'NotFound') return null
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

/** The file behind a page, with the hash a later save is checked against. */
export const getPageSource = createServerFn({ method: 'GET' })
  .validator(pageRef.extend({ variant: z.enum(['reference', 'proposal']) }))
  .handler(({ data }) =>
    getStudio().project.pages.read(
      { kind: data.kind, name: data.name },
      data.variant,
    ),
  )

export const createPageProposal = createServerFn({ method: 'POST' })
  .validator(pageRef)
  .handler(({ data }) =>
    attempt(() => getStudio().project.pages.createProposal(data)),
  )

export const savePageProposal = createServerFn({ method: 'POST' })
  .validator(pageRef.extend({ html: z.string(), baseHash: z.string() }))
  .handler(({ data }) =>
    attempt(() =>
      getStudio().project.pages.saveProposal(
        { kind: data.kind, name: data.name },
        data.html,
        data.baseHash,
      ),
    ),
  )

/** A blank page: an empty proposal (component or screen) to sketch a new design on. */
export const createBlankPage = createServerFn({ method: 'POST' })
  .validator(pageRef)
  .handler(({ data }) =>
    attempt(() => getStudio().project.pages.createBlank(data)),
  )

/** The sketch drawn over a proposal (Excalidraw's JSON) and the hash a later save is checked against. */
export const getSketch = createServerFn({ method: 'GET' })
  .validator(pageRef)
  .handler(({ data }) => getStudio().project.sketch.read(data))

export const saveSketch = createServerFn({ method: 'POST' })
  .validator(pageRef.extend({ json: z.string(), baseHash: z.string() }))
  .handler(({ data }) =>
    attempt(() =>
      getStudio().project.sketch.save(
        { kind: data.kind, name: data.name },
        data.json,
        data.baseHash,
      ),
    ),
  )

export const listSketchRequests = createServerFn({ method: 'GET' })
  .validator(pageRef)
  .handler(({ data }) => getStudio().project.requests.list({ page: data }))

/** Make real: records the request (ids and a PNG) for the selected shapes. */
export const makeReal = createServerFn({ method: 'POST' })
  .validator(pageRef.extend({ shapeIds: z.array(z.string()), png: z.string() }))
  .handler(({ data }) =>
    attempt(async () => ({
      request: await getStudio().project.requests.create({
        page: { kind: data.kind, name: data.name },
        shapeIds: data.shapeIds,
        png: data.png,
      }),
    })),
  )
