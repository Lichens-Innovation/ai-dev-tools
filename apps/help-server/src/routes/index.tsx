import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAllDocsForSearch } from '../utils/docs'
import { setSections } from '../store/search-store'
import { getInstalledPlugins, getProjectMarketplace } from '../utils/plugins'
import { getCuratedPlugins } from '../utils/marketplace'
import { getRules } from '../utils/rules'
import { getClaudeCodeCommands } from '../utils/commands'
import CommandCenter from '../components/tabs/CommandCenter'
import MarketplaceTab from '../components/tabs/MarketplaceTab'
import CuratedTab from '../components/tabs/CuratedTab'
import StatsTab from '../components/tabs/StatsTab'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [sections, installedPlugins, marketplace, rules, curatedPlugins, commands] = await Promise.all([
      getAllDocsForSearch(),
      getInstalledPlugins(),
      getProjectMarketplace(),
      getRules(),
      getCuratedPlugins(),
      getClaudeCodeCommands(),
    ])
    return {
      sections,
      installedPlugins,
      marketplace,
      rules,
      curatedPlugins,
      commands,
    }
  },
  component: Home,
})

type TabId = 'command-center' | 'usage-stats' | 'marketplace' | 'curated'

const TABS: { id: TabId; label: string }[] = [
  { id: 'command-center', label: 'Command Center' },
  { id: 'usage-stats', label: 'Usage Stats' },
  { id: 'marketplace', label: 'Project Marketplace' },
  { id: 'curated', label: 'Curated Tools' },
]

function Home() {
  const { sections, installedPlugins, marketplace, rules, curatedPlugins, commands } = Route.useLoaderData()
  const [activeTab, setActiveTab] = useState<TabId>('command-center')

  useEffect(() => {
    setSections(sections)
  }, [sections])

  return (
    <main className="page-wrap px-4 pb-20 pt-12">
      <div className="rise-in mx-auto max-w-5xl">
        {/* Hero */}
        <div className="mb-10 text-center">
          <span className="section-label mb-4 inline-block">AI Dev Tools</span>
          <h1 className="display-title mb-3 text-center text-5xl italic leading-[1.1] text-(--ink) sm:text-6xl">
            Command Center
          </h1>
          <p className="text-sm text-subtle">Manage plugins, commands, and marketplace tools.</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-0 border-b border-(--line)">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-[13px] font-medium tracking-[0.04em] transition ${
                activeTab === tab.id
                  ? 'border-b-2 border-primary text-(--ink) -mb-px'
                  : 'text-subtle hover:text-(--ink-2)'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'command-center' && <CommandCenter installedPlugins={installedPlugins} commands={commands} />}
        {activeTab === 'usage-stats' && <StatsTab />}
        {activeTab === 'marketplace' && <MarketplaceTab plugins={marketplace} rules={rules} />}
        {activeTab === 'curated' && <CuratedTab plugins={curatedPlugins} />}
      </div>
    </main>
  )
}
