import { useState, useEffect } from 'react'
import { useSelector } from '@tanstack/react-store'
import { RotateCw, Loader2 } from 'lucide-react'
import { getUsageStats } from '../../utils/stats'
import type { UsageStats, StatsView } from '../../utils/stats'
import {
  statsStore,
  setStatsView,
  setStatsCache,
  setStatsError,
  clearStatsCache,
} from '../../store/stats-store'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const VIEWS: StatsView[] = ['session', 'blocks', 'daily', 'monthly']

function formatTimeAgo(ms: number): string {
  if (!ms) return ''
  const seconds = Math.floor((Date.now() - ms) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatCard({
  label,
  value,
  formatter,
}: {
  label: string
  value: number
  formatter?: (v: number) => string
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-5 py-4 shadow-[var(--shadow-1)] transition-colors hover:border-[var(--line-2)] hover:bg-[var(--bg-3)] hover:shadow-[var(--shadow-2)]">
      <div className="mb-1.5 font-mono text-2xl font-light text-[var(--amber)]">
        {formatter ? formatter(value) : value.toLocaleString('en-US')}
      </div>
      <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {label}
      </div>
    </div>
  )
}

export default function StatsTab() {
  const { statsView, usageCache, errorCache, fetchTimeCache } = useSelector(
    statsStore,
  )

  const [isFetching, setIsFetching] = useState(false)
  const [forceRefreshFlag, setForceRefreshFlag] = useState(0)

  const usage = usageCache[statsView]
  const viewError = errorCache[statsView]
  const loading = usage === null && !viewError

  // Keyboard shortcuts: 1-4 to switch views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }
      const key = e.key
      if (key >= '1' && key <= '4') {
        const index = parseInt(key, 10) - 1
        if (index < VIEWS.length) {
          setStatsView(VIEWS[index])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const doFetch = () => {
    const cached = usageCache[statsView]
    const fetchedAt = fetchTimeCache[statsView]
    const isFresh = cached && fetchedAt && Date.now() - fetchedAt < CACHE_TTL
    if (isFresh) return

    setIsFetching(true)
    setStatsError(statsView, null)

    let cancelled = false
    getUsageStats({ data: statsView })
      .then((data: UsageStats) => {
        if (!cancelled) {
          setStatsCache(statsView, data)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatsError(
            statsView,
            err instanceof Error
              ? err.message
              : 'Failed to load usage stats.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetching(false)
        }
      })
    return () => {
      cancelled = true
      setIsFetching(false)
    }
  }

  useEffect(() => {
    const cleanup = doFetch()
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsView, forceRefreshFlag])

  const handleRefresh = () => {
    clearStatsCache(statsView)
    setForceRefreshFlag((n) => n + 1)
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const isStale =
    usage?.lastUpdated &&
    (usage.lastUpdated < todayStr || usage.lastUpdated > todayStr)

  const lastFetched = fetchTimeCache[statsView]
  const timeAgo = formatTimeAgo(lastFetched)

  return (
    <div className="space-y-6">
      <div className="mb-1 flex items-center gap-3 flex-wrap">
        <span className="section-label">Usage</span>
        <div className="flex gap-1 rounded-md border border-[var(--line)] bg-[var(--bg-2)] p-0.5">
          {VIEWS.map((v, i) => (
            <button
              key={v}
              onClick={() => setStatsView(v)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition ${
                statsView === v
                  ? 'bg-[var(--amber)] text-[var(--bg)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
              title={`${v.charAt(0).toUpperCase() + v.slice(1)} (press ${i + 1})`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--bg-2)] px-2 py-1 text-[11px] font-medium text-[var(--ink-3)] transition hover:text-[var(--ink-2)] disabled:opacity-50"
          title="Refresh stats"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCw className="h-3 w-3" />
          )}
          Refresh
        </button>
        {timeAgo && (
          <span className="text-[11px] text-[var(--ink-3)]">
            Refreshed {timeAgo}
          </span>
        )}
        {statsView === 'monthly' && usage?.latestMonth && (
          <span className="rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-[12px] text-[var(--ink-3)]">
            {usage.latestMonth}
          </span>
        )}
        {isStale && (
          <span className="rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-[12px] text-[var(--ink-3)]">
            cached · {usage.lastUpdated}
          </span>
        )}
      </div>

      {loading && (
        <div className="py-20 text-center text-[13px] text-[var(--ink-3)]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading usage stats…
        </div>
      )}

      {viewError && !usage && (
        <div className="py-20 text-center text-[13px] text-[var(--ink-3)]">
          {viewError}
        </div>
      )}

      {usage && statsView === 'session' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Sessions" value={usage.sessionCount} />
          <StatCard
            label="Input tokens (latest)"
            value={usage.latestSessionInputTokens}
          />
          <StatCard
            label="Output tokens (latest)"
            value={usage.latestSessionOutputTokens}
          />
          <StatCard
            label="Cost (latest)"
            value={usage.latestSessionCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
          <StatCard
            label="Total tokens (latest)"
            value={usage.latestSessionTotalTokens}
          />
          <StatCard
            label="Input tokens (total)"
            value={usage.totalSessionInputTokens}
          />
          <StatCard
            label="Output tokens (total)"
            value={usage.totalSessionOutputTokens}
          />
          <StatCard
            label="Cost (total)"
            value={usage.totalSessionCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
        </div>
      )}

      {usage && statsView === 'blocks' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Blocks" value={usage.blockCount} />
          <StatCard label="Active blocks" value={usage.activeBlockCount} />
          <StatCard
            label="Input tokens (latest)"
            value={usage.latestBlockInputTokens}
          />
          <StatCard
            label="Output tokens (latest)"
            value={usage.latestBlockOutputTokens}
          />
          <StatCard
            label="Total tokens (latest)"
            value={usage.latestBlockTotalTokens}
          />
          <StatCard
            label="Cost (latest)"
            value={usage.latestBlockCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
          <StatCard
            label="Input tokens (total)"
            value={usage.totalBlockInputTokens}
          />
          <StatCard
            label="Output tokens (total)"
            value={usage.totalBlockOutputTokens}
          />
          <StatCard
            label="Total tokens (total)"
            value={usage.totalBlockTotalTokens}
          />
          <StatCard
            label="Cost (total)"
            value={usage.totalBlockCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
        </div>
      )}

      {usage && statsView === 'daily' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Input tokens (latest)"
            value={usage.todayInputTokens}
          />
          <StatCard
            label="Output tokens (latest)"
            value={usage.todayOutputTokens}
          />
          <StatCard
            label="Total tokens (latest)"
            value={usage.todayTotalTokens}
          />
          <StatCard
            label="Cost (latest)"
            value={usage.todayCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
          <StatCard label="Input tokens (7d)" value={usage.weekInputTokens} />
          <StatCard
            label="Output tokens (7d)"
            value={usage.weekOutputTokens}
          />
          <StatCard label="Total tokens (7d)" value={usage.weekTotalTokens} />
          <StatCard
            label="Cost (7d)"
            value={usage.weekCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
        </div>
      )}

      {usage && statsView === 'monthly' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Months tracked" value={usage.monthCount} />
          <StatCard
            label="Input tokens (latest)"
            value={usage.latestMonthInputTokens}
          />
          <StatCard
            label="Output tokens (latest)"
            value={usage.latestMonthOutputTokens}
          />
          <StatCard
            label="Total tokens (latest)"
            value={usage.latestMonthTotalTokens}
          />
          <StatCard
            label="Cost (latest)"
            value={usage.latestMonthCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
          <StatCard
            label="Input tokens (total)"
            value={usage.totalMonthlyInputTokens}
          />
          <StatCard
            label="Output tokens (total)"
            value={usage.totalMonthlyOutputTokens}
          />
          <StatCard
            label="Cost (total)"
            value={usage.totalMonthlyCost}
            formatter={(v) => `$${v.toFixed(2)}`}
          />
        </div>
      )}

      {usage?.error && (
        <p className="mb-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-[12px] text-red-400">
          {usage.error}
        </p>
      )}
      {isStale && (
        <p className="mt-3 text-[12px] text-[var(--ink-3)]">
          Latest entry dated <code>{usage.lastUpdated}</code>. Stats read via{' '}
          <code>ccusage</code>.
        </p>
      )}

      {/* Shortcut hint bar */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
        <span className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]">
          1
        </span>
        <span>Session</span>
        <span className="text-[var(--line-2)]">·</span>
        <span className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]">
          2
        </span>
        <span>Blocks</span>
        <span className="text-[var(--line-2)]">·</span>
        <span className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]">
          3
        </span>
        <span>Daily</span>
        <span className="text-[var(--line-2)]">·</span>
        <span className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]">
          4
        </span>
        <span>Monthly</span>
      </div>
    </div>
  )
}
