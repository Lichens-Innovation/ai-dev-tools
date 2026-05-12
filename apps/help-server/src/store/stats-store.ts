import { Store } from '@tanstack/store'
import type { UsageStats, StatsView } from '../utils/stats'

export interface StatsState {
  usageCache: Record<StatsView, UsageStats | null>
  errorCache: Record<StatsView, string | null>
  fetchTimeCache: Record<StatsView, number>
  statsView: StatsView
}

export const statsStore = new Store<StatsState>({
  usageCache: { session: null, blocks: null, daily: null, monthly: null },
  errorCache: { session: null, blocks: null, daily: null, monthly: null },
  fetchTimeCache: { session: 0, blocks: 0, daily: 0, monthly: 0 },
  statsView: 'session',
})

export function setStatsView(view: StatsView) {
  statsStore.setState((s) => ({ ...s, statsView: view }))
}

export function setStatsCache(view: StatsView, data: UsageStats) {
  statsStore.setState((s) => ({
    ...s,
    usageCache: { ...s.usageCache, [view]: data },
    errorCache: { ...s.errorCache, [view]: null },
    fetchTimeCache: { ...s.fetchTimeCache, [view]: Date.now() },
  }))
}

export function setStatsError(view: StatsView, error: string | null) {
  statsStore.setState((s) => ({
    ...s,
    errorCache: { ...s.errorCache, [view]: error },
  }))
}

export function clearStatsCache(view: StatsView) {
  statsStore.setState((s) => ({
    ...s,
    usageCache: { ...s.usageCache, [view]: null },
    errorCache: { ...s.errorCache, [view]: null },
    fetchTimeCache: { ...s.fetchTimeCache, [view]: 0 },
  }))
}
