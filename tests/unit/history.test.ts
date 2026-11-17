import { describe, expect, it } from 'vitest'
import type { BalanceSheetResponse, BalanceSheetRow } from '~~/shared/types/balance-sheet'
import type { ValuationHistoryRecord } from '~~/shared/types/history'
import {
  buildHistoryRecord,
  buildHistoryResponse,
  sgtDateKey,
  shouldReplaceHistory,
} from '~~/server/services/history'

function record(overrides: Partial<ValuationHistoryRecord>): ValuationHistoryRecord {
  return {
    asOfDate: '2026-11-16',
    capturedAt: '2026-11-16T00:00:00.000Z',
    netWorthUsd: 100,
    netWorthSgd: 130,
    assetsUsd: 150,
    liabilitiesUsd: 50,
    fxUsdSgd: 1.3,
    priced: 10,
    unpriced: 0,
    isComplete: true,
    ...overrides,
  }
}

function row(source: BalanceSheetRow['source']): BalanceSheetRow {
  return {
    id: `row:${source}`,
    entityType: 'asset',
    entityId: 1,
    section: 'investments',
    name: 'Test',
    category: 'investment',
    nativeCurrency: 'USD',
    nativeAmount: 0,
    quantity: null,
    boughtUnitPrice: null,
    currentUnitPrice: null,
    costBasisNative: null,
    costBasisUsd: null,
    costBasisSgd: null,
    pnlNative: null,
    pnlUsd: null,
    pnlSgd: null,
    usdAmount: 0,
    sgdAmount: 0,
    source,
    provider: null,
    asOf: null,
    symbol: null,
    market: null,
    notes: null,
    isLiability: false,
  }
}

function sheet(overrides: Partial<BalanceSheetResponse> = {}): BalanceSheetResponse {
  return {
    generatedAt: '2026-11-16T00:00:00.000Z',
    refreshMode: 'always',
    rows: [row('live'), row('manual')],
    totals: {
      sections: {
        investments: { usd: 100, sgd: 130 },
        cpf: { usd: 0, sgd: 0 },
        cash_savings: { usd: 0, sgd: 0 },
        liabilities: { usd: 0, sgd: 0 },
      },
      totalAssets: { usd: 150, sgd: 195 },
      totalLiabilities: { usd: 50, sgd: 65 },
      netWorth: { usd: 100, sgd: 130 },
    },
    fx: {
      base: 'USD',
      quote: 'SGD',
      usdToSgd: 1.3,
      sgdToUsd: 1 / 1.3,
      asOf: '2026-11-15',
      fetchedAt: '2026-11-16T00:00:00.000Z',
      source: 'frankfurter',
      isStale: false,
    },
    marketData: { status: 'ok', quotesFetchedAt: null, checkedAt: null },
    quoteSummary: { requested: 2, priced: 1, stale: 0, manualFallback: 1, unpriced: 0 },
    warnings: [],
    ...overrides,
  }
}

describe('SGT date key', () => {
  it('rolls over at 16:00 UTC', () => {
    expect(sgtDateKey(new Date('2026-11-16T15:59:59Z'))).toBe('2026-11-16')
    expect(sgtDateKey(new Date('2026-11-16T16:00:00Z'))).toBe('2026-11-17')
  })
})

describe('history record capture', () => {
  it('refuses to build a row without FX', () => {
    expect(buildHistoryRecord(sheet({ fx: null }), new Date('2026-11-16T00:00:00Z'))).toBeNull()
  })

  it('counts unpriced rows and marks the day incomplete', () => {
    const captured = buildHistoryRecord(
      sheet({ rows: [row('live'), row('unpriced'), row('book')] }),
      new Date('2026-11-16T00:00:00Z'),
    )

    expect(captured).toMatchObject({
      asOfDate: '2026-11-16',
      priced: 2,
      unpriced: 1,
      isComplete: false,
      netWorthUsd: 100,
      netWorthSgd: 130,
      assetsUsd: 150,
      liabilitiesUsd: 50,
      fxUsdSgd: 1.3,
    })
  })

  it('does not overwrite a complete day unless forced', () => {
    const complete = record({})
    const incomplete = record({ isComplete: false })

    expect(shouldReplaceHistory(complete)).toBe(false)
    expect(shouldReplaceHistory(complete, true)).toBe(true)
    expect(shouldReplaceHistory(incomplete)).toBe(true)
    expect(shouldReplaceHistory(null)).toBe(true)
  })
})

describe('history series and drawdown', () => {
  it('computes drawdown from the running peak over complete days', () => {
    const response = buildHistoryResponse([
      record({ asOfDate: '2026-11-14', netWorthSgd: 100, netWorthUsd: 80 }),
      record({ asOfDate: '2026-11-15', netWorthSgd: 120, netWorthUsd: 96 }),
      record({ asOfDate: '2026-11-16', netWorthSgd: 90, netWorthUsd: 72 }),
    ])

    expect(response.completeDays).toBe(3)
    expect(response.incompleteDays).toBe(0)
    expect(response.peakSgd).toBe(120)
    expect(response.peakUsd).toBe(96)
    expect(response.currentSgd).toBe(90)
    expect(response.drawdownSgd).toBeCloseTo(-0.25, 10)
    expect(response.drawdownUsd).toBeCloseTo(-0.25, 10)
    expect(response.points.map(point => point.drawdownSgd)).toEqual([0, 0, -0.25])
    expect(response.firstCompleteDate).toBe('2026-11-14')
    expect(response.lastCompleteDate).toBe('2026-11-16')
  })

  it('keeps incomplete days out of the peak and the drawdown', () => {
    const response = buildHistoryResponse([
      record({ asOfDate: '2026-11-14', netWorthSgd: 100, netWorthUsd: 80 }),
      record({ asOfDate: '2026-11-15', netWorthSgd: 50, netWorthUsd: 40, isComplete: false }),
      record({ asOfDate: '2026-11-16', netWorthSgd: 90, netWorthUsd: 72 }),
    ])

    expect(response.completeDays).toBe(2)
    expect(response.incompleteDays).toBe(1)
    expect(response.peakSgd).toBe(100)
    expect(response.currentSgd).toBe(90)
    expect(response.drawdownSgd).toBeCloseTo(-0.1, 10)
    expect(response.points[1]).toMatchObject({ isComplete: false, drawdownSgd: null })
    expect(response.latest?.asOfDate).toBe('2026-11-16')
  })

  it('returns nulls for an empty series and zero drawdown for the first day', () => {
    const empty = buildHistoryResponse([])
    expect(empty).toMatchObject({
      completeDays: 0,
      incompleteDays: 0,
      firstCompleteDate: null,
      lastCompleteDate: null,
      latest: null,
      peakSgd: null,
      currentSgd: null,
      drawdownSgd: null,
    })

    const first = buildHistoryResponse([record({})])
    expect(first.drawdownSgd).toBe(0)
    expect(first.currentSgd).toBe(130)
  })
})
