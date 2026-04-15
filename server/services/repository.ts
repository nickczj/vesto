import { asc, eq } from 'drizzle-orm'
import {
  type AssetEntry,
  type LiabilityEntry,
  type CurrencyCode,
  type AssetKind,
  type LiabilityType,
  type CpfBucket,
  type ValuationMode,
} from '~~/shared/types/balance-sheet'
import { assetEntries, liabilityEntries } from '~~/server/database/schema'
import { useDb } from '~~/server/utils/db'

interface AssetWriteInput {
  kind: AssetKind
  name: string
  symbol?: string | null
  market?: string | null
  cpfBucket?: CpfBucket | null
  currency: CurrencyCode
  amount: number
  quantity?: number | null
  manualUnitPrice?: number | null
  valuationMode: ValuationMode
  notes?: string | null
  externalId?: string | null
}

interface LiabilityWriteInput {
  type: LiabilityType
  name: string
  currency: CurrencyCode
  outstandingAmount: number
  notes?: string | null
  externalId?: string | null
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toAssetDomain(row: typeof assetEntries.$inferSelect): AssetEntry {
  return {
    id: row.id,
    kind: row.kind as AssetKind,
    name: row.name,
    symbol: row.symbol,
    market: row.market,
    cpfBucket: row.cpfBucket as CpfBucket | null,
    currency: row.currency as CurrencyCode,
    amount: Number(row.amount),
    quantity: row.quantity === null ? null : Number(row.quantity),
    manualUnitPrice: row.manualUnitPrice === null ? null : Number(row.manualUnitPrice),
    valuationMode: row.valuationMode as ValuationMode,
    notes: row.notes,
    externalId: row.externalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toLiabilityDomain(row: typeof liabilityEntries.$inferSelect): LiabilityEntry {
  return {
    id: row.id,
    type: row.type as LiabilityType,
    name: row.name,
    currency: row.currency as CurrencyCode,
    outstandingAmount: Number(row.outstandingAmount),
    notes: row.notes,
    externalId: row.externalId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listAssets(): AssetEntry[] {
  const db = useDb()
  const rows = db
    .select()
    .from(assetEntries)
    .orderBy(asc(assetEntries.kind), asc(assetEntries.name), asc(assetEntries.id))
    .all()

  return rows.map(toAssetDomain)
}

export function getAssetById(id: number): AssetEntry | null {
  const db = useDb()
  const row = db.select().from(assetEntries).where(eq(assetEntries.id, id)).get()
  return row ? toAssetDomain(row) : null
}

export function createAsset(input: AssetWriteInput): AssetEntry {
  const db = useDb()
  const now = new Date().toISOString()

  const result = db.insert(assetEntries).values({
    kind: input.kind,
    name: input.name.trim(),
    symbol: normalizeOptionalText(input.symbol)?.toUpperCase() || null,
    market: normalizeOptionalText(input.market)?.toUpperCase() || null,
    cpfBucket: normalizeOptionalText(input.cpfBucket)?.toUpperCase() || null,
    currency: input.currency,
    amount: input.amount,
    quantity: input.quantity ?? null,
    manualUnitPrice: input.manualUnitPrice ?? null,
    valuationMode: input.valuationMode,
    notes: normalizeOptionalText(input.notes),
    externalId: normalizeOptionalText(input.externalId),
    createdAt: now,
    updatedAt: now,
  }).run()

  const id = Number(result.lastInsertRowid)
  const row = db.select().from(assetEntries).where(eq(assetEntries.id, id)).get()

  if (!row) {
    throw createError({ statusCode: 500, message: 'failed to create asset' })
  }

  return toAssetDomain(row)
}

export function updateAsset(id: number, input: AssetWriteInput): AssetEntry {
  const db = useDb()
  const now = new Date().toISOString()

  db.update(assetEntries).set({
    kind: input.kind,
    name: input.name.trim(),
    symbol: normalizeOptionalText(input.symbol)?.toUpperCase() || null,
    market: normalizeOptionalText(input.market)?.toUpperCase() || null,
    cpfBucket: normalizeOptionalText(input.cpfBucket)?.toUpperCase() || null,
    currency: input.currency,
    amount: input.amount,
    quantity: input.quantity ?? null,
    manualUnitPrice: input.manualUnitPrice ?? null,
    valuationMode: input.valuationMode,
    notes: normalizeOptionalText(input.notes),
    externalId: normalizeOptionalText(input.externalId),
    updatedAt: now,
  }).where(eq(assetEntries.id, id)).run()

  const row = db.select().from(assetEntries).where(eq(assetEntries.id, id)).get()
  if (!row) {
    throw createError({ statusCode: 404, message: 'asset not found' })
  }

  return toAssetDomain(row)
}

export function updateAssetMarket(id: number, market: string): AssetEntry {
  const db = useDb()
  const now = new Date().toISOString()
  const normalizedMarket = normalizeOptionalText(market)?.toUpperCase()

  db.update(assetEntries).set({
    market: normalizedMarket,
    updatedAt: now,
  }).where(eq(assetEntries.id, id)).run()

  const row = db.select().from(assetEntries).where(eq(assetEntries.id, id)).get()
  if (!row) {
    throw createError({ statusCode: 404, message: 'asset not found' })
  }

  return toAssetDomain(row)
}

export function deleteAsset(id: number): void {
  const db = useDb()
  db.delete(assetEntries).where(eq(assetEntries.id, id)).run()
}

export function listLiabilities(): LiabilityEntry[] {
  const db = useDb()
  const rows = db
    .select()
    .from(liabilityEntries)
    .orderBy(asc(liabilityEntries.type), asc(liabilityEntries.name), asc(liabilityEntries.id))
    .all()

  return rows.map(toLiabilityDomain)
}

export function getLiabilityById(id: number): LiabilityEntry | null {
  const db = useDb()
  const row = db.select().from(liabilityEntries).where(eq(liabilityEntries.id, id)).get()
  return row ? toLiabilityDomain(row) : null
}

export function createLiability(input: LiabilityWriteInput): LiabilityEntry {
  const db = useDb()
  const now = new Date().toISOString()

  const result = db.insert(liabilityEntries).values({
    type: input.type,
    name: input.name.trim(),
    currency: input.currency,
    outstandingAmount: input.outstandingAmount,
    notes: normalizeOptionalText(input.notes),
    externalId: normalizeOptionalText(input.externalId),
    createdAt: now,
    updatedAt: now,
  }).run()

  const id = Number(result.lastInsertRowid)
  const row = db.select().from(liabilityEntries).where(eq(liabilityEntries.id, id)).get()

  if (!row) {
    throw createError({ statusCode: 500, message: 'failed to create liability' })
  }

  return toLiabilityDomain(row)
}

export function updateLiability(id: number, input: LiabilityWriteInput): LiabilityEntry {
  const db = useDb()

  db.update(liabilityEntries).set({
    type: input.type,
    name: input.name.trim(),
    currency: input.currency,
    outstandingAmount: input.outstandingAmount,
    notes: normalizeOptionalText(input.notes),
    externalId: normalizeOptionalText(input.externalId),
    updatedAt: new Date().toISOString(),
  }).where(eq(liabilityEntries.id, id)).run()

  const row = db.select().from(liabilityEntries).where(eq(liabilityEntries.id, id)).get()
  if (!row) {
    throw createError({ statusCode: 404, message: 'liability not found' })
  }

  return toLiabilityDomain(row)
}

export function deleteLiability(id: number): void {
  const db = useDb()
  db.delete(liabilityEntries).where(eq(liabilityEntries.id, id)).run()
}
