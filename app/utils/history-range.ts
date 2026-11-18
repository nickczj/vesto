import type { ValuationHistoryPoint } from '~~/shared/types/history'

/**
 * The history card's range switch. The API is read once for its full window
 * and filtered here, so the peak and drawdown never change meaning when the
 * range changes.
 */
export const HISTORY_RANGES = [
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: '1y', label: '1 year', days: 365 },
  { value: 'all', label: 'All', days: null },
] as const

export type HistoryRange = (typeof HISTORY_RANGES)[number]['value']

export const DEFAULT_HISTORY_RANGE: HistoryRange = '1y'

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** The SGT calendar date, `YYYY-MM-DD`, matching the history rows. */
export function sgtDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10)
}

export function historyRangeDays(range: HistoryRange): number | null {
  return HISTORY_RANGES.find(entry => entry.value === range)?.days ?? null
}

/**
 * Keep the last `days` SGT calendar days, today included. `all` returns the
 * series unchanged. Points are expected in ascending date order.
 */
export function filterHistoryByRange(
  points: ValuationHistoryPoint[],
  range: HistoryRange,
  now: Date = new Date(),
): ValuationHistoryPoint[] {
  const days = historyRangeDays(range)
  if (days === null) return points

  const cutoff = sgtDateKey(new Date(now.getTime() - (days - 1) * DAY_MS))
  return points.filter(point => point.asOfDate >= cutoff)
}

/**
 * The first complete day at the series peak, for "from the peak on 4 Oct".
 * Ties favour the earlier day, which is when the peak was first reached. The
 * ex-CPF series skips rows captured before the column existed.
 */
export function peakHistoryPoint(
  points: ValuationHistoryPoint[],
  currency: 'SGD' | 'USD',
  series: 'total' | 'exCpf' = 'total',
): ValuationHistoryPoint | null {
  let best: ValuationHistoryPoint | null = null
  let bestValue: number | null = null

  for (const point of points) {
    if (!point.isComplete) continue

    const value = series === 'exCpf'
      ? (currency === 'SGD' ? point.netWorthExCpfSgd : point.netWorthExCpfUsd)
      : (currency === 'SGD' ? point.netWorthSgd : point.netWorthUsd)

    if (value === null) continue
    if (bestValue === null || value > bestValue) {
      best = point
      bestValue = value
    }
  }

  return best
}
