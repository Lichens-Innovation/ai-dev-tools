import { createServerFn } from '@tanstack/react-start'
import { getCachedMarketplacePlugins, getInstalledPlugins } from '@repo/claude-fs'

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
    const curatedMarketplaces = [
      { name: 'claude-plugins-official', label: 'Anthropic Official' },
      { name: 'astral-sh', label: 'Astral' },
    ]

    const installedPlugins = await getInstalledPlugins()
    const installedKeys = new Set(installedPlugins.map((p) => p.key))

    const results: CuratedPlugin[] = []
    for (const { name: mktName, label } of curatedMarketplaces) {
      const plugins = await getCachedMarketplacePlugins(mktName)
      for (const plugin of plugins) {
        const key = `${plugin.name}@${mktName}`
        results.push({
          name: plugin.name,
          marketplace: mktName,
          marketplaceLabel: label,
          description: plugin.description,
          isInstalled: installedKeys.has(key),
          installCommand: `claude plugin install ${plugin.name}@${mktName}`,
        })
      }
    }
    return results
  },
)
