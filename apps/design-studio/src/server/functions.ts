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

const refOf = (data: { kind: 'component' | 'screen'; name: string }) => ({
  kind: data.kind,
  name: data.name,
})
const version = z.string().regex(/^[a-z]$/)

/** The file behind a page, with the hash a later save is checked against. */
export const getPageSource = createServerFn({ method: 'GET' })
  .validator(
    pageRef.extend({
      variant: z.enum(['reference', 'proposal']),
      version: version.optional(),
    }),
  )
  .handler(({ data }) =>
    getStudio().project.pages.read(refOf(data), data.variant, data.version),
  )

export const createPageProposal = createServerFn({ method: 'POST' })
  .validator(pageRef)
  .handler(({ data }) =>
    attempt(() => getStudio().project.pages.createProposal(refOf(data))),
  )

/** A token swap from the Inspect tab: the whole page, written against the hash it was read at. */
export const savePageProposal = createServerFn({ method: 'POST' })
  .validator(
    pageRef.extend({
      html: z.string(),
      baseHash: z.string(),
      version: version.optional(),
    }),
  )
  .handler(({ data }) =>
    attempt(() =>
      getStudio().project.pages.saveProposal(
        refOf(data),
        data.html,
        data.baseHash,
        data.version,
      ),
    ),
  )

/** The alternate becomes the proposal (design-loop's target). */
export const promoteVersion = createServerFn({ method: 'POST' })
  .validator(pageRef.extend({ version }))
  .handler(({ data }) =>
    attempt(() => getStudio().project.pages.promote(refOf(data), data.version)),
  )

export const discardVersion = createServerFn({ method: 'POST' })
  .validator(pageRef.extend({ version }))
  .handler(({ data }) =>
    attempt(async () => {
      await getStudio().project.pages.discard(refOf(data), data.version)
      return {}
    }),
  )

/** A blank page: an empty wireframe `main` (component or screen) to draw a new design on. */
export const createBlankPage = createServerFn({ method: 'POST' })
  .validator(pageRef)
  .handler(({ data }) =>
    attempt(() => getStudio().project.pages.createBlank(refOf(data))),
  )

export const getWireframe = createServerFn({ method: 'GET' })
  .validator(pageRef.extend({ wireframe: z.string() }))
  .handler(({ data }) =>
    attempt(() =>
      getStudio().project.wireframes.read(refOf(data), data.wireframe),
    ),
  )

/** Saves a wireframe; `baseHash` null creates it. */
export const saveWireframe = createServerFn({ method: 'POST' })
  .validator(
    pageRef.extend({
      wireframe: z.string(),
      json: z.string(),
      baseHash: z.string().nullable(),
    }),
  )
  .handler(({ data }) =>
    attempt(() =>
      getStudio().project.wireframes.save(
        refOf(data),
        data.wireframe,
        data.json,
        data.baseHash,
      ),
    ),
  )

export const removeWireframe = createServerFn({ method: 'POST' })
  .validator(pageRef.extend({ wireframe: z.string() }))
  .handler(({ data }) =>
    attempt(async () => {
      await getStudio().project.wireframes.remove(refOf(data), data.wireframe)
      return {}
    }),
  )

export const listSketchRequests = createServerFn({ method: 'GET' })
  .validator(pageRef)
  .handler(({ data }) =>
    getStudio().project.requests.list({ page: refOf(data) }),
  )

/** Make real: records the request (ids and a PNG) for the selected shapes, or the whole wireframe. */
export const makeReal = createServerFn({ method: 'POST' })
  .validator(
    pageRef.extend({
      wireframe: z.string(),
      shapeIds: z.array(z.string()),
      png: z.string(),
    }),
  )
  .handler(({ data }) =>
    attempt(async () => ({
      request: await getStudio().project.requests.create({
        page: refOf(data),
        wireframe: data.wireframe,
        shapeIds: data.shapeIds,
        png: data.png,
      }),
    })),
  )
