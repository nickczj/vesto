import type { SourceHealthSnapshot } from '~~/shared/types/source-health'
import { listAssets } from '~~/server/services/repository'
import { fetchSourceHealth } from '~~/server/utils/vesto-go'
import { classifyRequestFailure, describeRequestFailure } from '~~/shared/utils/request-failure'

const CACHE_TTL_MS = 60_000

interface SourceHealthCacheEntry {
  key: string
  snapshot: SourceHealthSnapshot
  cachedAt: number
}

let cache: SourceHealthCacheEntry | null = null

/** The markets the portfolio actually holds, so scope checks use the real set. */
function heldMarkets(): string[] {
  const markets = listAssets()
    .filter(asset => asset.kind === 'investment' && asset.market)
    .map(asset => String(asset.market).trim().toUpperCase())
    .filter(Boolean)

  return [...new Set(markets)].sort()
}

function parseMarkets(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  const markets = raw
    .split(',')
    .map(market => market.trim().toUpperCase())
    .filter(Boolean)

  return [...new Set(markets)].sort()
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const force = query.refresh === 'always'
  const markets = parseMarkets(query.markets) || heldMarkets()
  const key = markets.join(',')
  const now = Date.now()

  if (!force && cache && cache.key === key && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache.snapshot
  }

  try {
    const snapshot = await fetchSourceHealth(markets)
    cache = { key, snapshot, cachedAt: now }
    return snapshot
  }
  catch (error) {
    // A status chip is not worth a 500. If a previous read exists, label it
    // stale rather than showing nothing.
    if (cache && cache.key === key) {
      return { ...cache.snapshot, isStale: true }
    }

    // The raw error names an internal address; keep it in the log only.
    console.warn('[vesto] source status fetch failed:', error instanceof Error ? error.message : String(error))
    const reason = describeRequestFailure(classifyRequestFailure(error), 'the market-data service')
    throw createError({
      statusCode: 502,
      statusMessage: 'Source status unavailable',
      message: `Provider status is unavailable: ${reason}.`,
    })
  }
})
