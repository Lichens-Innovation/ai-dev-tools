import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
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
