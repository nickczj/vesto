import { eq } from 'drizzle-orm'
import { appSettings } from '~~/server/database/schema'
import { useDb } from '~~/server/utils/db'
import type { FxSnapshot, QuoteSnapshot } from '~~/shared/types/balance-sheet'

/**
 * Durable cache for the last-known FX and quote snapshots.
 *
 * This is deliberately not a source of record: it exists so a server restart
 * (deploy, crash, reboot) can still render the previous values marked stale
 * instead of falling back to 1:1 FX or $0 valuations. The `app_settings`
 * key/value table already exists, so this needs no schema change.
 */

const QUOTE_CACHE_KEY = 'cache:quotes'
const FX_CACHE_KEY = 'cache:fx'
const CACHE_VERSION = 1

export interface CachedQuoteRecord {
  key: string
  snapshot: QuoteSnapshot
  cachedAt: number
}

export interface CachedFxRecord {
  snapshot: FxSnapshot
  cachedAt: number
}

interface QuoteCachePayload {
  version: number
  savedAt: number
  quotes: CachedQuoteRecord[]
}

interface FxCachePayload {
  version: number
  savedAt: number
  fx: CachedFxRecord
}

function readJson(key: string): unknown {
  const db = useDb()
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  if (!row) return null

  try {
    return JSON.parse(row.value)
  }
  catch {
    return null
  }
}

function writeJson(key: string, value: unknown, now: number): void {
  const db = useDb()
  const updatedAt = new Date(now).toISOString()
  const serialized = JSON.stringify(value)

  db.insert(appSettings)
    .values({
      key,
      value: serialized,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: serialized,
        updatedAt,
      },
    })
    .run()
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCurrency(value: unknown): value is QuoteSnapshot['currency'] {
  return value === 'USD' || value === 'SGD'
}

function isQuoteSnapshot(value: unknown): value is QuoteSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<QuoteSnapshot>

  return typeof snapshot.symbol === 'string'
    && snapshot.symbol.length > 0
    && (snapshot.market === null || typeof snapshot.market === 'string')
    && isCurrency(snapshot.currency)
    && isFiniteNumber(snapshot.price)
    && snapshot.price > 0
    && typeof snapshot.asOf === 'string'
    && typeof snapshot.fetchedAt === 'string'
    && typeof snapshot.source === 'string'
    && typeof snapshot.isStale === 'boolean'
}

function isCachedQuoteRecord(value: unknown): value is CachedQuoteRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<CachedQuoteRecord>

  return typeof record.key === 'string'
    && record.key.length > 0
    && isFiniteNumber(record.cachedAt)
    && isQuoteSnapshot(record.snapshot)
}

function isFxSnapshot(value: unknown): value is FxSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<FxSnapshot>

  return snapshot.base === 'USD'
    && snapshot.quote === 'SGD'
    && isFiniteNumber(snapshot.usdToSgd)
    && snapshot.usdToSgd > 0
    && isFiniteNumber(snapshot.sgdToUsd)
    && snapshot.sgdToUsd > 0
    && typeof snapshot.asOf === 'string'
    && typeof snapshot.fetchedAt === 'string'
    && typeof snapshot.source === 'string'
}

function isCachedFxRecord(value: unknown): value is CachedFxRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<CachedFxRecord>
  return isFiniteNumber(record.cachedAt) && isFxSnapshot(record.snapshot)
}

export function loadCachedQuotes(): CachedQuoteRecord[] {
  const payload = readJson(QUOTE_CACHE_KEY) as QuoteCachePayload | null
  if (!payload || payload.version !== CACHE_VERSION || !Array.isArray(payload.quotes)) {
    return []
  }

  return payload.quotes.filter(isCachedQuoteRecord)
}

export function loadCachedFx(): CachedFxRecord | null {
  const payload = readJson(FX_CACHE_KEY) as FxCachePayload | null
  if (!payload || payload.version !== CACHE_VERSION || !isCachedFxRecord(payload.fx)) {
    return null
  }

  return payload.fx
}

export function saveCachedQuotes(quotes: CachedQuoteRecord[], now = Date.now()): void {
  const payload: QuoteCachePayload = {
    version: CACHE_VERSION,
    savedAt: now,
    quotes,
  }

  writeJson(QUOTE_CACHE_KEY, payload, now)
}

export function saveCachedFx(fx: CachedFxRecord, now = Date.now()): void {
  const payload: FxCachePayload = {
    version: CACHE_VERSION,
    savedAt: now,
    fx,
  }

  writeJson(FX_CACHE_KEY, payload, now)
}
