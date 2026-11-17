import { beforeEach, describe, expect, it, vi } from 'vitest'
import initDbPlugin from '~~/server/plugins/db-init'
import { buildBalanceSheet, restoreSnapshotCache } from '~~/server/services/balance-sheet'
import { createAsset } from '~~/server/services/repository'
import type { QuoteSnapshot } from '~~/shared/types/balance-sheet'
import type { FxRateSet } from '~~/server/utils/vesto-go'
import { resetTestDatabase } from './setup'

const { fetchQuoteBatch, fetchFxRatesToSgd } = vi.hoisted(() => ({
  fetchQuoteBatch: vi.fn(),
  fetchFxRatesToSgd: vi.fn(),
}))

vi.mock('~~/server/utils/vesto-go', () => ({
  buildQuoteCacheKey: (symbol: string, market?: string | null) =>
    `${symbol.trim().toUpperCase()}::${(market || '').trim().toUpperCase()}`,
  fetchQuoteBatch,
  fetchFxRatesToSgd,
}))

const TEST_DB = '/tmp/vesto-v2-quote-staleness-test.db'
const QUOTE_KEY = 'VWRA.L::LSE'

function fxRateSet(): FxRateSet {
  return {
    sgdPerUnit: { USD: 1.35, HKD: 0.164 },
    errors: [],
    asOf: '2026-11-16',
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

/** What `ofetch` throws when vesto-go does not answer. */
function noResponse(): Error {
  const error = new Error('[POST] "http://127.0.0.1:8080/v1/quotes/latest/batch": <no response> fetch failed')
  error.name = 'FetchError'
  return error
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
    fetchFxRatesToSgd.mockReset()
    fetchFxRatesToSgd.mockResolvedValue(fxRateSet())
    // The service logs the raw upstream error; keep the test output quiet.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    expect(second.warnings.some(warning => warning.startsWith('Prices not refreshed'))).toBe(true)
  })

  it('reports when prices were last fetched, not when the page was last built', async () => {
    createInvestment()

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, quoteSnapshot()]]),
      errors: [],
      requested: 1,
    })

    const first = await buildBalanceSheet('always')
    expect(first.marketData.status).toBe('ok')
    expect(first.marketData.quotesFetchedAt).not.toBeNull()

    await new Promise(resolve => setTimeout(resolve, 15))

    fetchQuoteBatch.mockRejectedValueOnce(noResponse())
    const second = await buildBalanceSheet('always')

    // The response is newer; the prices are not.
    expect(Date.parse(second.generatedAt)).toBeGreaterThan(Date.parse(first.generatedAt))
    expect(second.marketData.quotesFetchedAt).toBe(first.marketData.quotesFetchedAt)
    expect(second.marketData.status).toBe('unreachable')
    expect(Date.parse(second.marketData.checkedAt!)).toBeGreaterThan(Date.parse(first.marketData.checkedAt!))
  })

  it('keeps reporting an unreachable service on responses that make no attempt', async () => {
    createInvestment()

    fetchQuoteBatch.mockRejectedValueOnce(noResponse())
    const failed = await buildBalanceSheet('always')
    expect(failed.marketData.status).toBe('unreachable')
    expect(failed.marketData.quotesFetchedAt).toBeNull()

    const cached = await buildBalanceSheet('never')
    expect(fetchQuoteBatch).toHaveBeenCalledTimes(1)
    expect(cached.marketData.status).toBe('unreachable')

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, quoteSnapshot()]]),
      errors: [],
      requested: 1,
    })
    const recovered = await buildBalanceSheet('always')
    expect(recovered.marketData.status).toBe('ok')
  })

  it('tells an unreachable service apart from one that answered badly', async () => {
    createInvestment()

    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map(),
      errors: ['VWRA.L: symbol not found'],
      requested: 1,
    })
    expect((await buildBalanceSheet('always')).marketData.status).toBe('degraded')

    fetchQuoteBatch.mockRejectedValueOnce(Object.assign(new Error('bad gateway'), { status: 502 }))
    expect((await buildBalanceSheet('always')).marketData.status).toBe('degraded')

    fetchFxRatesToSgd.mockRejectedValueOnce(noResponse())
    fetchQuoteBatch.mockResolvedValueOnce({
      byKey: new Map([[QUOTE_KEY, quoteSnapshot()]]),
      errors: [],
      requested: 1,
    })
    expect((await buildBalanceSheet('always')).marketData.status).toBe('unreachable')
  })

  it('writes warnings a person can read, without the internal address', async () => {
    createInvestment()

    fetchQuoteBatch.mockRejectedValueOnce(noResponse())
    fetchFxRatesToSgd.mockRejectedValueOnce(noResponse())
    const sheet = await buildBalanceSheet('always')

    expect(sheet.warnings).toContain(
      'Exchange rate unavailable: the market-data service did not respond. USD/SGD totals are hidden.',
    )
    expect(sheet.warnings.some(warning => warning.startsWith(
      'Prices not refreshed: the market-data service did not respond.',
    ))).toBe(true)
    for (const warning of sheet.warnings) {
      expect(warning).not.toMatch(/127\.0\.0\.1|http:|\[POST\]|<no response>/)
    }
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
