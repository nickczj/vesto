import { beforeEach, describe, expect, it, vi } from 'vitest'
import initDbPlugin from '~~/server/plugins/db-init'
import { buildBalanceSheet, restoreSnapshotCache } from '~~/server/services/balance-sheet'
import { createAsset } from '~~/server/services/repository'
import type { FxSnapshot, QuoteSnapshot } from '~~/shared/types/balance-sheet'
import { resetTestDatabase } from './setup'

const { fetchQuoteBatch, fetchUsdToSgdFx } = vi.hoisted(() => ({
  fetchQuoteBatch: vi.fn(),
  fetchUsdToSgdFx: vi.fn(),
}))

vi.mock('~~/server/utils/vesto-go', () => ({
  buildQuoteCacheKey: (symbol: string, market?: string | null) =>
    `${symbol.trim().toUpperCase()}::${(market || '').trim().toUpperCase()}`,
  fetchQuoteBatch,
  fetchUsdToSgdFx,
}))

const TEST_DB = '/tmp/vesto-v2-quote-staleness-test.db'
const QUOTE_KEY = 'VWRA.L::LSE'

function fxSnapshot(): FxSnapshot {
  return {
    base: 'USD',
    quote: 'SGD',
    usdToSgd: 1.35,
    sgdToUsd: 1 / 1.35,
    asOf: '2026-11-16',
    fetchedAt: new Date().toISOString(),
    source: 'test',
    isStale: false,
  }
}

function quoteSnapshot(): QuoteSnapshot {
  return {
    symbol: 'VWRA.L',
    market: 'LSE',
    currency: 'USD',
    price: 100,
    asOf: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'test',
    isStale: false,
  }
}

function createInvestment() {
  createAsset({
    kind: 'investment',
    name: 'World ETF',
    symbol: 'VWRA.L',
    market: 'LSE',
    currency: 'USD',
    amount: 0,
    quantity: 2,
    costBasisUnitPrice: null,
    manualPrice: null,
    valuationMode: 'live_preferred',
    notes: null,
  })
}

describe('quote staleness', () => {
  beforeEach(() => {
    globalThis.__TEST_RUNTIME_CONFIG = {
      databasePath: TEST_DB,
      vestoGoBaseUrl: 'http://localhost:8080',
    }

    resetTestDatabase(TEST_DB)
    initDbPlugin()
    restoreSnapshotCache()

    fetchQuoteBatch.mockReset()
    fetchUsdToSgdFx.mockReset()
    fetchUsdToSgdFx.mockResolvedValue(fxSnapshot())
  })

  it('downgrades a cached live quote when the next refresh fails', async () => {
    createInvestment()

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, quoteSnapshot()]]),
      errors: [],
      requested: 1,
    })

    const first = await buildBalanceSheet('always')
    expect(first.rows[0].source).toBe('live')
    expect(first.rows[0].usdAmount).toBe(200)

    fetchQuoteBatch.mockRejectedValueOnce(new Error('upstream down'))
    const second = await buildBalanceSheet('always')

    expect(second.rows[0].source).toBe('stale')
    expect(second.rows[0].usdAmount).toBe(200)
    expect(second.quoteSummary.stale).toBe(1)
    expect(second.warnings.some(warning => warning.includes('Quote batch fetch failed'))).toBe(true)
  })

  it('downgrades a cached live quote when the partial batch omits it', async () => {
    createInvestment()

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, quoteSnapshot()]]),
      errors: [],
      requested: 1,
    })

    await buildBalanceSheet('always')

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map(),
      errors: ['VWRA.L: symbol not found'],
      requested: 1,
    })

    const second = await buildBalanceSheet('always')

    expect(second.rows[0].source).toBe('stale')
    expect(second.rows[0].usdAmount).toBe(200)
    expect(second.warnings.some(warning => warning.includes('VWRA.L: symbol not found'))).toBe(true)
  })

  it('ignores a quote whose currency does not match the holding', async () => {
    createAsset({
      kind: 'investment',
      name: 'SGD holding',
      symbol: 'VWRA.L',
      market: 'LSE',
      currency: 'SGD',
      amount: 0,
      quantity: 2,
      costBasisUnitPrice: 100,
      manualPrice: 120,
      valuationMode: 'live_preferred',
      notes: null,
    })

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, { ...quoteSnapshot(), price: 150, currency: 'USD' }]]),
      errors: [],
      requested: 1,
    })

    const sheet = await buildBalanceSheet('always')
    const row = sheet.rows.find(item => item.name === 'SGD holding')

    expect(row?.source).toBe('manual')
    expect(row?.nativeCurrency).toBe('SGD')
    expect(row?.nativeAmount).toBe(240)
    expect(row?.currentUnitPrice).toBe(120)
    expect(row?.pnlSgd).toBeNull()
    expect(
      sheet.warnings.some(warning => warning.includes('USD quote') && warning.includes('SGD')),
    ).toBe(true)
  })

  it('computes P&L from cost basis, not the manual fallback price', async () => {
    createAsset({
      kind: 'investment',
      name: 'P&L ETF',
      symbol: 'VWRA.L',
      market: 'LSE',
      currency: 'USD',
      amount: 0,
      quantity: 2,
      costBasisUnitPrice: 100,
      manualPrice: 120,
      valuationMode: 'live_preferred',
      notes: null,
    })

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, { ...quoteSnapshot(), price: 150 }]]),
      errors: [],
      requested: 1,
    })

    const sheet = await buildBalanceSheet('always')
    const row = sheet.rows.find(item => item.name === 'P&L ETF')

    expect(row?.source).toBe('live')
    expect(row?.boughtUnitPrice).toBe(100)
    expect(row?.currentUnitPrice).toBe(150)
    expect(row?.costBasisNative).toBe(200)
    expect(row?.pnlNative).toBe(100)
    expect(row?.pnlUsd).toBe(100)
    expect(row?.pnlSgd).toBe(135)
  })
})
