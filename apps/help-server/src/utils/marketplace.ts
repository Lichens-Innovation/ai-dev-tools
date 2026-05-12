import { createServerFn } from '@tanstack/react-start'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { CLAUDE_DIR, readJsonSafe } from './helpers'

export interface CuratedPlugin {
  name: string
  marketplace: string
  marketplaceLabel: string
  description: string
  isInstalled: boolean
  installCommand: string
}

export const getCuratedPlugins = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CuratedPlugin[]> => {
    const marketplacesDir = path.join(CLAUDE_DIR, 'plugins', 'marketplaces')
    const installedData = await readJsonSafe<{
      plugins: Record<string, unknown[]>
    }>(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))
    const installedKeys = new Set(Object.keys(installedData?.plugins ?? {}))

    const curatedMarketplaces: { dir: string; name: string; label: string }[] =
      [
        {
          dir: path.join(marketplacesDir, 'claude-plugins-official'),
          name: 'claude-plugins-official',
          label: 'Anthropic Official',
        },
        {
          dir: path.join(marketplacesDir, 'astral-sh'),
          name: 'astral-sh',
          label: 'Astral',
        },
      ]

    const results: CuratedPlugin[] = []

    for (const { dir, name: mktName, label } of curatedMarketplaces) {
      const pluginsDir = path.join(dir, 'plugins')
      try {
        const pluginDirs = await readdir(pluginsDir)
        for (const pluginName of pluginDirs) {
          const pluginJson = await readJsonSafe<{
            name?: string
            description?: string
          }>(path.join(pluginsDir, pluginName, '.claude-plugin', 'plugin.json'))
          if (!pluginJson) continue
          const key = `${pluginName}@${mktName}`
          results.push({
            name: pluginName,
            marketplace: mktName,
            marketplaceLabel: label,
            description: pluginJson.description ?? '',
            isInstalled: installedKeys.has(key),
            installCommand: `claude plugin install ${pluginName}@${mktName}`,
          })
        }
      } catch {}
    }

    return results
  },
)
