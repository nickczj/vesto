import { existsSync } from 'node:fs'
import type { CurrencyCode, FxSnapshot, QuoteSnapshot } from '~~/shared/types/balance-sheet'
import {
  SOURCE_STATES,
  type SourceHealth,
  type SourceHealthSnapshot,
  type SourceState,
} from '~~/shared/types/source-health'

const FX_REQUEST_TIMEOUT_MS = 8_000
const QUOTE_BATCH_REQUEST_TIMEOUT_MS = 12_000
const SOURCE_HEALTH_REQUEST_TIMEOUT_MS = 5_000

interface LatestQuoteBatchRequestItem {
  symbol: string
  market?: string
}

interface LatestQuoteBatchRequest {
  items: LatestQuoteBatchRequestItem[]
}

interface LatestQuoteResponse {
  symbol: string
  market: string
  currency: string
  price: number
  as_of: string
  fetched_at: string
  source: string
  is_stale: boolean
}

interface LatestQuoteBatchResult {
  request: LatestQuoteBatchRequestItem
  status: number
  quote?: LatestQuoteResponse
  error?: string
}

interface LatestQuoteBatchResponse {
  results: LatestQuoteBatchResult[]
}

interface FxRateResponse {
  base: string
  quote: string
  rate: number
  asOf: string
  source: string
  isStale?: boolean
}

interface SourceHealthWireItem {
  name: string
  type?: string
  mode?: string
  state?: string
  enabled?: boolean
  availability?: string
  disabled_reason?: string
  markets?: string[]
  instrument_types?: string[]
  attempts?: number
  successes?: number
  failures?: number
  provider_failures?: number
  skipped?: number
  success_rate?: number
  p95_latency_ms?: number
  last_success_at?: string | null
  last_failure_at?: string | null
  last_skipped_at?: string | null
  last_error?: string
  rate_limit?: {
    limit?: number
    remaining?: number
    reset_at?: string
    observed_at?: string
  }
}

interface SourceHealthWireResponse {
  as_of?: string
  window?: string
  markets?: string[]
  sources?: SourceHealthWireItem[]
}

export interface QuoteBatchFetchResult {
  byKey: Map<string, QuoteSnapshot>
  errors: string[]
  requested: number
}

export interface QuoteLookupItem {
  symbol: string
  market?: string | null
}

export function canonicalCurrency(raw: string): CurrencyCode | null {
  switch (raw.trim().toUpperCase()) {
    case 'USD':
      return 'USD'
    case 'SGD':
      return 'SGD'
    default:
      return null
  }
}

export function buildQuoteCacheKey(symbol: string, market?: string | null): string {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const normalizedMarket = (market || '').trim().toUpperCase()
  return `${normalizedSymbol}::${normalizedMarket}`
}

export function normalizeVestoGoBaseUrl(baseUrl: string, isDockerRuntime: boolean): string {
  const trimmed = baseUrl.trim()
  if (!trimmed || isDockerRuntime) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    if (url.hostname === 'vesto-api') {
      url.hostname = '127.0.0.1'
      return url.toString().replace(/\/$/, '')
    }
  }
  catch {
    return trimmed
  }

  return trimmed
}

function getBaseUrl(): string {
  const config = useRuntimeConfig()
  const baseUrl = String(config.vestoGoBaseUrl || '').trim() || 'http://localhost:8080'
  return normalizeVestoGoBaseUrl(baseUrl, existsSync('/.dockerenv'))
}

export async function fetchQuoteBatch(items: QuoteLookupItem[]): Promise<QuoteBatchFetchResult> {
  const normalizedItems = items
    .map(item => ({
      symbol: item.symbol.trim().toUpperCase(),
      market: item.market?.trim().toUpperCase() || undefined,
    }))
    .filter(item => item.symbol)

  if (normalizedItems.length === 0) {
    return {
      byKey: new Map(),
      errors: [],
      requested: 0,
    }
  }

  const body: LatestQuoteBatchRequest = {
    items: normalizedItems,
  }

  const response = await $fetch<LatestQuoteBatchResponse>('/v1/quotes/latest/batch', {
    baseURL: getBaseUrl(),
    method: 'POST',
    body,
    retry: 0,
    timeout: QUOTE_BATCH_REQUEST_TIMEOUT_MS,
  })

  const byKey = new Map<string, QuoteSnapshot>()
  const errors: string[] = []

  for (const result of response.results || []) {
    const key = buildQuoteCacheKey(result.request.symbol, result.request.market)

    if (result.status >= 200 && result.status < 300 && result.quote) {
      const currency = canonicalCurrency(result.quote.currency)
      if (!currency) {
        errors.push(
          `${result.request.symbol}: unsupported quote currency ${result.quote.currency || '(empty)'}`,
        )
        continue
      }

      const price = Number(result.quote.price)
      if (!Number.isFinite(price) || price <= 0) {
        errors.push(`${result.request.symbol}: invalid quote price`)
        continue
      }

      byKey.set(key, {
        symbol: result.quote.symbol,
        market: result.quote.market || null,
        currency,
        price,
        asOf: result.quote.as_of,
        fetchedAt: result.quote.fetched_at,
        source: result.quote.source,
        isStale: Boolean(result.quote.is_stale),
      })
      continue
    }

    errors.push(`${result.request.symbol}: ${result.error || `status ${result.status}`}`)
  }

  return {
    byKey,
    errors,
    requested: normalizedItems.length,
  }
}

function normalizeSourceState(raw: string | undefined): SourceState {
  const normalized = (raw || '').trim().toLowerCase()
  return (SOURCE_STATES as readonly string[]).includes(normalized)
    ? normalized as SourceState
    : 'no_traffic'
}

function normalizeSourceHealth(item: SourceHealthWireItem): SourceHealth {
  const state = normalizeSourceState(item.state)

  return {
    name: item.name,
    type: item.type || 'unknown',
    mode: item.mode || 'unknown',
    state,
    enabled: item.enabled ?? (state !== 'disabled' && state !== 'unconfigured'),
    availability: item.availability || '',
    disabledReason: item.disabled_reason || null,
    markets: item.markets || [],
    instrumentTypes: item.instrument_types || [],
    attempts: Number(item.attempts) || 0,
    successes: Number(item.successes) || 0,
    failures: Number(item.failures) || 0,
    providerFailures: Number(item.provider_failures) || 0,
    skipped: Number(item.skipped) || 0,
    successRate: Math.min(1, Math.max(0, Number(item.success_rate) || 0)),
    p95LatencyMs: Number(item.p95_latency_ms) || 0,
    lastSuccessAt: item.last_success_at || null,
    lastFailureAt: item.last_failure_at || null,
    lastSkippedAt: item.last_skipped_at || null,
    lastError: item.last_error || null,
    rateLimit: item.rate_limit
      ? {
          limit: Number(item.rate_limit.limit) || 0,
          remaining: Number(item.rate_limit.remaining) || 0,
          resetAt: item.rate_limit.reset_at || '',
          observedAt: item.rate_limit.observed_at || '',
        }
      : null,
  }
}

/**
 * Read provider health from vesto-go. `markets` is the set the portfolio
 * actually holds, so a provider that does not cover them reports
 * `not_applicable` instead of looking dead.
 */
export async function fetchSourceHealth(markets?: string[]): Promise<SourceHealthSnapshot> {
  const query: Record<string, string> = {}
  const normalizedMarkets = (markets || [])
    .map(market => market.trim().toUpperCase())
    .filter(Boolean)

  if (normalizedMarkets.length > 0) {
    query.markets = [...new Set(normalizedMarkets)].sort().join(',')
  }

  const payload = await $fetch<SourceHealthWireResponse>('/v1/sources', {
    baseURL: getBaseUrl(),
    query,
    retry: 0,
    timeout: SOURCE_HEALTH_REQUEST_TIMEOUT_MS,
  })

  return {
    asOf: payload.as_of || new Date().toISOString(),
    window: payload.window || '24h0m0s',
    markets: payload.markets || [],
    sources: (payload.sources || []).map(normalizeSourceHealth),
    isStale: false,
  }
}

export async function fetchUsdToSgdFx(): Promise<FxSnapshot> {
  const payload = await $fetch<FxRateResponse>('/api/market/fx', {
    baseURL: getBaseUrl(),
    query: {
      base: 'USD',
      quote: 'SGD',
    },
    retry: 0,
    timeout: FX_REQUEST_TIMEOUT_MS,
  })

  const usdToSgd = Number(payload.rate)
  if (!Number.isFinite(usdToSgd) || usdToSgd <= 0) {
    throw createError({ statusCode: 502, message: 'invalid USD/SGD FX response' })
  }

  return {
    base: 'USD',
    quote: 'SGD',
    usdToSgd,
    sgdToUsd: 1 / usdToSgd,
    asOf: payload.asOf,
    fetchedAt: new Date().toISOString(),
    source: payload.source,
    isStale: payload.isStale === true,
  }
}
