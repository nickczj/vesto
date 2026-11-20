export const SOURCE_STATES = [
  'disabled',
  'unconfigured',
  'no_traffic',
  'not_applicable',
  'live',
  'degraded',
  'failing',
] as const

export type SourceState = (typeof SOURCE_STATES)[number]

/**
 * Provider health is deliberately traffic-based. It answers "are the feeds
 * behind this page working", not "has this row got a price". Row valuation
 * state lives on `BalanceSheetRow.source`.
 */
export interface SourceHealth {
  name: string
  type: string
  mode: string
  state: SourceState
  enabled: boolean
  availability: string
  disabledReason: string | null
  markets: string[]
  instrumentTypes: string[]
  attempts: number
  successes: number
  failures: number
  providerFailures: number
  skipped: number
  successRate: number
  p95LatencyMs: number
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastSkippedAt: string | null
  lastError: string | null
  rateLimit: {
    limit: number
    remaining: number
    resetAt: string
    observedAt: string
  } | null
}

export interface SourceHealthSnapshot {
  asOf: string
  window: string
  markets: string[]
  sources: SourceHealth[]
  /**
   * True when vesto-go could not be reached. `sources` is then either the last
   * good read or empty when there has never been one.
   */
  isStale: boolean
}

/**
 * A provider status read that never reached vesto-go. Status is diagnostic, not
 * the page's data, so an outage is an empty stale snapshot rather than a
 * request failure the browser would report as a console error.
 */
export function unavailableSourceSnapshot(markets: string[]): SourceHealthSnapshot {
  return {
    asOf: '',
    window: '24h0m0s',
    markets,
    sources: [],
    isStale: true,
  }
}

export type OverallSourceState = SourceState | 'unavailable'

const OUT_OF_SCOPE_STATES = new Set<SourceState>(['disabled', 'unconfigured', 'not_applicable'])

/**
 * The header chip reports the worst state among providers that are actually
 * eligible. A disabled provider is not a fault, and a provider with no eligible
 * symbols says nothing about the providers that do cover the portfolio.
 */
export function overallSourceState(sources: SourceHealth[]): OverallSourceState {
  if (sources.length === 0) return 'unavailable'

  const inScope = sources.filter(source => !OUT_OF_SCOPE_STATES.has(source.state))
  if (inScope.length === 0) {
    if (sources.some(source => source.state === 'unconfigured')) return 'unconfigured'
    if (sources.some(source => source.state === 'disabled')) return 'disabled'
    return 'not_applicable'
  }

  if (inScope.some(source => source.state === 'failing')) return 'failing'
  if (inScope.some(source => source.state === 'degraded')) return 'degraded'
  if (inScope.some(source => source.state === 'live')) return 'live'
  return 'no_traffic'
}
