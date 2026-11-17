import {
  type AssetEntry,
  type BalanceSection,
  type BalanceSheetResponse,
  type BalanceSheetRow,
  type CurrencyCode,
  type FxSnapshot,
  type MarketDataState,
  type MarketDataStatus,
  type QuoteSnapshot,
  type RefreshMode,
  LIVE_REFRESH_INTERVAL_MS,
} from '~~/shared/types/balance-sheet'
import {
  classifyRequestFailure,
  describeRequestFailure,
  isUnreachable,
} from '~~/shared/utils/request-failure'
import { listAssets, listLiabilities, updateAssetMarket } from '~~/server/services/repository'
import {
  loadCachedFx,
  loadCachedQuotes,
  saveCachedFx,
  saveCachedQuotes,
} from '~~/server/services/snapshot-cache'
import {
  buildQuoteCacheKey,
  fetchQuoteBatch,
  fetchUsdToSgdFx,
  type QuoteBatchFetchResult,
  type QuoteLookupItem,
} from '~~/server/utils/vesto-go'
import {
  accumulateTotals,
  convertNativeAmount,
  roundMoney,
  roundRate,
} from '~~/server/services/valuation'

const CACHE_TTL_MS = LIVE_REFRESH_INTERVAL_MS

type QuoteCacheEntry = {
  snapshot: QuoteSnapshot
  cachedAt: number
}

type FxCacheEntry = {
  snapshot: FxSnapshot
  cachedAt: number
}

const MARKET_DATA_SERVICE = 'the market-data service'

/** The outcome of one attempt to reach vesto-go. */
type UpstreamOutcome = {
  result: 'ok' | 'partial' | 'failed' | 'unreachable'
  at: number
}

const quoteCache = new Map<string, QuoteCacheEntry>()
let fxCache: FxCacheEntry | null = null
// Remembered across requests: a `never` or cache-hit response makes no attempt
// of its own, and must still say that the last one found nobody home.
let lastQuoteOutcome: UpstreamOutcome | null = null
let lastFxOutcome: UpstreamOutcome | null = null
let inflightFxSnapshot: Promise<FxSnapshot> | null = null
const inflightQuoteFetches = new Map<string, Promise<QuoteBatchFetchResult>>()

function isFresh(cachedAt: number, now = Date.now()): boolean {
  return now - cachedAt <= CACHE_TTL_MS
}

function sectionForAsset(kind: AssetEntry['kind']): BalanceSection {
  if (kind === 'cpf') return 'cpf'
  if (kind === 'cash_savings') return 'cash_savings'
  return 'investments'
}

/**
 * Load the last-known snapshots persisted in `app_settings`. Everything
 * restored is marked stale: it may be seconds or days old and has not been
 * revalidated by an upstream source since the process started.
 */
export function restoreSnapshotCache(): void {
  quoteCache.clear()
  fxCache = null
  lastQuoteOutcome = null
  lastFxOutcome = null

  for (const record of loadCachedQuotes()) {
    quoteCache.set(record.key, {
      snapshot: { ...record.snapshot, isStale: true },
      cachedAt: record.cachedAt,
    })
  }

  const persistedFx = loadCachedFx()
  if (persistedFx) {
    fxCache = {
      snapshot: { ...persistedFx.snapshot, isStale: true },
      cachedAt: persistedFx.cachedAt,
    }
  }
}

let snapshotCacheWriteWarned = false

function warnSnapshotCacheWrite(error: unknown): void {
  if (snapshotCacheWriteWarned) return
  snapshotCacheWriteWarned = true
  console.warn('[vesto] snapshot cache write failed:', error)
}

function persistQuoteCache(): void {
  try {
    saveCachedQuotes(
      [...quoteCache.entries()].map(([key, entry]) => ({
        key,
        snapshot: entry.snapshot,
        cachedAt: entry.cachedAt,
      })),
    )
  }
  catch (error) {
    warnSnapshotCacheWrite(error)
  }
}

function persistFxCache(entry: FxCacheEntry, savedAt: number): void {
  try {
    saveCachedFx(entry, savedAt)
  }
  catch (error) {
    warnSnapshotCacheWrite(error)
  }
}

function markQuoteSnapshotStale(cacheKey: string, byKey: Map<string, QuoteSnapshot>): void {
  const cached = quoteCache.get(cacheKey)
  if (!cached) return

  const stale: QuoteSnapshot = cached.snapshot.isStale
    ? cached.snapshot
    : { ...cached.snapshot, isStale: true }

  quoteCache.set(cacheKey, { snapshot: stale, cachedAt: cached.cachedAt })
  byKey.set(cacheKey, stale)

  const resolvedKey = resolvedQuoteCacheKey(stale)
  if (resolvedKey !== cacheKey) {
    quoteCache.set(resolvedKey, { snapshot: stale, cachedAt: cached.cachedAt })
    byKey.set(resolvedKey, stale)
  }
}

function resolvedQuoteCacheKey(snapshot: QuoteSnapshot): string {
  return buildQuoteCacheKey(snapshot.symbol, snapshot.market)
}

function rememberQuoteSnapshot(
  cacheKey: string,
  snapshot: QuoteSnapshot,
  byKey?: Map<string, QuoteSnapshot>,
  cachedAt?: number,
) {
  if (byKey) {
    byKey.set(cacheKey, snapshot)
  }

  if (typeof cachedAt === 'number') {
    quoteCache.set(cacheKey, {
      snapshot,
      cachedAt,
    })
  }

  const resolvedKey = resolvedQuoteCacheKey(snapshot)
  if (resolvedKey === cacheKey) {
    return
  }

  if (byKey) {
    byKey.set(resolvedKey, snapshot)
  }

  if (typeof cachedAt === 'number') {
    quoteCache.set(resolvedKey, {
      snapshot,
      cachedAt,
    })
  }
}

function backfillResolvedAssetMarkets(
  assets: AssetEntry[],
  quoteByKey: Map<string, QuoteSnapshot>,
  warnings: string[],
) {
  for (const asset of assets) {
    if (asset.kind !== 'investment' || !asset.symbol) continue

    const quote = quoteByKey.get(buildQuoteCacheKey(asset.symbol, asset.market))
    const resolvedMarket = quote?.market?.trim().toUpperCase()
    const currentMarket = asset.market?.trim().toUpperCase() || null
    if (!resolvedMarket || resolvedMarket === currentMarket) continue

    try {
      asset.market = resolvedMarket
      updateAssetMarket(asset.id, resolvedMarket)
    }
    catch (error) {
      warnings.push(
        `Failed to persist resolved market for ${asset.symbol}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

async function resolveFxSnapshot(refreshMode: RefreshMode, warnings: string[]): Promise<FxSnapshot | null> {
  const now = Date.now()

  if (refreshMode === 'never') {
    if (fxCache) return fxCache.snapshot

    warnings.push('FX rate unavailable: no cached USD/SGD rate has been stored yet.')
    return null
  }

  if (refreshMode === 'stale' && fxCache && isFresh(fxCache.cachedAt, now)) {
    return fxCache.snapshot
  }

  try {
    if (!inflightFxSnapshot) {
      inflightFxSnapshot = (async () => {
        const freshSnapshot = await fetchUsdToSgdFx()
        const normalized: FxSnapshot = {
          ...freshSnapshot,
          usdToSgd: roundRate(freshSnapshot.usdToSgd),
          sgdToUsd: roundRate(freshSnapshot.sgdToUsd),
        }

        const entry: FxCacheEntry = {
          snapshot: normalized,
          cachedAt: now,
        }
        fxCache = entry
        persistFxCache(entry, now)
        lastFxOutcome = { result: 'ok', at: now }

        return normalized
      })().finally(() => {
        inflightFxSnapshot = null
      })
    }

    return await inflightFxSnapshot
  }
  catch (error) {
    const failure = classifyRequestFailure(error)
    const reason = describeRequestFailure(failure, MARKET_DATA_SERVICE)
    lastFxOutcome = { result: isUnreachable(failure) ? 'unreachable' : 'failed', at: now }
    logUpstreamFailure('FX fetch', error)

    if (fxCache) {
      warnings.push(`Exchange rate not refreshed: ${reason}. Using the last known USD/SGD rate.`)
      return {
        ...fxCache.snapshot,
        isStale: true,
      }
    }

    warnings.push(`Exchange rate unavailable: ${reason}. USD/SGD totals are hidden.`)
    return null
  }
}

async function resolveQuoteSnapshots(
  assets: AssetEntry[],
  refreshMode: RefreshMode,
  warnings: string[],
): Promise<{
  byKey: Map<string, QuoteSnapshot>
  requested: number
  /** Newest time a quote for this portfolio arrived; null when none has. */
  fetchedAt: number | null
}> {
  const lookupItems: QuoteLookupItem[] = []
  const uniqueKeys = new Set<string>()

  for (const asset of assets) {
    if (asset.kind !== 'investment' || !asset.symbol) continue

    // A manual_only holding is always valued from its manual price, so a quote
    // for it can never be used. Fetching one only adds upstream calls and a
    // "quote currency not supported" warning for a row that never reads it.
    if (asset.valuationMode === 'manual_only') continue

    const key = buildQuoteCacheKey(asset.symbol, asset.market)
    if (uniqueKeys.has(key)) continue

    uniqueKeys.add(key)
    lookupItems.push({
      symbol: asset.symbol,
      market: asset.market,
    })
  }

  const byKey = new Map<string, QuoteSnapshot>()
  const now = Date.now()
  const fetchItems: QuoteLookupItem[] = []

  for (const item of lookupItems) {
    const key = buildQuoteCacheKey(item.symbol, item.market)
    const cached = quoteCache.get(key)

    if (cached) {
      rememberQuoteSnapshot(key, cached.snapshot, byKey, cached.cachedAt)
    }

    if (refreshMode === 'never') {
      continue
    }

    if (refreshMode === 'stale' && cached && isFresh(cached.cachedAt, now)) {
      continue
    }

    fetchItems.push(item)
  }

  if (fetchItems.length === 0) {
    backfillResolvedAssetMarkets(assets, byKey, warnings)

    return {
      byKey,
      requested: lookupItems.length,
      fetchedAt: newestQuoteFetch(lookupItems),
    }
  }

  try {
    const inflightKey = fetchItems
      .map(item => buildQuoteCacheKey(item.symbol, item.market))
      .sort()
      .join('|')

    let inflightFetch = inflightQuoteFetches.get(inflightKey)
    if (!inflightFetch) {
      inflightFetch = fetchQuoteBatch(fetchItems).finally(() => {
        inflightQuoteFetches.delete(inflightKey)
      })
      inflightQuoteFetches.set(inflightKey, inflightFetch)
    }

    const fetched = await inflightFetch

    for (const [key, snapshot] of fetched.byKey.entries()) {
      rememberQuoteSnapshot(key, snapshot, byKey, now)
    }

    if (fetched.errors.length > 0) {
      warnings.push(`Some prices were not refreshed: ${fetched.errors.join('; ')}`)
    }

    lastQuoteOutcome = { result: fetched.errors.length > 0 ? 'partial' : 'ok', at: now }

    // Anything we asked for but did not get back is still showing the previous
    // snapshot. It must not keep the "live" label it earned on an earlier fetch.
    for (const item of fetchItems) {
      const key = buildQuoteCacheKey(item.symbol, item.market)
      if (!fetched.byKey.has(key)) {
        markQuoteSnapshotStale(key, byKey)
      }
    }
  }
  catch (error) {
    const failure = classifyRequestFailure(error)
    const reason = describeRequestFailure(failure, MARKET_DATA_SERVICE)
    lastQuoteOutcome = { result: isUnreachable(failure) ? 'unreachable' : 'failed', at: now }
    logUpstreamFailure('Quote batch fetch', error)
    warnings.push(
      `Prices not refreshed: ${reason}. Showing the last fetched prices; holdings without one fall back to their manual price.`,
    )

    for (const item of fetchItems) {
      markQuoteSnapshotStale(buildQuoteCacheKey(item.symbol, item.market), byKey)
    }
  }

  persistQuoteCache()
  backfillResolvedAssetMarkets(assets, byKey, warnings)

  return {
    byKey,
    requested: lookupItems.length,
    fetchedAt: newestQuoteFetch(lookupItems),
  }
}

/**
 * The cache only records a time when a quote actually arrives, so the newest
 * `cachedAt` is the last time prices were fetched. A failed refresh leaves it
 * where it was.
 */
function newestQuoteFetch(items: QuoteLookupItem[]): number | null {
  let newest: number | null = null

  for (const item of items) {
    const cachedAt = quoteCache.get(buildQuoteCacheKey(item.symbol, item.market))?.cachedAt
    if (typeof cachedAt === 'number' && (newest === null || cachedAt > newest)) {
      newest = cachedAt
    }
  }

  return newest
}

// The page gets a plain sentence; the detail a developer needs stays in the log.
function logUpstreamFailure(what: string, error: unknown): void {
  console.warn(`[vesto] ${what} failed:`, error instanceof Error ? error.message : String(error))
}

function marketDataStatus(): MarketDataStatus {
  const results = [lastQuoteOutcome, lastFxOutcome]
    .filter((outcome): outcome is UpstreamOutcome => outcome !== null)
    .map(outcome => outcome.result)

  if (results.length === 0) return 'unknown'
  if (results.includes('unreachable')) return 'unreachable'
  if (results.includes('failed') || results.includes('partial')) return 'degraded'
  return 'ok'
}

function marketDataState(quotesFetchedAt: number | null): MarketDataState {
  const attempts = [lastQuoteOutcome?.at, lastFxOutcome?.at]
    .filter((at): at is number => typeof at === 'number')

  return {
    status: marketDataStatus(),
    quotesFetchedAt: quotesFetchedAt === null ? null : new Date(quotesFetchedAt).toISOString(),
    checkedAt: attempts.length === 0 ? null : new Date(Math.max(...attempts)).toISOString(),
  }
}

function buildAssetRow(
  asset: AssetEntry,
  quoteByKey: Map<string, QuoteSnapshot>,
  fx: FxSnapshot | null,
  warnings: string[],
): BalanceSheetRow {
  const section = sectionForAsset(asset.kind)

  let nativeAmount = 0
  let source: BalanceSheetRow['source'] = 'book'
  let asOf: string | null = null
  let boughtUnitPrice: number | null = null
  let currentUnitPrice: number | null = null
  let costBasisNative: number | null = null
  let costBasisUsd: number | null = null
  let costBasisSgd: number | null = null
  let pnlNative: number | null = null
  let pnlUsd: number | null = null
  let pnlSgd: number | null = null
  let resolvedMarket = asset.market
  let hasMarketPrice = false
  let provider: string | null = null
  const nativeCurrency: CurrencyCode = asset.currency

  if (asset.kind === 'investment') {
    const quantity = asset.quantity || 0
    boughtUnitPrice = asset.costBasisUnitPrice ?? null
    const quoteKey = asset.symbol ? buildQuoteCacheKey(asset.symbol, asset.market) : null
    const quote = quoteKey ? quoteByKey.get(quoteKey) : undefined

    if (asset.valuationMode === 'manual_only') {
      if (asset.manualPrice !== null && asset.manualPrice !== undefined) {
        nativeAmount = quantity * asset.manualPrice
        currentUnitPrice = asset.manualPrice
        source = 'manual'
      }
      else if (asset.amount > 0) {
        nativeAmount = asset.amount
        currentUnitPrice = quantity > 0 ? roundMoney(asset.amount / quantity) : null
        source = 'book'
      }
      else {
        nativeAmount = 0
        source = 'unpriced'
        warnings.push(`${asset.name}: no manual price or book amount available.`)
      }
    }
    else {
      // A holding has one fixed currency. A quote in another currency is not
      // comparable without an FX pair for it, so ignore it rather than
      // relabelling the value.
      if (quote && quote.currency !== asset.currency) {
        warnings.push(
          `Ignored the ${quote.currency} quote for ${asset.symbol}: the holding is in ${asset.currency}.`,
        )
      }

      if (quote && quote.currency === asset.currency) {
        nativeAmount = quantity * quote.price
        currentUnitPrice = roundMoney(quote.price)
        source = quote.isStale ? 'stale' : 'live'
        hasMarketPrice = true
        asOf = quote.asOf
        resolvedMarket = quote.market ?? asset.market
        provider = quote.source
      }
      else if (asset.manualPrice !== null && asset.manualPrice !== undefined) {
        nativeAmount = quantity * asset.manualPrice
        currentUnitPrice = asset.manualPrice
        source = 'manual'
        if (!quote) {
          warnings.push(`No live quote for ${asset.symbol}; used the manual price.`)
        }
      }
      else {
        // No usable quote and no manual price. The UI never sets `amount` for
        // investments, so using it here would silently value the holding at $0.
        nativeAmount = 0
        source = 'unpriced'
        if (!quote) {
          warnings.push(`No live quote or manual price for ${asset.symbol}; holding is unpriced.`)
        }
        else {
          warnings.push(`${asset.symbol}: holding is unpriced because the quote currency does not match.`)
        }
      }
    }

    if (boughtUnitPrice !== null && quantity > 0) {
      costBasisNative = roundMoney(quantity * boughtUnitPrice)
      if (fx) {
        const convertedCost = convertNativeAmount(costBasisNative, nativeCurrency, fx)
        costBasisUsd = convertedCost.usd
        costBasisSgd = convertedCost.sgd
      }
    }
  }
  else {
    nativeAmount = asset.amount
    source = 'book'
    asOf = asset.updatedAt
  }

  const converted = fx ? convertNativeAmount(nativeAmount, nativeCurrency, fx) : null
  const isUnpriced = source === 'unpriced' || converted === null

  if (isUnpriced) {
    // Do not report a partial valuation: an unpriced row contributes nothing
    // to totals, and its USD/SGD/P&L values must stay unknown rather than 0.
    source = 'unpriced'
    pnlNative = null
    pnlUsd = null
    pnlSgd = null
    costBasisUsd = null
    costBasisSgd = null

    return {
      id: `asset:${asset.id}`,
      entityType: 'asset',
      entityId: asset.id,
      section,
      name: asset.name,
      category: asset.kind === 'cpf' ? `cpf:${asset.cpfBucket || 'N/A'}` : asset.kind,
      nativeCurrency,
      nativeAmount: roundMoney(nativeAmount),
      boughtUnitPrice,
      currentUnitPrice,
      costBasisNative,
      costBasisUsd,
      costBasisSgd,
      pnlNative,
      pnlUsd,
      pnlSgd,
      usdAmount: 0,
      sgdAmount: 0,
      source,
      provider: null,
      asOf,
      symbol: asset.symbol,
      market: resolvedMarket,
      notes: asset.notes,
      isLiability: false,
    }
  }

  if (hasMarketPrice && costBasisNative !== null) {
    pnlNative = roundMoney(nativeAmount - costBasisNative)
    pnlUsd = roundMoney(converted.usd - (costBasisUsd ?? 0))
    pnlSgd = roundMoney(converted.sgd - (costBasisSgd ?? 0))
  }

  return {
    id: `asset:${asset.id}`,
    entityType: 'asset',
    entityId: asset.id,
    section,
    name: asset.name,
    category: asset.kind === 'cpf' ? `cpf:${asset.cpfBucket || 'N/A'}` : asset.kind,
    nativeCurrency,
    nativeAmount: roundMoney(nativeAmount),
    boughtUnitPrice,
    currentUnitPrice,
    costBasisNative,
    costBasisUsd,
    costBasisSgd,
    pnlNative,
    pnlUsd,
    pnlSgd,
    usdAmount: converted.usd,
    sgdAmount: converted.sgd,
    source,
    provider,
    asOf,
    symbol: asset.symbol,
    market: resolvedMarket,
    notes: asset.notes,
    isLiability: false,
  }
}

function buildLiabilityRow(
  liability: ReturnType<typeof listLiabilities>[number],
  fx: FxSnapshot | null,
): BalanceSheetRow {
  const converted = fx
    ? convertNativeAmount(liability.outstandingAmount, liability.currency, fx)
    : null

  return {
    id: `liability:${liability.id}`,
    entityType: 'liability',
    entityId: liability.id,
    section: 'liabilities',
    name: liability.name,
    category: liability.type,
    nativeCurrency: liability.currency,
    nativeAmount: roundMoney(liability.outstandingAmount),
    boughtUnitPrice: null,
    currentUnitPrice: null,
    costBasisNative: null,
    costBasisUsd: null,
    costBasisSgd: null,
    pnlNative: null,
    pnlUsd: null,
    pnlSgd: null,
    usdAmount: converted ? converted.usd : 0,
    sgdAmount: converted ? converted.sgd : 0,
    source: converted ? 'book' : 'unpriced',
    provider: null,
    asOf: liability.updatedAt,
    symbol: null,
    market: null,
    notes: liability.notes,
    isLiability: true,
  }
}

function sortRows(rows: BalanceSheetRow[]): BalanceSheetRow[] {
  const sectionRank: Record<BalanceSection, number> = {
    investments: 0,
    cpf: 1,
    cash_savings: 2,
    liabilities: 3,
  }

  return rows.sort((a, b) => {
    const sectionDelta = sectionRank[a.section] - sectionRank[b.section]
    if (sectionDelta !== 0) return sectionDelta
    return a.name.localeCompare(b.name)
  })
}

export async function buildBalanceSheet(refreshMode: RefreshMode): Promise<BalanceSheetResponse> {
  const warnings: string[] = []
  const assets = listAssets()
  const liabilities = listLiabilities()

  const [{ byKey: quoteByKey, requested, fetchedAt: quotesFetchedAt }, fx] = await Promise.all([
    resolveQuoteSnapshots(assets, refreshMode, warnings),
    resolveFxSnapshot(refreshMode, warnings),
  ])

  const rows: BalanceSheetRow[] = []

  for (const asset of assets) {
    rows.push(buildAssetRow(asset, quoteByKey, fx, warnings))
  }

  for (const liability of liabilities) {
    rows.push(buildLiabilityRow(liability, fx))
  }

  const sortedRows = sortRows(rows)
  const totals = accumulateTotals(sortedRows)

  const quoteSummary = {
    requested,
    priced: sortedRows.filter(row => row.entityType === 'asset' && (row.source === 'live' || row.source === 'stale')).length,
    stale: sortedRows.filter(row => row.entityType === 'asset' && row.source === 'stale').length,
    manualFallback: sortedRows.filter(
      row => row.entityType === 'asset' && row.section === 'investments' && row.source === 'manual',
    ).length,
    unpriced: sortedRows.filter(row => row.source === 'unpriced').length,
  }

  return {
    generatedAt: new Date().toISOString(),
    refreshMode,
    rows: sortedRows,
    totals,
    fx,
    quoteSummary,
    marketData: marketDataState(quotesFetchedAt),
    warnings,
  }
}
