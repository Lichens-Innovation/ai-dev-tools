import { cp, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/project')

/** A throwaway copy of the fixture project: tests write to it freely. */
export async function tempProject(): Promise<{
  root: string
  cleanup: () => Promise<void>
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'design-studio-'))
  await cp(FIXTURE, root, { recursive: true })
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}
