import { createServerFn } from '@tanstack/react-start'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  CLAUDE_DIR,
  PLUGINS_DIR,
  MARKETPLACE_JSON,
  parseFrontmatter,
  readJsonSafe,
} from './helpers'

export interface InstalledPlugin {
  key: string
  marketplace: string
  pluginName: string
  version: string
  scope: string
  installedAt: string
}

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

export const getInstalledPlugins = createServerFn({ method: 'GET' }).handler(
  async (): Promise<InstalledPlugin[]> => {
    const data = await readJsonSafe<{
      version: number
      plugins: Record<
        string,
        { scope: string; version: string; installedAt: string }[]
      >
    }>(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))

    if (!data) return []

    return Object.entries(data.plugins).map(([key, installs]) => {
      const install = installs[0]
      const [pluginName, marketplace] = key.split('@')
      return {
        key,
        marketplace: marketplace,
        pluginName: pluginName,
        version: install.version,
        scope: install.scope,
        installedAt: install.installedAt,
      }
    })
  },
)

export const getProjectMarketplace = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MarketplacePluginInfo[]> => {
    const marketplace = await readJsonSafe<{
      name: string
      plugins: { name: string; description?: string; source: string }[]
    }>(MARKETPLACE_JSON)

    if (!marketplace) return []

    const installedData = await readJsonSafe<{
      plugins: Record<string, unknown[]>
    }>(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))
    const installedKeys = new Set(Object.keys(installedData?.plugins ?? {}))
    const marketplaceName = marketplace.name

    const results: MarketplacePluginInfo[] = []

    for (const pluginEntry of marketplace.plugins) {
      const pluginDir = path.join(PLUGINS_DIR, pluginEntry.name)

      const pluginJson = await readJsonSafe<{
        name: string
        version?: string
        description?: string
      }>(path.join(pluginDir, '.claude-plugin', 'plugin.json'))

      const skills: SkillInfo[] = []
      const agents: SkillInfo[] = []

      const skillsDir = path.join(pluginDir, 'skills')
      try {
        const skillDirs = await readdir(skillsDir)
        for (const skillName of skillDirs) {
          const skillMd = await readFile(
            path.join(skillsDir, skillName, 'SKILL.md'),
            'utf-8',
          ).catch(() => null)
          if (!skillMd) continue
          const fm = parseFrontmatter(skillMd)
          skills.push({
            name: fm.name || skillName,
            description: fm.description || '',
          })
        }
      } catch {}

      const agentsDir = path.join(pluginDir, 'agents')
      try {
        const agentDirs = await readdir(agentsDir)
        for (const agentName of agentDirs) {
          const agentMd = await readFile(
            path.join(agentsDir, agentName, 'AGENTS.md'),
            'utf-8',
          ).catch(() => null)
          if (!agentMd) continue
          const fm = parseFrontmatter(agentMd)
          const firstHeading =
            agentMd.match(/^#\s+(.+)/m)?.[1]?.trim() ?? agentName
          agents.push({
            name: fm.name || agentName,
            description: fm.description || firstHeading,
          })
        }
      } catch {}

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
