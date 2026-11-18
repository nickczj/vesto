import { describe, expect, it } from 'vitest'
import type { ValuationHistoryPoint } from '~~/shared/types/history'
import {
  filterHistoryByRange,
  peakHistoryPoint,
  sgtDateKey,
} from '~/utils/history-range'

function point(asOfDate: string, netWorthSgd: number, isComplete = true): ValuationHistoryPoint {
  return {
    asOfDate,
    capturedAt: `${asOfDate}T00:00:00.000Z`,
    netWorthUsd: netWorthSgd / 1.3,
    netWorthSgd,
    netWorthExCpfUsd: (netWorthSgd - 20) / 1.3,
    netWorthExCpfSgd: netWorthSgd - 20,
    assetsUsd: netWorthSgd / 1.3,
    liabilitiesUsd: 0,
    fxUsdSgd: 1.3,
    priced: 1,
    unpriced: 0,
    isComplete,
    drawdownUsd: 0,
    drawdownSgd: 0,
  }
}

const now = new Date('2026-11-17T12:00:00+08:00')

describe('history range filtering', () => {
  it('keeps the last 30 SGT calendar days, today included', () => {
    const points = [
      point('2026-10-18', 100),
      point('2026-10-19', 110),
      point('2026-11-17', 120),
    ]

    expect(filterHistoryByRange(points, '30d', now).map(p => p.asOfDate))
      .toEqual(['2026-10-19', '2026-11-17'])
  })

  it('uses the same SGT boundaries for 90 days and 1 year', () => {
    const points = [
      point('2025-11-17', 90),
      point('2025-11-18', 100),
      point('2026-08-19', 110),
      point('2026-08-20', 120),
    ]

    expect(filterHistoryByRange(points, '90d', now).map(p => p.asOfDate))
      .toEqual(['2026-08-20'])
    expect(filterHistoryByRange(points, '1y', now).map(p => p.asOfDate))
      .toEqual(['2025-11-18', '2026-08-19', '2026-08-20'])
  })

  it('returns the whole series for All', () => {
    const points = [point('2024-01-01', 1), point('2026-11-17', 2)]
    expect(filterHistoryByRange(points, 'all', now)).toBe(points)
  })
})

describe('history peak', () => {
  it('finds the first complete day at the peak', () => {
    const points = [
      point('2026-11-14', 100),
      point('2026-11-15', 300),
      point('2026-11-16', 300, false),
      point('2026-11-17', 200),
    ]

    expect(peakHistoryPoint(points, 'SGD')?.asOfDate).toBe('2026-11-15')
    expect(peakHistoryPoint(points, 'USD')?.asOfDate).toBe('2026-11-15')
  })

  it('ignores incomplete days and returns null when nothing is complete', () => {
    expect(peakHistoryPoint([point('2026-11-17', 100, false)], 'SGD')).toBeNull()
  })

  it('finds the ex-CPF peak and skips rows without the column', () => {
    const points = [
      { ...point('2026-11-14', 100), netWorthExCpfUsd: null, netWorthExCpfSgd: null },
      { ...point('2026-11-15', 300), netWorthExCpfUsd: 180 / 1.3, netWorthExCpfSgd: 180 },
      { ...point('2026-11-16', 200), netWorthExCpfUsd: 190 / 1.3, netWorthExCpfSgd: 190 },
    ]

    expect(peakHistoryPoint(points, 'SGD', 'exCpf')?.asOfDate).toBe('2026-11-16')
    expect(peakHistoryPoint(points, 'USD', 'exCpf')?.asOfDate).toBe('2026-11-16')
  })
})

describe('SGT date keys', () => {
  it('rolls over at SGT midnight, not UTC midnight', () => {
    expect(sgtDateKey(new Date('2026-11-16T15:59:00Z'))).toBe('2026-11-16')
    expect(sgtDateKey(new Date('2026-11-16T16:01:00Z'))).toBe('2026-11-17')
  })
})
