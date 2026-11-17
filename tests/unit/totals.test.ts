import { describe, expect, it } from 'vitest'
import { accumulateTotals } from '~~/server/services/valuation'
import type { BalanceSheetRow } from '~~/shared/types/balance-sheet'

const rows: BalanceSheetRow[] = [
  {
    id: 'asset:1',
    entityType: 'asset',
    entityId: 1,
    section: 'investments',
    name: 'ETF',
    category: 'investment',
    nativeCurrency: 'USD',
    nativeAmount: 100,
    quantity: 1,
    boughtUnitPrice: 90,
    currentUnitPrice: 100,
    costBasisNative: 90,
    costBasisUsd: 90,
    costBasisSgd: 117,
    pnlNative: 10,
    pnlUsd: 10,
    pnlSgd: 13,
    usdAmount: 100,
    sgdAmount: 130,
    source: 'live',
    provider: 'yahoo_scrape',
    asOf: null,
    symbol: 'SPY',
    market: 'NMS',
    notes: null,
    isLiability: false,
  },
  {
    id: 'asset:2',
    entityType: 'asset',
    entityId: 2,
    section: 'cpf',
    name: 'CPF OA',
    category: 'cpf:OA',
    nativeCurrency: 'SGD',
    nativeAmount: 500,
    quantity: null,
    boughtUnitPrice: null,
    currentUnitPrice: null,
    costBasisNative: null,
    costBasisUsd: null,
    costBasisSgd: null,
    pnlNative: null,
    pnlUsd: null,
    pnlSgd: null,
    usdAmount: 384.62,
    sgdAmount: 500,
    source: 'book',
    provider: null,
    asOf: null,
    symbol: null,
    market: null,
    notes: null,
    isLiability: false,
  },
  {
    id: 'liability:1',
    entityType: 'liability',
    entityId: 1,
    section: 'liabilities',
    name: 'Loan',
    category: 'loan',
    nativeCurrency: 'SGD',
    nativeAmount: 130,
    quantity: null,
    boughtUnitPrice: null,
    currentUnitPrice: null,
    costBasisNative: null,
    costBasisUsd: null,
    costBasisSgd: null,
    pnlNative: null,
    pnlUsd: null,
    pnlSgd: null,
    usdAmount: 100,
    sgdAmount: 130,
    source: 'book',
    provider: null,
    asOf: null,
    symbol: null,
    market: null,
    notes: null,
    isLiability: true,
  },
]

describe('totals accumulation', () => {
  it('computes assets, liabilities, and net worth in both currencies', () => {
    const totals = accumulateTotals(rows)

    expect(totals.totalAssets.usd).toBe(484.62)
    expect(totals.totalAssets.sgd).toBe(630)
    expect(totals.totalLiabilities.usd).toBe(100)
    expect(totals.totalLiabilities.sgd).toBe(130)
    expect(totals.netWorth.usd).toBe(384.62)
    expect(totals.netWorth.sgd).toBe(500)
  })

  it('excludes unpriced rows instead of counting them as zero', () => {
    const unpriced: BalanceSheetRow = {
      ...rows[0],
      id: 'asset:unpriced',
      entityId: 99,
      name: 'Unpriced holding',
      source: 'unpriced',
      usdAmount: 0,
      sgdAmount: 0,
      pnlSgd: null,
    }

    const totals = accumulateTotals([...rows, unpriced])

    expect(totals.totalAssets.usd).toBe(484.62)
    expect(totals.totalAssets.sgd).toBe(630)
    expect(totals.netWorth.usd).toBe(384.62)
    expect(totals.netWorth.sgd).toBe(500)
  })
})
