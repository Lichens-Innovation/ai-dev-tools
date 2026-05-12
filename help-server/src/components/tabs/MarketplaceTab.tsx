import { useState } from 'react'
import type { MarketplacePluginInfo } from '../../utils/plugins'
import type { RuleInfo } from '../../utils/rules'

interface MarketplaceTabProps {
  plugins: MarketplacePluginInfo[]
  rules: RuleInfo[]
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)] hover:border-[var(--line-2)] hover:bg-[var(--bg-3)] hover:text-(--ink)"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 8l4 4 6-7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="5"
              y="5"
              width="8"
              height="9"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

function InstalledDot({ installed }: { installed: boolean }) {
  return installed ? (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--green-dim)] bg-[var(--green-dim)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--green)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
      Installed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
      Not installed
    </span>
  )
}

function TypeTag({ type }: { type: 'skill' | 'agent' }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${
        type === 'skill'
          ? 'border-[var(--amber-dim-2)] text-[var(--amber)] bg-[var(--amber-dim)]'
          : 'border-[var(--line)] text-[var(--ink-3)] bg-[var(--bg-3)]'
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
      <div className="flex flex-col gap-3 border-b border-[var(--line)] bg-[var(--bg-2)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-medium text-(--ink)">
              {plugin.name}
            </span>
            {plugin.version && (
              <span className="font-mono text-[12px] text-[var(--ink-3)]">
                v{plugin.version}
              </span>
            )}
            <InstalledDot installed={plugin.isInstalled} />
          </div>
          {plugin.description && (
            <p className="mt-1.5 text-[13px] text-[var(--ink-2)]">
              {plugin.description}
            </p>
          )}
        </div>
        {!plugin.isInstalled && (
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-3)] px-3 py-1.5 shadow-[var(--shadow-1)]">
            <code className="font-mono text-[12px] text-[var(--ink-2)]">
              {plugin.installCommand}
            </code>
            <CopyButton text={plugin.installCommand} />
          </div>
        )}
      </div>

      {/* Skills / agents table */}
      {hasContent ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[var(--bg-3)]">
              <th className="border-b border-[var(--line)] px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                Name
              </th>
              <th className="border-b border-[var(--line)] px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                Type
              </th>
              <th className="border-b border-[var(--line)] px-4 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {plugin.skills.map((skill) => (
              <tr
                key={`skill-${skill.name}`}
                className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-3)] transition-colors"
              >
                <td className="px-4 py-2 align-top">
                  <span className="inline-block rounded-md border border-[var(--amber-dim-2)] bg-[var(--amber-dim)] px-2 py-0.5 font-mono text-[12px] text-[var(--amber)]">
                    {skill.name}
                  </span>
                </td>
                <td className="px-4 py-2 align-top">
                  <TypeTag type="skill" />
                </td>
                <td className="px-4 py-2 text-[13px] text-[var(--ink-2)]">
                  {skill.description}
                </td>
              </tr>
            ))}
            {plugin.agents.map((agent) => (
              <tr
                key={`agent-${agent.name}`}
                className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-3)] transition-colors"
              >
                <td className="px-4 py-2 align-top">
                  <span className="inline-block rounded-md border border-[var(--line)] bg-[var(--bg-3)] px-2 py-0.5 font-mono text-[12px] text-[var(--ink-2)]">
                    {agent.name}
                  </span>
                </td>
                <td className="px-4 py-2 align-top">
                  <TypeTag type="agent" />
                </td>
                <td className="px-4 py-2 text-[13px] text-[var(--ink-2)]">
                  {agent.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-5 py-3 text-[12px] text-[var(--ink-3)]">
          No skills or agents found.
        </p>
      )}
    </div>
  )
}

export default function MarketplaceTab({
  plugins,
  rules,
}: MarketplaceTabProps) {
  return (
    <div className="space-y-10">
      {/* Plugins */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="section-label">Project Marketplace</span>
          <span className="rounded-full bg-[var(--bg-3)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--ink-3)]">
            {plugins.length} plugins
          </span>
        </div>
        {plugins.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-3)]">
            No marketplace found at project root.
          </p>
        ) : (
          <div className="space-y-4">
            {plugins.map((plugin) => (
              <div
                key={plugin.name}
                className="overflow-hidden rounded-lg border border-[var(--line)] shadow-[var(--shadow-1)]"
              >
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
          <span className="rounded-full bg-[var(--bg-3)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--ink-3)]">
            {rules.length}
          </span>
        </div>
        {rules.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-3)]">
            No rules found in rules/ folder.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--line)] shadow-[var(--shadow-1)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-3)]">
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Rule
                  </th>
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    File
                  </th>
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Applies to
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.filename}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-3)] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[13px] font-medium text-(--ink)">
                      {rule.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-md border border-[var(--line)] bg-[var(--bg-3)] px-2 py-0.5 font-mono text-[12px] text-[var(--ink-2)]">
                        {rule.filename}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {rule.paths.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {rule.paths.map((p) => (
                            <span
                              key={p}
                              className="inline-block rounded-md border border-[var(--line)] bg-[var(--bg-3)] px-2 py-0.5 font-mono text-[12px] text-[var(--ink-3)]"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[var(--ink-3)]">
                          All files
                        </span>
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
