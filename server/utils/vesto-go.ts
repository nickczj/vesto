import { existsSync } from 'node:fs'
import type { CurrencyCode, FxSnapshot, QuoteSnapshot } from '~~/shared/types/balance-sheet'

const REQUEST_TIMEOUT_MS = 20_000

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

export interface QuoteBatchFetchResult {
  byKey: Map<string, QuoteSnapshot>
  errors: string[]
  requested: number
}

export interface QuoteLookupItem {
  symbol: string
  market?: string | null
}

function canonicalCurrency(raw: string): CurrencyCode {
  const normalized = raw.trim().toUpperCase()
  return normalized === 'SGD' ? 'SGD' : 'USD'
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

async function withRetry<T>(work: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await work()
    }
    catch (error) {
      lastError = error
      if (attempt === retries) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
    }
  }

  throw lastError
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

  const response = await withRetry(async () => {
    return await $fetch<LatestQuoteBatchResponse>('/v1/quotes/latest/batch', {
      baseURL: getBaseUrl(),
      method: 'POST',
      body,
      retry: 0,
      timeout: REQUEST_TIMEOUT_MS,
    })
  }, 1)

  const byKey = new Map<string, QuoteSnapshot>()
  const errors: string[] = []

  for (const result of response.results || []) {
    const key = buildQuoteCacheKey(result.request.symbol, result.request.market)

    if (result.status >= 200 && result.status < 300 && result.quote) {
      byKey.set(key, {
        symbol: result.quote.symbol,
        market: result.quote.market || null,
        currency: canonicalCurrency(result.quote.currency),
        price: Number(result.quote.price),
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

export async function fetchUsdToSgdFx(): Promise<FxSnapshot> {
  const payload = await withRetry(async () => {
    return await $fetch<FxRateResponse>('/api/market/fx', {
      baseURL: getBaseUrl(),
      query: {
        base: 'USD',
        quote: 'SGD',
      },
      retry: 0,
      timeout: REQUEST_TIMEOUT_MS,
    })
  }, 1)

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
