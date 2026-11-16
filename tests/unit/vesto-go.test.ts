import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalCurrency,
  fetchQuoteBatch,
  normalizeVestoGoBaseUrl,
} from '~~/server/utils/vesto-go'

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
  it('accepts the two supported currencies', () => {
    expect(canonicalCurrency('USD')).toBe('USD')
    expect(canonicalCurrency(' usd ')).toBe('USD')
    expect(canonicalCurrency('SGD')).toBe('SGD')
  })

  it('never relabels another currency as USD or SGD', () => {
    for (const currency of ['GBp', 'GBP', 'HKD', 'EUR', 'JPY', '']) {
      expect(canonicalCurrency(currency)).toBeNull()
    }
  })
})

describe('fetchQuoteBatch currency handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubBatchResponse(currency: string, price: number) {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
      results: [
        {
          request: { symbol: 'VWRL.L', market: 'LSE' },
          status: 200,
          quote: {
            symbol: 'VWRL.L',
            market: 'LSE',
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

    stubBatchResponse('USD', 0)
    const rejected = await fetchQuoteBatch([{ symbol: 'VWRL.L', market: 'LSE' }])
    expect(rejected.byKey.size).toBe(0)
    expect(rejected.errors[0]).toContain('invalid quote price')
  })
})
