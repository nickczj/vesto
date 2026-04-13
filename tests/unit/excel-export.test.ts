import { describe, expect, it } from 'vitest'
import type { BalanceSheetResponse } from '~~/shared/types/balance-sheet'
import { toDetailRows, toSummaryRows } from '~/utils/excel-export'

const sampleSheet: BalanceSheetResponse = {
  generatedAt: '2026-04-13T10:00:00.000Z',
  refreshMode: 'never',
  rows: [
    {
      id: 'asset-1',
      entityType: 'asset',
      entityId: 1,
      section: 'investments',
      name: 'VWRA',
      category: 'investment',
      nativeCurrency: 'USD',
      nativeAmount: 1200,
      boughtUnitPrice: 100,
      currentUnitPrice: 120,
      costBasisNative: 1000,
      costBasisUsd: 1000,
      costBasisSgd: 1350,
      pnlNative: 200,
      pnlUsd: 200,
      pnlSgd: 270,
      usdAmount: 1200,
      sgdAmount: 1620,
      source: 'manual',
      asOf: '2026-04-13',
      symbol: 'VWRA',
      market: 'LSE',
      notes: 'Core holding',
      isLiability: false,
    },
    {
      id: 'liability-1',
      entityType: 'liability',
      entityId: 1,
      section: 'liabilities',
      name: 'Credit Card',
      category: 'credit_card',
      nativeCurrency: 'SGD',
      nativeAmount: 300,
      boughtUnitPrice: null,
      currentUnitPrice: null,
      costBasisNative: null,
      costBasisUsd: null,
      costBasisSgd: null,
      pnlNative: null,
      pnlUsd: null,
      pnlSgd: null,
      usdAmount: 222.22,
      sgdAmount: 300,
      source: 'book',
      asOf: '2026-04-13',
      symbol: null,
      market: null,
      notes: null,
      isLiability: true,
    },
  ],
  totals: {
    sections: {
      investments: { usd: 1200, sgd: 1620 },
      cpf: { usd: 0, sgd: 0 },
      cash_savings: { usd: 0, sgd: 0 },
      liabilities: { usd: 222.22, sgd: 300 },
    },
    totalAssets: { usd: 1200, sgd: 1620 },
    totalLiabilities: { usd: 222.22, sgd: 300 },
    netWorth: { usd: 977.78, sgd: 1320 },
  },
  fx: {
    base: 'USD',
    quote: 'SGD',
    usdToSgd: 1.35,
    sgdToUsd: 0.74074074,
    asOf: '2026-04-13',
    fetchedAt: '2026-04-13T10:00:00.000Z',
    source: 'vesto-go',
    isStale: false,
  },
  quoteSummary: {
    requested: 1,
    priced: 1,
    stale: 0,
    manualFallback: 0,
  },
  warnings: [],
}

describe('excel export helpers', () => {
  it('drops native currency from detail rows and appends a net worth summary row', () => {
    const rows = toDetailRows(sampleSheet)

    expect(rows).toHaveLength(3)
    expect(rows[0]).not.toHaveProperty('NativeCurrency')
    expect(rows[1]?.NativeAmount).toBe(-300)
    expect(rows[2]).toEqual({
      Section: 'Summary',
      Name: 'Net Worth',
      Category: '',
      Type: '',
      Source: '',
      AsOf: '2026-04-13T10:00:00.000Z',
      NativeAmount: '',
      USDAmount: 977.78,
      SGDAmount: 1320,
      Bought: '',
      Current: '',
      CostBasisNative: '',
      PnlSGD: '',
      Symbol: '',
      Market: '',
      Notes: 'Derived as total assets - total liabilities',
    })
  })

  it('keeps net worth in the summary sheet export', () => {
    const rows = toSummaryRows(sampleSheet)

    expect(rows).toContainEqual(['NetWorthUSD', 977.78])
    expect(rows).toContainEqual(['NetWorthSGD', 1320])
  })
})
