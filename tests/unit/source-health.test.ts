import { afterEach, describe, expect, it, vi } from 'vitest'
import { overallSourceState, unavailableSourceSnapshot, type SourceHealth } from '~~/shared/types/source-health'
import { fetchSourceHealth } from '~~/server/utils/vesto-go'

function makeSource(overrides: Partial<SourceHealth>): SourceHealth {
  return {
    name: 'test_source',
    type: 'api',
    mode: 'rest',
    state: 'live',
    enabled: true,
    availability: 'available',
    disabledReason: null,
    markets: [],
    instrumentTypes: [],
    attempts: 0,
    successes: 0,
    failures: 0,
    providerFailures: 0,
    skipped: 0,
    successRate: 0,
    p95LatencyMs: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastSkippedAt: null,
    lastError: null,
    rateLimit: null,
    ...overrides,
  }
}

describe('overall source state', () => {
  it('is unavailable when there are no sources', () => {
    expect(overallSourceState([])).toBe('unavailable')
  })

  it('ignores providers that are switched off or out of scope', () => {
    expect(overallSourceState([
      makeSource({ name: 'a', state: 'live' }),
      makeSource({ name: 'b', state: 'disabled' }),
      makeSource({ name: 'c', state: 'not_applicable' }),
    ])).toBe('live')
  })

  it('reports the worst in-scope state', () => {
    expect(overallSourceState([
      makeSource({ name: 'a', state: 'live' }),
      makeSource({ name: 'b', state: 'degraded' }),
    ])).toBe('degraded')

    expect(overallSourceState([
      makeSource({ name: 'a', state: 'degraded' }),
      makeSource({ name: 'b', state: 'failing' }),
    ])).toBe('failing')
  })

  it('does not call a provider with no eligible symbols dead', () => {
    expect(overallSourceState([
      makeSource({ name: 'a', state: 'live' }),
      makeSource({ name: 'b', state: 'not_applicable' }),
    ])).toBe('live')
  })

  it('falls back to the out-of-scope states when nothing is eligible', () => {
    expect(overallSourceState([
      makeSource({ name: 'a', state: 'disabled' }),
      makeSource({ name: 'b', state: 'not_applicable' }),
    ])).toBe('disabled')

    expect(overallSourceState([
      makeSource({ name: 'a', state: 'not_applicable' }),
    ])).toBe('not_applicable')

    expect(overallSourceState([
      makeSource({ name: 'a', state: 'unconfigured' }),
      makeSource({ name: 'b', state: 'disabled' }),
    ])).toBe('unconfigured')
  })
})

describe('unavailable source snapshot', () => {
  it('is an empty stale read, not a request failure', () => {
    const snapshot = unavailableSourceSnapshot(['LSE', 'NMS'])

    expect(snapshot).toMatchObject({
      asOf: '',
      window: '24h0m0s',
      markets: ['LSE', 'NMS'],
      sources: [],
      isStale: true,
    })
    expect(overallSourceState(snapshot.sources)).toBe('unavailable')
  })
})

describe('fetchSourceHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes the vesto-go payload and passes the held markets', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      as_of: '2026-11-16T13:50:17Z',
      window: '24h0m0s',
      markets: ['LSE', 'NMS'],
      sources: [
        {
          name: 'finnhub_api',
          type: 'api',
          mode: 'rest',
          state: 'live',
          enabled: true,
          availability: 'available',
          markets: ['US'],
          instrument_types: ['stock', 'etf'],
          attempts: 10,
          successes: 9,
          failures: 1,
          provider_failures: 0,
          skipped: 40,
          success_rate: 0.9,
          p95_latency_ms: 310.4,
          last_success_at: '2026-11-16T13:10:15Z',
          last_failure_at: null,
          last_skipped_at: '2026-11-16T13:08:43Z',
          rate_limit: {
            limit: 60,
            remaining: 58,
            reset_at: '2026-11-16T13:11:15Z',
            observed_at: '2026-11-16T13:10:15Z',
          },
        },
        {
          name: 'mystery_source',
          state: 'something_new',
        },
      ],
    })
    vi.stubGlobal('$fetch', fetchMock)

    const snapshot = await fetchSourceHealth(['nms', 'LSE', 'NMS'])

    expect(fetchMock).toHaveBeenCalledWith('/v1/sources', expect.objectContaining({
      query: { markets: 'LSE,NMS' },
    }))
    expect(snapshot.isStale).toBe(false)
    expect(snapshot.sources[0]).toMatchObject({
      name: 'finnhub_api',
      state: 'live',
      successRate: 0.9,
      p95LatencyMs: 310.4,
      instrumentTypes: ['stock', 'etf'],
      rateLimit: { limit: 60, remaining: 58 },
    })
    expect(snapshot.sources[1]).toMatchObject({
      name: 'mystery_source',
      state: 'no_traffic',
      enabled: true,
      markets: [],
    })
  })
})
