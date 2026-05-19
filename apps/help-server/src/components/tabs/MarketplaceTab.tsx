import type { MarketplacePluginInfo } from '../../utils/plugins'
import type { RuleInfo } from '../../utils/rules'
import CopyableText from '../CopyableText'

interface MarketplaceTabProps {
  plugins: MarketplacePluginInfo[]
  rules: RuleInfo[]
}

function InstalledDot({ installed }: { installed: boolean }) {
  return installed ? (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-(--green-dim) bg-(--green-dim) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Installed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-(--line) bg-(--bg-3) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
      <span className="h-1.5 w-1.5 rounded-full bg-subtle" />
      Not installed
    </span>
  )
}

function TypeTag({ type }: { type: 'skill' | 'agent' }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${
        type === 'skill' ? 'border-ring text-primary bg-(--amber-dim)' : 'border-(--line) text-subtle bg-(--bg-3)'
      }`}
    >
      {type}
    </span>
  )
}

function PluginCard({ plugin }: { plugin: MarketplacePluginInfo }) {
  const hasContent = plugin.skills.length > 0 || plugin.agents.length > 0

  return (
    <div>
      {/* Plugin header */}
      <div className="flex flex-col gap-3 border-b border-(--line) bg-(--bg-3) px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-medium text-(--ink)">{plugin.name}</span>
            {plugin.version && <span className="font-mono text-[12px] text-subtle">v{plugin.version}</span>}
            <InstalledDot installed={plugin.isInstalled} />
          </div>
          {plugin.description && <p className="mt-1.5 text-[13px] text-(--ink-2)">{plugin.description}</p>}
        </div>
        {!plugin.isInstalled && (
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-(--line) bg-(--bg-3) px-3 py-1.5 shadow-(--shadow-1)">
            <CopyableText text={plugin.installCommand}>
              <code className="font-mono text-[12px] text-(--ink-2)">{plugin.installCommand}</code>
            </CopyableText>
          </div>
        )}
      </div>

      {/* Skills / agents table */}
      {hasContent ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-(--bg-3)">
              <th className="border-b border-(--line) px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-(--ink-2)">
                Name
              </th>
              <th className="border-b border-(--line) px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-(--ink-2)">
                Type
              </th>
              <th className="border-b border-(--line) px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-(--ink-2)">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {plugin.skills.map((skill) => (
              <tr
                key={`skill-${skill.name}`}
                className="border-b border-(--line) last:border-0 hover:bg-(--bg-3) transition-colors"
              >
                <td className="px-4 py-2 align-top">
                  <span className="inline-block rounded-md border border-ring bg-(--amber-dim) px-2 py-0.5 font-mono text-[12px] text-primary">
                    {skill.name}
                  </span>
                </td>
                <td className="px-4 py-2 align-top">
                  <TypeTag type="skill" />
                </td>
                <td className="px-4 py-2 text-[13px] text-(--ink-2)">{skill.description}</td>
              </tr>
            ))}
            {plugin.agents.map((agent) => (
              <tr
                key={`agent-${agent.name}`}
                className="border-b border-(--line) last:border-0 hover:bg-(--bg-3) transition-colors"
              >
                <td className="px-4 py-2 align-top">
                  <span className="inline-block rounded-md border border-(--line) bg-(--bg-3) px-2 py-0.5 font-mono text-[12px] text-(--ink-2)">
                    {agent.name}
                  </span>
                </td>
                <td className="px-4 py-2 align-top">
                  <TypeTag type="agent" />
                </td>
                <td className="px-4 py-2 text-[13px] text-(--ink-2)">{agent.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-5 py-3 text-[12px] text-subtle">No skills or agents found.</p>
      )}
    </div>
  )
}

export default function MarketplaceTab({ plugins, rules }: MarketplaceTabProps) {
  return (
    <div className="space-y-10">
      {/* Plugins */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="section-label">Project Marketplace</span>
          <span className="rounded-full bg-(--bg-3) px-2.5 py-0.5 text-[12px] font-medium text-subtle">
            {plugins.length} plugins
          </span>
        </div>
        {plugins.length === 0 ? (
          <p className="text-[13px] text-subtle">No marketplace found at project root.</p>
        ) : (
          <div className="space-y-4">
            {plugins.map((plugin) => (
              <div key={plugin.name} className="overflow-hidden rounded-lg border border-(--line) shadow-(--shadow-1)">
                <PluginCard plugin={plugin} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rules */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="section-label">Rules</span>
          <span className="rounded-full bg-(--bg-3) px-2.5 py-0.5 text-[12px] font-medium text-subtle">
            {rules.length}
          </span>
        </div>
        {rules.length === 0 ? (
          <p className="text-[13px] text-subtle">No rules found in rules/ folder.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-(--line) shadow-(--shadow-1)">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-(--bg-3)">
                  <th className="border-b border-(--line) px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-(--ink-2)">
                    Rule
                  </th>
                  <th className="border-b border-(--line) px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-(--ink-2)">
                    File
                  </th>
                  <th className="border-b border-(--line) px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-(--ink-2)">
                    Applies to
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.filename}
                    className="border-b border-(--line) last:border-0 hover:bg-(--bg-3) transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[13px] font-medium text-(--ink)">{rule.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-md border border-(--line) bg-(--bg-3) px-2 py-0.5 font-mono text-[12px] text-(--ink-2)">
                        {rule.filename}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {rule.paths.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {rule.paths.map((p) => (
                            <span
                              key={p}
                              className="inline-block rounded-md border border-(--line) bg-(--bg-3) px-2 py-0.5 font-mono text-[12px] text-subtle"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-subtle">All files</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
