import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import type { ColumnFiltersState, FilterFn } from '@tanstack/react-table'
import type { CuratedPlugin } from '../../utils/marketplace'
import CopyableText from '../CopyableText'

interface CuratedTabProps {
  plugins: CuratedPlugin[]
}



const nameSearchFilter: FilterFn<CuratedPlugin> = (
  row,
  _columnId,
  filterValue: string,
) => {
  if (!filterValue) return true
  const lower = filterValue.toLowerCase()
  return (
    row.original.name.toLowerCase().includes(lower) ||
    row.original.description.toLowerCase().includes(lower)
  )
}

const columnHelper = createColumnHelper<CuratedPlugin>()

const columns = [
  columnHelper.accessor('name', {
    header: 'Plugin',
    filterFn: nameSearchFilter,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-block rounded-md border border-[var(--amber-dim-2)] bg-[var(--amber-dim)] px-2 py-0.5 font-mono text-[12px] text-[var(--amber)]">
          {row.original.name}
        </span>
        {row.original.isInstalled && (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--green-dim)] bg-[var(--green-dim)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
            Installed
          </span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor('marketplaceLabel', {
    header: 'Source',
    filterFn: 'equals',
    cell: ({ getValue }) => {
      const label = getValue()
      const isAnthropic = label.toLowerCase().includes('anthropic')
      return (
        <span
          className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            isAnthropic
              ? 'border-[var(--amber-dim-2)] bg-[var(--amber-dim)] text-[var(--amber)]'
              : 'border-[var(--line)] bg-[var(--bg-3)] text-[var(--ink-3)]'
          }`}
        >
          {label}
        </span>
      )
    },
  }),
  columnHelper.accessor('description', {
    header: 'Description',
    cell: ({ getValue }) => (
      <span className="text-[13px] text-[var(--ink-2)]">{getValue()}</span>
    ),
  }),
  columnHelper.accessor('isInstalled', {
    header: 'Install',
    filterFn: (row, _columnId, filterValue: string) => {
      if (filterValue === 'all') return true
      if (filterValue === 'installed') return row.original.isInstalled
      if (filterValue === 'not-installed') return !row.original.isInstalled
      return true
    },
    cell: ({ row }) =>
      row.original.isInstalled ? (
        <span className="text-[13px] text-[var(--ink-3)]">—</span>
      ) : (
        <CopyableText
          text={row.original.installCommand}
          className="inline-block"
          previewText="Click to copy install command"
        >
          <code className="inline-block rounded-md border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--ink-2)] transition group-hover:border-[var(--amber-dim-2)] group-hover:bg-[var(--amber-dim)] group-hover:text-[var(--amber)]">
            {row.original.installCommand}
          </code>
        </CopyableText>
      ),
  }),
]

export default function CuratedTab({ plugins }: CuratedTabProps) {
  const [nameFilter, setNameFilter] = useState('')
  const [marketplaceFilter, setMarketplaceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data: useMemo(() => plugins, [plugins]),
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const marketplaces = useMemo(
    () => [
      'all',
      ...Array.from(new Set(plugins.map((p) => p.marketplaceLabel))),
    ],
    [plugins],
  )

  const installedCount = plugins.filter((p) => p.isInstalled).length

  function handleNameFilter(value: string) {
    setNameFilter(value)
    table.getColumn('name')?.setFilterValue(value || undefined)
  }

  function handleMarketplaceFilter(value: string) {
    setMarketplaceFilter(value)
    table
      .getColumn('marketplaceLabel')
      ?.setFilterValue(value === 'all' ? undefined : value)
  }

  function handleStatusFilter(value: string) {
    setStatusFilter(value)
    table.getColumn('isInstalled')?.setFilterValue(value)
  }

  const visibleCount = table.getFilteredRowModel().rows.length

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="section-label">Curated Plugins</span>
            <span className="text-[10px] text-[var(--ink-3)]">
              {visibleCount} shown · {installedCount} installed
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--ink-3)]">
            Verified plugins from trusted sources.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div
            className={`flex w-full sm:w-56 flex-shrink-0 items-center gap-2 rounded-md border bg-[var(--bg-2)] px-3 py-1.5 transition-colors ${
              nameFilter
                ? 'border-[var(--amber)] shadow-sm'
                : 'border-[var(--line)]'
            }`}
          >
            <svg
              width="11"
              height="11"
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
              value={nameFilter}
              onChange={(e) => handleNameFilter(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-[13px] text-(--ink) placeholder-[var(--ink-3)] outline-none"
            />
          </div>

          {/* Marketplace filter */}
          <select
            value={marketplaceFilter}
            onChange={(e) => handleMarketplaceFilter(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-[13px] text-(--ink) outline-none hover:border-[var(--line-2)]"
          >
            {marketplaces.map((m) => (
              <option key={m} value={m}>
                {m === 'all' ? 'All sources' : m}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
            className="rounded-md border border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 text-[13px] text-(--ink) outline-none hover:border-[var(--line-2)]"
          >
            <option value="all">All status</option>
            <option value="installed">Installed</option>
            <option value="not-installed">Not installed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {visibleCount === 0 ? (
        <p className="text-[13px] text-[var(--ink-3)]">
          No plugins match the current filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--line)] shadow-[var(--shadow-1)]">
          <table className="w-full border-collapse">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-[var(--bg-3)]">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      style={
                        header.column.id === 'isInstalled'
                          ? { minWidth: '20em' }
                          : undefined
                      }
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
              {table.getFilteredRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-3)] transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={
                        cell.column.id === 'isInstalled'
                          ? { minWidth: '20em' }
                          : undefined
                      }
                      className="px-4 py-2.5 align-top"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
