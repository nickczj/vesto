import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalCurrency,
  fetchFxRatesToSgd,
  fetchQuoteBatch,
  normalizeVestoGoBaseUrl,
} from '~~/server/utils/vesto-go'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vesto-go base URL normalization', () => {
  it('rewrites the Docker service hostname to localhost for host-side runtimes', () => {
    expect(normalizeVestoGoBaseUrl('http://vesto-api:8080', false)).toBe('http://127.0.0.1:8080')
  })

  it('keeps the Docker service hostname when running inside Docker', () => {
    expect(normalizeVestoGoBaseUrl('http://vesto-api:8080', true)).toBe('http://vesto-api:8080')
  })

  it('leaves other hostnames unchanged', () => {
    expect(normalizeVestoGoBaseUrl('http://localhost:8080', false)).toBe('http://localhost:8080')
  })
})

describe('currency canonicalization', () => {
  it('accepts the supported currencies', () => {
    expect(canonicalCurrency('USD')).toBe('USD')
    expect(canonicalCurrency(' usd ')).toBe('USD')
    expect(canonicalCurrency('SGD')).toBe('SGD')
    expect(canonicalCurrency(' hkd ')).toBe('HKD')
  })

  it('never relabels another currency as a supported one', () => {
    for (const currency of ['GBp', 'GBP', 'EUR', 'JPY', '']) {
      expect(canonicalCurrency(currency)).toBeNull()
    }
  })
})

describe('fetchQuoteBatch currency handling', () => {
  function stubBatchResponse(currency: string, price: number, symbol = 'VWRL.L', market = 'LSE') {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      results: [
        {
          request: { symbol, market },
          status: 200,
          quote: {
            symbol,
            market,
            currency,
            price,
            as_of: '2026-11-16T10:00:00Z',
            fetched_at: '2026-11-16T10:00:01Z',
            source: 'test',
            is_stale: false,
          },
        },
      ],
    }))
  }

  it('turns a pence-quoted instrument into a per-symbol error instead of valuing it as USD', async () => {
    stubBatchResponse('GBp', 9000)

    const result = await fetchQuoteBatch([{ symbol: 'VWRL.L', market: 'LSE' }])

    expect(result.byKey.size).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('GBp')
  })

  it('keeps supported quotes and rejects non-positive prices', async () => {
    stubBatchResponse('USD', 100)
    const accepted = await fetchQuoteBatch([{ symbol: 'VWRL.L', market: 'LSE' }])
    expect(accepted.byKey.get('VWRL.L::LSE')?.price).toBe(100)

    stubBatchResponse('HKD', 600, '0700.HK', 'SEHK')
    const hkd = await fetchQuoteBatch([{ symbol: '0700.HK', market: 'SEHK' }])
    expect(hkd.byKey.get('0700.HK::SEHK')?.currency).toBe('HKD')
    expect(hkd.errors).toEqual([])

    stubBatchResponse('USD', 0)
    const rejected = await fetchQuoteBatch([{ symbol: 'VWRL.L', market: 'LSE' }])
    expect(rejected.byKey.size).toBe(0)
    expect(rejected.errors[0]).toContain('invalid quote price')
  })
})

describe('fetchFxRatesToSgd', () => {
  it('returns SGD per unit for each pair and keeps a failed pair an error', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      quote: 'SGD',
      results: [
        {
          base: 'USD',
          status: 200,
          rate: {
            base: 'USD',
            quote: 'SGD',
            rate: 1.2888,
            asOf: '2026-11-16',
            source: 'frankfurter',
            isStale: false,
          },
        },
        {
          base: 'HKD',
          status: 200,
          rate: {
            base: 'HKD',
            quote: 'SGD',
            rate: 0.16424,
            asOf: '2026-11-16',
            source: 'frankfurter',
            isStale: false,
          },
        },
      ],
    }))

    const rates = await fetchFxRatesToSgd(['USD', 'HKD', 'SGD'])

    expect(rates.sgdPerUnit).toEqual({ USD: 1.2888, HKD: 0.16424 })
    expect(rates.errors).toEqual([])
    expect(rates.asOf).toBe('2026-11-16')
    expect(rates.source).toBe('frankfurter')
  })

  it('reports a rate the service could not price instead of dropping it silently', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      quote: 'SGD',
      results: [
        {
          base: 'USD',
          status: 200,
          rate: {
            base: 'USD',
            quote: 'SGD',
            rate: 1.2888,
            asOf: '2026-11-16',
            source: 'frankfurter',
            isStale: false,
          },
        },
        { base: 'HKD', status: 404, error: 'fx rate not found' },
      ],
    }))

    const rates = await fetchFxRatesToSgd(['USD', 'HKD'])

    expect(rates.sgdPerUnit).toEqual({ USD: 1.2888 })
    expect(rates.errors).toEqual([{ currency: 'HKD', message: 'fx rate not found' }])
  })
})
