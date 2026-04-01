import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { assetEntries, liabilityEntries } from '~~/server/database/schema'
import {
  createAsset,
  createLiability,
} from '~~/server/services/repository'
import { useDb } from '~~/server/utils/db'

interface LegacyHoldingRow {
  id: number
  symbol: string | null
  name: string | null
  type: string | null
  quantity: number | null
  average_cost: number | null
  currency: string | null
  notes: string | null
}

interface LegacyCpfRow {
  id: number
  type: string | null
  balance: number | null
}

interface LegacySavingsRow {
  id: number
  name: string | null
  bank: string | null
  balance: number | null
  notes: string | null
}

interface LegacyLoanRow {
  id: number
  name: string | null
  type: string | null
  outstanding_balance: number | null
  notes: string | null
}

export interface ImportFromV1Result {
  sourcePath: string
  imported: {
    holdings: number
    cpf: number
    savings: number
    loans: number
  }
  skipped: {
    holdings: number
    cpf: number
    savings: number
    loans: number
  }
}

function normalizeCurrency(value: string | null | undefined): 'USD' | 'SGD' {
  return String(value || '').trim().toUpperCase() === 'USD' ? 'USD' : 'SGD'
}

function mapLoanType(input: string | null | undefined): 'loan' | 'credit_card' | 'other' {
  const normalized = String(input || '').trim().toLowerCase()
  if (!normalized) return 'other'
  if (normalized.includes('credit')) return 'credit_card'
  if (['mortgage', 'car', 'personal', 'education', 'loan'].includes(normalized)) return 'loan'
  return 'other'
}

function hasTable(legacyDb: Database.Database, tableName: string): boolean {
  const row = legacyDb
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: number } | undefined

  return row?.present === 1
}

function hasAssetExternalId(externalId: string): boolean {
  const db = useDb()
  const found = db.select({ id: assetEntries.id })
    .from(assetEntries)
    .where(eq(assetEntries.externalId, externalId))
    .get()

  return Boolean(found)
}

function hasLiabilityExternalId(externalId: string): boolean {
  const db = useDb()
  const found = db.select({ id: liabilityEntries.id })
    .from(liabilityEntries)
    .where(eq(liabilityEntries.externalId, externalId))
    .get()

  return Boolean(found)
}

export function importFromLegacyVesto(sourcePathOverride?: string): ImportFromV1Result {
  const config = useRuntimeConfig()
  const sourcePath = String(sourcePathOverride || config.vestoV1DbPath || '').trim()

  if (!sourcePath) {
    throw createError({ statusCode: 400, message: 'Missing source path for legacy v1 database' })
  }

  if (!existsSync(sourcePath)) {
    throw createError({ statusCode: 404, message: `Legacy v1 database not found: ${sourcePath}` })
  }

  const legacyDb = new Database(sourcePath, { readonly: true })

  const result: ImportFromV1Result = {
    sourcePath,
    imported: { holdings: 0, cpf: 0, savings: 0, loans: 0 },
    skipped: { holdings: 0, cpf: 0, savings: 0, loans: 0 },
  }

  try {
    if (hasTable(legacyDb, 'holdings')) {
      const holdings = legacyDb.prepare(`
        SELECT id, symbol, name, type, quantity, average_cost, currency, notes
        FROM holdings
        ORDER BY id ASC
      `).all() as LegacyHoldingRow[]

      for (const row of holdings) {
        const externalId = `vesto-v1:holding:${row.id}`
        if (hasAssetExternalId(externalId)) {
          result.skipped.holdings += 1
          continue
        }

        const symbol = String(row.symbol || '').trim().toUpperCase() || null
        const quantity = Number(row.quantity || 0)
        const unitCost = Number(row.average_cost || 0)
        const inferredKind = symbol ? 'investment' : 'manual'

        createAsset({
          kind: inferredKind,
          name: String(row.name || symbol || `Holding ${row.id}`).trim(),
          symbol,
          market: null,
          cpfBucket: null,
          currency: normalizeCurrency(row.currency),
          amount: Math.max(0, quantity * unitCost),
          quantity: inferredKind === 'investment' ? Math.max(0.000001, quantity || 1) : null,
          manualUnitPrice: unitCost > 0 ? unitCost : null,
          valuationMode: inferredKind === 'investment' ? 'live_preferred' : 'manual_only',
          notes: row.notes,
          externalId,
        })

        result.imported.holdings += 1
      }
    }

    if (hasTable(legacyDb, 'cpf_accounts')) {
      const cpfRows = legacyDb.prepare(`
        SELECT id, type, balance
        FROM cpf_accounts
        ORDER BY id ASC
      `).all() as LegacyCpfRow[]

      for (const row of cpfRows) {
        const externalId = `vesto-v1:cpf:${row.id}`
        if (hasAssetExternalId(externalId)) {
          result.skipped.cpf += 1
          continue
        }

        const bucket = String(row.type || '').trim().toUpperCase()
        if (!['OA', 'SA', 'MA', 'RA'].includes(bucket)) {
          result.skipped.cpf += 1
          continue
        }

        createAsset({
          kind: 'cpf',
          name: `CPF ${bucket}`,
          symbol: null,
          market: null,
          cpfBucket: bucket as 'OA' | 'SA' | 'MA' | 'RA',
          currency: 'SGD',
          amount: Math.max(0, Number(row.balance || 0)),
          quantity: null,
          manualUnitPrice: null,
          valuationMode: 'manual_only',
          notes: null,
          externalId,
        })

        result.imported.cpf += 1
      }
    }

    if (hasTable(legacyDb, 'savings_accounts')) {
      const savingsRows = legacyDb.prepare(`
        SELECT id, name, bank, balance, notes
        FROM savings_accounts
        ORDER BY id ASC
      `).all() as LegacySavingsRow[]

      for (const row of savingsRows) {
        const externalId = `vesto-v1:savings:${row.id}`
        if (hasAssetExternalId(externalId)) {
          result.skipped.savings += 1
          continue
        }

        const displayName = [String(row.bank || '').trim(), String(row.name || '').trim()]
          .filter(Boolean)
          .join(' - ') || `Savings ${row.id}`

        createAsset({
          kind: 'cash_savings',
          name: displayName,
          symbol: null,
          market: null,
          cpfBucket: null,
          currency: 'SGD',
          amount: Math.max(0, Number(row.balance || 0)),
          quantity: null,
          manualUnitPrice: null,
          valuationMode: 'manual_only',
          notes: row.notes,
          externalId,
        })

        result.imported.savings += 1
      }
    }

    if (hasTable(legacyDb, 'loans')) {
      const loans = legacyDb.prepare(`
        SELECT id, name, type, outstanding_balance, notes
        FROM loans
        ORDER BY id ASC
      `).all() as LegacyLoanRow[]

      for (const row of loans) {
        const externalId = `vesto-v1:loan:${row.id}`
        if (hasLiabilityExternalId(externalId)) {
          result.skipped.loans += 1
          continue
        }

        createLiability({
          type: mapLoanType(row.type),
          name: String(row.name || `Loan ${row.id}`).trim(),
          currency: 'SGD',
          outstandingAmount: Math.max(0.01, Number(row.outstanding_balance || 0)),
          notes: row.notes,
          externalId,
        })

        result.imported.loans += 1
      }
    }

    return result
  }
  finally {
    legacyDb.close()
  }
}
