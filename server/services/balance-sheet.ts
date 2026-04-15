import {
  type AssetEntry,
  type BalanceSection,
  type BalanceSheetResponse,
  type BalanceSheetRow,
  type CurrencyCode,
  type FxSnapshot,
  type QuoteSnapshot,
  type RefreshMode,
  LIVE_REFRESH_INTERVAL_MS,
} from '~~/shared/types/balance-sheet'
import { listAssets, listLiabilities, updateAssetMarket } from '~~/server/services/repository'
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

const quoteCache = new Map<string, QuoteCacheEntry>()
let fxCache: FxCacheEntry | null = null
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

function buildFallbackFxSnapshot(): FxSnapshot {
  const now = new Date().toISOString()
  return {
    base: 'USD',
    quote: 'SGD',
    usdToSgd: 1,
    sgdToUsd: 1,
    asOf: now.slice(0, 10),
    fetchedAt: now,
    source: 'identity_fallback',
    isStale: true,
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

async function resolveFxSnapshot(refreshMode: RefreshMode, warnings: string[]): Promise<FxSnapshot> {
  const now = Date.now()

  if (refreshMode === 'never') {
    if (fxCache) return fxCache.snapshot

    warnings.push('FX refresh is disabled (refresh=never) and no cached FX snapshot was available.')
    return buildFallbackFxSnapshot()
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

        fxCache = {
          snapshot: normalized,
          cachedAt: now,
        }

        return normalized
      })().finally(() => {
        inflightFxSnapshot = null
      })
    }

    return await inflightFxSnapshot
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (fxCache) {
      warnings.push(`FX fetch failed (${message}); using cached FX snapshot.`)
      return {
        ...fxCache.snapshot,
        isStale: true,
      }
    }

    warnings.push(`FX fetch failed (${message}); using identity fallback rates.`)
    return buildFallbackFxSnapshot()
  }
}

async function resolveQuoteSnapshots(
  assets: AssetEntry[],
  refreshMode: RefreshMode,
  warnings: string[],
): Promise<{
  byKey: Map<string, QuoteSnapshot>
  requested: number
}> {
  const lookupItems: QuoteLookupItem[] = []
  const uniqueKeys = new Set<string>()

  for (const asset of assets) {
    if (asset.kind !== 'investment' || !asset.symbol) continue

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
      warnings.push(`Quote batch had partial failures: ${fetched.errors.join('; ')}`)
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`Quote batch fetch failed (${message}); using cached/manual fallbacks.`)
  }

  backfillResolvedAssetMarkets(assets, byKey, warnings)

  return {
    byKey,
    requested: lookupItems.length,
  }
}

function buildAssetRow(
  asset: AssetEntry,
  quoteByKey: Map<string, QuoteSnapshot>,
  fx: FxSnapshot,
  warnings: string[],
): BalanceSheetRow {
  const section = sectionForAsset(asset.kind)

  let nativeCurrency: CurrencyCode = asset.currency
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

  if (asset.kind === 'investment') {
    const quantity = asset.quantity || 0
    boughtUnitPrice = asset.manualUnitPrice ?? null
    const quoteKey = asset.symbol ? buildQuoteCacheKey(asset.symbol, asset.market) : null
    const quote = quoteKey ? quoteByKey.get(quoteKey) : undefined

    if (asset.valuationMode === 'manual_only') {
      if (asset.manualUnitPrice !== null && asset.manualUnitPrice !== undefined) {
        nativeAmount = quantity * asset.manualUnitPrice
        currentUnitPrice = asset.manualUnitPrice
      }
      else {
        nativeAmount = asset.amount
        currentUnitPrice = quantity > 0 ? roundMoney(asset.amount / quantity) : null
      }
      source = 'manual'
    }
    else if (quote) {
      nativeCurrency = quote.currency
      nativeAmount = quantity * quote.price
      currentUnitPrice = roundMoney(quote.price)
      source = quote.isStale ? 'stale' : 'live'
      asOf = quote.asOf
      resolvedMarket = quote.market ?? asset.market
    }
    else if (asset.manualUnitPrice !== null && asset.manualUnitPrice !== undefined) {
      nativeAmount = quantity * asset.manualUnitPrice
      currentUnitPrice = asset.manualUnitPrice
      source = 'manual'
      warnings.push(`No live quote for ${asset.symbol}; used manual unit price.`)
    }
    else {
      nativeAmount = asset.amount
      currentUnitPrice = quantity > 0 ? roundMoney(asset.amount / quantity) : null
      source = 'book'
      warnings.push(`No live quote or manual fallback for ${asset.symbol}; used stored amount.`)
    }

    if (boughtUnitPrice !== null && quantity > 0) {
      costBasisNative = roundMoney(quantity * boughtUnitPrice)
      const costConverted = convertNativeAmount(costBasisNative, nativeCurrency, fx)
      costBasisUsd = costConverted.usd
      costBasisSgd = costConverted.sgd
      pnlNative = roundMoney(nativeAmount - costBasisNative)
    }
  }
  else {
    nativeAmount = asset.amount
    source = 'book'
    asOf = asset.updatedAt
  }

  const converted = convertNativeAmount(nativeAmount, nativeCurrency, fx)
  if (asset.kind === 'investment' && boughtUnitPrice !== null && costBasisNative !== null) {
    pnlUsd = roundMoney(converted.usd - (costBasisUsd || 0))
    pnlSgd = roundMoney(converted.sgd - (costBasisSgd || 0))
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
    asOf,
    symbol: asset.symbol,
    market: resolvedMarket,
    notes: asset.notes,
    isLiability: false,
  }
}

function buildLiabilityRow(
  liability: ReturnType<typeof listLiabilities>[number],
  fx: FxSnapshot,
): BalanceSheetRow {
  const converted = convertNativeAmount(liability.outstandingAmount, liability.currency, fx)

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
    usdAmount: converted.usd,
    sgdAmount: converted.sgd,
    source: 'book',
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

  const [{ byKey: quoteByKey, requested }, fx] = await Promise.all([
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
      row => row.entityType === 'asset' && row.section === 'investments' && (row.source === 'manual' || row.source === 'book'),
    ).length,
  }

  return {
    generatedAt: new Date().toISOString(),
    refreshMode,
    rows: sortedRows,
    totals,
    fx,
    quoteSummary,
    warnings,
  }
}
