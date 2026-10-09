import { createHub } from './hub'
import type { Hub } from './hub'
import { openProject } from './design-project'
import type { DesignProject } from './design-project'
import { createSelectionHolder } from './selection'
import type { SelectionHolder } from './selection'

export interface Studio {
  project: DesignProject
  selection: SelectionHolder
  hub: Hub
}

const KEY = Symbol.for('design-studio.studio')

/** The one studio of this process: the project mounted at PROJECT_ROOT (default /project). Survives dev reloads. */
export function getStudio(): Studio {
  const g = globalThis as unknown as Record<symbol, Studio | undefined>
  let studio = g[KEY]
  if (!studio) {
    const project = openProject(process.env.PROJECT_ROOT ?? '/project')
    const hub = createHub()
    project.watch((event) => hub.publish({ type: 'change', event }))
    studio = { project, selection: createSelectionHolder(), hub }
    g[KEY] = studio
  }
  return studio
}
