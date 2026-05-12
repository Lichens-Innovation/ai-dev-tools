import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import type { InstalledPlugin } from '../../utils/plugins'
import type { ClaudeCommand } from '../../utils/commands'
import CopyableText from '../CopyableText'

interface CommandCenterProps {
  installedPlugins: InstalledPlugin[]
  commands: ClaudeCommand[]
}

function ScopeChip({ scope }: { scope: string }) {
  const isUser = scope === 'user'
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isUser
          ? 'border-[var(--amber-dim-2)] bg-[var(--amber-dim)] text-[var(--amber)]'
          : 'border-[var(--line)] bg-[var(--bg-3)] text-[var(--ink-3)]'
      }`}
    >
      {scope}
    </span>
  )
}

const cmdColumnHelper = createColumnHelper<ClaudeCommand>()

const cmdColumns = [
  cmdColumnHelper.accessor('command', {
    header: 'Command',
    cell: ({ getValue }) => {
      const value = getValue()
      return (
        <CopyableText text={value} className="inline-block">
          <span className="inline-block rounded-md border border-[var(--amber-dim-2)] bg-[var(--amber-dim)] px-2 py-0.5 font-mono text-[12px] text-[var(--amber)] transition group-hover:border-[var(--amber)] group-hover:bg-[var(--amber-glow)]">
            {value}
          </span>
        </CopyableText>
      )
    },
    enableGlobalFilter: true,
  }),
  cmdColumnHelper.accessor('description', {
    header: 'Description',
    cell: ({ getValue }) => (
      <span className="text-[13px] text-[var(--ink-2)]">{getValue()}</span>
    ),
    enableGlobalFilter: true,
  }),
]

export default function CommandCenter({
  installedPlugins,
  commands,
}: CommandCenterProps) {
  const [cmdFilter, setCmdFilter] = useState('')

  const table = useReactTable({
    data: useMemo(() => commands, [commands]),
    columns: cmdColumns,
    state: { globalFilter: cmdFilter },
    onGlobalFilterChange: setCmdFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="space-y-10">
      {/* Installed plugins */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="section-label">Installed Plugins</span>
          <span className="text-[10px] text-[var(--ink-3)]">
            {installedPlugins.length}
          </span>
        </div>
        {installedPlugins.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-3)]">
            No plugins installed.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--line)] shadow-[var(--shadow-1)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-3)]">
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Plugin
                  </th>
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Marketplace
                  </th>
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Version
                  </th>
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Scope
                  </th>
                  <th className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]">
                    Installed
                  </th>
                </tr>
              </thead>
              <tbody>
                {installedPlugins.map((p) => (
                  <tr
                    key={p.key}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-3)] transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-md border border-[var(--amber-dim-2)] bg-[var(--amber-dim)] px-2 py-0.5 font-mono text-[12px] text-[var(--amber)]">
                        {p.pluginName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-[var(--ink-2)]">
                      {p.marketplace}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-3)]">
                      {p.version || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <ScopeChip scope={p.scope} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-3)]">
                      {p.installedAt ? p.installedAt.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Commands */}
      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="section-label">Commands</span>
            <span className="text-[10px] text-[var(--ink-3)]">
              {table.getFilteredRowModel().rows.length} of {commands.length}
            </span>
          </div>
          <div
            className={`flex w-full sm:w-80 flex-shrink-0 items-center gap-2 rounded-md border bg-[var(--bg-2)] px-3 py-1.5 transition-colors ${
              cmdFilter
                ? 'border-[var(--amber)] shadow-sm'
                : 'border-[var(--line)]'
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[var(--ink-3)]"
            >
              <circle
                cx="8.5"
                cy="8.5"
                r="5.75"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M13.5 13.5L17 17"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              value={cmdFilter}
              onChange={(e) => setCmdFilter(e.target.value)}
              placeholder="Filter commands…"
              className="w-full bg-transparent text-[13px] text-(--ink) placeholder-[var(--ink-3)] outline-none"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--line)] shadow-[var(--shadow-1)]">
          <table className="w-full border-collapse">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-[var(--bg-3)]">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b border-[var(--line)] px-4 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)]"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getFilteredRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-6 text-center text-[13px] text-[var(--ink-3)]"
                  >
                    No commands match.
                  </td>
                </tr>
              ) : (
                table.getFilteredRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-3)] transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 align-top">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
