import { describe, expect, it } from 'vitest'
import type { RequestFailure } from '~~/shared/utils/request-failure'
import { resolutionFromFailure, resolutionFromQuote } from '~~/server/utils/instrument-resolution'
import type { InstrumentQuoteSnapshot } from '~~/server/utils/vesto-go'

function quote(overrides: Partial<InstrumentQuoteSnapshot> = {}): InstrumentQuoteSnapshot {
  return {
    symbol: 'AAPL',
    market: 'NMS',
    instrumentType: 'stock',
    currency: 'USD',
    price: 228.5,
    asOf: '2026-11-17T10:00:00Z',
    fetchedAt: '2026-11-17T10:00:01Z',
    source: 'yahoo_scrape',
    isStale: false,
    ...overrides,
  }
}

describe('instrument resolution from a quote', () => {
  it('returns the resolved market, currency and price', () => {
    const result = resolutionFromQuote(quote())

    expect(result.status).toBe('resolved')
    expect(result.symbol).toBe('AAPL')
    expect(result.quote).toEqual({
      market: 'NMS',
      currency: 'USD',
      price: 228.5,
      asOf: '2026-11-17T10:00:00Z',
      source: 'yahoo_scrape',
    })
    expect(result.message).toContain('NMS')
    expect(result.message).toContain('USD')
  })

  it('resolves a HKD quote now that HKD is a supported currency', () => {
    const result = resolutionFromQuote(quote({
      symbol: '0700.HK',
      market: 'SEHK',
      currency: 'HKD',
      price: 600,
    }))

    expect(result.status).toBe('resolved')
    expect(result.quote?.currency).toBe('HKD')
    expect(result.message).toContain('HKD')
  })

  it('rejects a quote in a currency the sheet cannot value', () => {
    const result = resolutionFromQuote(quote({ currency: 'GBp' }))

    expect(result.status).toBe('not_found')
    expect(result.quote).toBeNull()
    expect(result.message).toContain('GBp')
    expect(result.message).toContain('HKD')
  })

  it('does not resolve to an unusable price', () => {
    expect(resolutionFromQuote(quote({ price: 0 })).status).toBe('unavailable')
    expect(resolutionFromQuote(quote({ price: Number.NaN })).status).toBe('unavailable')
  })
})

describe('instrument resolution from a failure', () => {
  function failure(kind: RequestFailure['kind'], status: number | null = null): RequestFailure {
    return { kind, status }
  }

  it('treats a missing symbol as definitive', () => {
    expect(resolutionFromFailure('NOPE', failure('http', 404)).status).toBe('not_found')
    expect(resolutionFromFailure('NOPE', failure('http', 400)).status).toBe('not_found')
  })

  it('separates a rate limit from an outage so a save is still possible', () => {
    expect(resolutionFromFailure('AAPL', failure('http', 429)).status).toBe('rate_limited')
    expect(resolutionFromFailure('AAPL', failure('unreachable')).status).toBe('unavailable')
    expect(resolutionFromFailure('AAPL', failure('http', 502)).status).toBe('unavailable')
  })
})
