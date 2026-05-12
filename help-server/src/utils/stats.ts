import { createServerFn } from '@tanstack/react-start'
import { execFile } from 'node:child_process'

export interface UsageStats {
  // Session metrics
  sessionCount: number
  latestSessionInputTokens: number
  latestSessionOutputTokens: number
  latestSessionTotalTokens: number
  latestSessionCost: number
  totalSessionInputTokens: number
  totalSessionOutputTokens: number
  totalSessionTotalTokens: number
  totalSessionCost: number
  // Blocks metrics
  blockCount: number
  activeBlockCount: number
  latestBlockInputTokens: number
  latestBlockOutputTokens: number
  latestBlockTotalTokens: number
  latestBlockCost: number
  totalBlockInputTokens: number
  totalBlockOutputTokens: number
  totalBlockTotalTokens: number
  totalBlockCost: number
  // Daily metrics
  todayInputTokens: number
  todayOutputTokens: number
  todayTotalTokens: number
  todayCost: number
  weekInputTokens: number
  weekOutputTokens: number
  weekTotalTokens: number
  weekCost: number
  // Monthly metrics
  monthCount: number
  latestMonth: string
  latestMonthInputTokens: number
  latestMonthOutputTokens: number
  latestMonthTotalTokens: number
  latestMonthCost: number
  totalMonthlyInputTokens: number
  totalMonthlyOutputTokens: number
  totalMonthlyTotalTokens: number
  totalMonthlyCost: number
  // Common
  lastUpdated: string
  error?: string
}

export type StatsView = 'session' | 'blocks' | 'daily' | 'monthly'

const runCcusage = (cmd: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['--silent', '--yes', 'ccusage@latest', cmd, '--json'],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message))
        } else {
          resolve(stdout)
        }
      },
    )
  })

const emptyStats: UsageStats = {
  sessionCount: 0,
  latestSessionInputTokens: 0,
  latestSessionOutputTokens: 0,
  latestSessionTotalTokens: 0,
  latestSessionCost: 0,
  totalSessionInputTokens: 0,
  totalSessionOutputTokens: 0,
  totalSessionTotalTokens: 0,
  totalSessionCost: 0,
  blockCount: 0,
  activeBlockCount: 0,
  latestBlockInputTokens: 0,
  latestBlockOutputTokens: 0,
  latestBlockTotalTokens: 0,
  latestBlockCost: 0,
  totalBlockInputTokens: 0,
  totalBlockOutputTokens: 0,
  totalBlockTotalTokens: 0,
  totalBlockCost: 0,
  todayInputTokens: 0,
  todayOutputTokens: 0,
  todayTotalTokens: 0,
  todayCost: 0,
  weekInputTokens: 0,
  weekOutputTokens: 0,
  weekTotalTokens: 0,
  weekCost: 0,
  monthCount: 0,
  latestMonth: '',
  latestMonthInputTokens: 0,
  latestMonthOutputTokens: 0,
  latestMonthTotalTokens: 0,
  latestMonthCost: 0,
  totalMonthlyInputTokens: 0,
  totalMonthlyOutputTokens: 0,
  totalMonthlyTotalTokens: 0,
  totalMonthlyCost: 0,
  lastUpdated: '',
}

export const getUsageStats = createServerFn({ method: 'POST' })
  .inputValidator((data: StatsView) => data)
  .handler(async ({ data: view }): Promise<UsageStats> => {
    let dailyData: {
      daily: Array<{
        date: string
        inputTokens: number
        outputTokens: number
        totalTokens: number
        totalCost: number
      }>
    } | null = null
    let sessionData: {
      sessions: Array<{
        sessionId: string
        inputTokens: number
        outputTokens: number
        totalTokens: number
        totalCost: number
        lastActivity: string
      }>
    } | null = null
    let blocksData: {
      blocks: Array<{
        startTime: string
        isActive: boolean
        tokenCounts: { inputTokens: number; outputTokens: number }
        totalTokens: number
        costUSD: number
      }>
    } | null = null
    let monthlyData: {
      monthly: Array<{
        month: string
        inputTokens: number
        outputTokens: number
        totalTokens: number
        totalCost: number
      }>
    } | null = null

    const errors: string[] = []

    if (view === 'daily') {
      try {
        const result = await runCcusage('daily')
        dailyData = JSON.parse(result)
      } catch (e) {
        errors.push(`daily: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (view === 'session') {
      try {
        const result = await runCcusage('session')
        sessionData = JSON.parse(result)
      } catch (e) {
        errors.push(`session: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (view === 'blocks') {
      try {
        const result = await runCcusage('blocks')
        blocksData = JSON.parse(result)
      } catch (e) {
        errors.push(`blocks: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (view === 'monthly') {
      try {
        const result = await runCcusage('monthly')
        monthlyData = JSON.parse(result)
      } catch (e) {
        errors.push(`monthly: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    let lastUpdated = ''
    let result: Partial<UsageStats> = {}

    if (view === 'daily' && dailyData?.daily) {
      const sortedDaily = [...dailyData.daily].sort((a, b) =>
        b.date.localeCompare(a.date),
      )
      const latestDaily = sortedDaily[0]
      const weekDaily = sortedDaily.slice(0, 7)
      lastUpdated = latestDaily?.date ?? ''
      result = {
        todayInputTokens: latestDaily?.inputTokens ?? 0,
        todayOutputTokens: latestDaily?.outputTokens ?? 0,
        todayTotalTokens: latestDaily?.totalTokens ?? 0,
        todayCost: latestDaily?.totalCost ?? 0,
        weekInputTokens: weekDaily.reduce((s, d) => s + d.inputTokens, 0),
        weekOutputTokens: weekDaily.reduce((s, d) => s + d.outputTokens, 0),
        weekTotalTokens: weekDaily.reduce((s, d) => s + d.totalTokens, 0),
        weekCost: weekDaily.reduce((s, d) => s + d.totalCost, 0),
      }
    } else if (view === 'session' && sessionData?.sessions) {
      const sortedSessions = [...sessionData.sessions].sort((a, b) =>
        b.lastActivity.localeCompare(a.lastActivity),
      )
      const latestSession = sortedSessions[0]
      lastUpdated = latestSession?.lastActivity.slice(0, 10) ?? ''
      result = {
        sessionCount: sortedSessions.length,
        latestSessionInputTokens: latestSession?.inputTokens ?? 0,
        latestSessionOutputTokens: latestSession?.outputTokens ?? 0,
        latestSessionTotalTokens: latestSession?.totalTokens ?? 0,
        latestSessionCost: latestSession?.totalCost ?? 0,
        totalSessionInputTokens: sortedSessions.reduce(
          (s, sess) => s + sess.inputTokens,
          0,
        ),
        totalSessionOutputTokens: sortedSessions.reduce(
          (s, sess) => s + sess.outputTokens,
          0,
        ),
        totalSessionTotalTokens: sortedSessions.reduce(
          (s, sess) => s + sess.totalTokens,
          0,
        ),
        totalSessionCost: sortedSessions.reduce(
          (s, sess) => s + sess.totalCost,
          0,
        ),
      }
    } else if (view === 'blocks' && blocksData?.blocks) {
      const sortedBlocks = [...blocksData.blocks].sort((a, b) =>
        b.startTime.localeCompare(a.startTime),
      )
      const latestBlock = sortedBlocks[0]
      const activeBlocks = sortedBlocks.filter((b) => b.isActive).length
      lastUpdated = latestBlock?.startTime.slice(0, 10) ?? ''
      result = {
        blockCount: sortedBlocks.length,
        activeBlockCount: activeBlocks,
        latestBlockInputTokens: latestBlock?.tokenCounts?.inputTokens ?? 0,
        latestBlockOutputTokens: latestBlock?.tokenCounts?.outputTokens ?? 0,
        latestBlockTotalTokens: latestBlock?.totalTokens ?? 0,
        latestBlockCost: latestBlock?.costUSD ?? 0,
        totalBlockInputTokens: sortedBlocks.reduce(
          (s, b) => s + b.tokenCounts.inputTokens,
          0,
        ),
        totalBlockOutputTokens: sortedBlocks.reduce(
          (s, b) => s + b.tokenCounts.outputTokens,
          0,
        ),
        totalBlockTotalTokens: sortedBlocks.reduce(
          (s, b) => s + b.totalTokens,
          0,
        ),
        totalBlockCost: sortedBlocks.reduce((s, b) => s + b.costUSD, 0),
      }
    } else if (view === 'monthly' && monthlyData?.monthly) {
      const sortedMonthly = [...monthlyData.monthly].sort((a, b) =>
        b.month.localeCompare(a.month),
      )
      const latestMonthly = sortedMonthly[0]
      lastUpdated = latestMonthly?.month ? `${latestMonthly.month}-01` : ''
      result = {
        monthCount: sortedMonthly.length,
        latestMonth: latestMonthly?.month ?? '',
        latestMonthInputTokens: latestMonthly?.inputTokens ?? 0,
        latestMonthOutputTokens: latestMonthly?.outputTokens ?? 0,
        latestMonthTotalTokens: latestMonthly?.totalTokens ?? 0,
        latestMonthCost: latestMonthly?.totalCost ?? 0,
        totalMonthlyInputTokens: sortedMonthly.reduce(
          (s, m) => s + m.inputTokens,
          0,
        ),
        totalMonthlyOutputTokens: sortedMonthly.reduce(
          (s, m) => s + m.outputTokens,
          0,
        ),
        totalMonthlyTotalTokens: sortedMonthly.reduce(
          (s, m) => s + m.totalTokens,
          0,
        ),
        totalMonthlyCost: sortedMonthly.reduce(
          (s, m) => s + m.totalCost,
          0,
        ),
      }
    }

    return {
      ...emptyStats,
      ...result,
      lastUpdated,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    }
  })
