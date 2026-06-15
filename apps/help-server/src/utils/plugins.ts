import { createServerFn } from '@tanstack/react-start'
import path from 'node:path'
import type { InstalledPlugin } from '@repo/claude-fs'
import {
  getInstalledPlugins as getInstalledPluginsData,
  readJsonSafe,
  readSkillsFromDir,
  readAgentsFromDir,
} from '@repo/claude-fs'
import { PLUGINS_DIR, MARKETPLACE_JSON } from './helpers'

export type { InstalledPlugin }

export interface SkillInfo {
  name: string
  description: string
}

export interface MarketplacePluginInfo {
  name: string
  description: string
  version: string
  skills: SkillInfo[]
  agents: SkillInfo[]
  isInstalled: boolean
  installCommand: string
}

export const getInstalledPlugins = createServerFn({ method: 'GET' }).handler(async (): Promise<InstalledPlugin[]> => {
  return getInstalledPluginsData()
})

export const getProjectMarketplace = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MarketplacePluginInfo[]> => {
    const marketplace = await readJsonSafe<{
      name: string
      plugins: { name: string; description?: string; source: string }[]
    }>(MARKETPLACE_JSON)

    if (!marketplace) return []

    const installedPlugins = await getInstalledPluginsData()
    const installedKeys = new Set(installedPlugins.map((p) => p.key))
    const marketplaceName = marketplace.name

    const results: MarketplacePluginInfo[] = []

    for (const pluginEntry of marketplace.plugins) {
      const pluginDir = path.join(PLUGINS_DIR, pluginEntry.name)

      const pluginJson = await readJsonSafe<{
        name: string
        version?: string
        description?: string
      }>(path.join(pluginDir, '.claude-plugin', 'plugin.json'))

      // Shared readers: skills from `<plugin>/skills/<id>/SKILL.md`, agents from
      // `<plugin>/agents/` (flat `<name>.md` or `<name>/AGENTS.md`).
      const skills: SkillInfo[] = await readSkillsFromDir(path.join(pluginDir, 'skills'))
      const agents: SkillInfo[] = await readAgentsFromDir(path.join(pluginDir, 'agents'))

      const pluginKey = `${pluginEntry.name}@${marketplaceName}`
      results.push({
        name: pluginEntry.name,
        description: pluginEntry.description ?? pluginJson?.description ?? '',
        version: pluginJson?.version ?? '',
        skills,
        agents,
        isInstalled: installedKeys.has(pluginKey),
        installCommand: `claude plugin install ${pluginEntry.name}@${marketplaceName}`,
      })
    }

    return results
  },
)
