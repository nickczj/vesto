import { sql } from 'drizzle-orm'
import { check, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const assetEntries = sqliteTable('asset_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  symbol: text('symbol'),
  market: text('market'),
  cpfBucket: text('cpf_bucket'),
  currency: text('currency').notNull().default('SGD'),
  amount: real('amount').notNull().default(0),
  quantity: real('quantity'),
  costBasisUnitPrice: real('cost_basis_unit_price'),
  manualPrice: real('manual_price'),
  valuationMode: text('valuation_mode').notNull().default('live_preferred'),
  notes: text('notes'),
  externalId: text('external_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => ({
  externalIdUnique: uniqueIndex('asset_entries_external_id_unique')
    .on(table.externalId)
    .where(sql`${table.externalId} IS NOT NULL`),
  kindCheck: check('asset_entries_kind_check', sql`${table.kind} IN ('investment', 'cpf', 'cash_savings', 'manual')`),
  cpfBucketCheck: check('asset_entries_cpf_bucket_check', sql`${table.cpfBucket} IN ('OA', 'SA', 'MA', 'RA')`),
  currencyCheck: check('asset_entries_currency_check', sql`${table.currency} IN ('USD', 'SGD', 'HKD')`),
  valuationModeCheck: check('asset_entries_valuation_mode_check', sql`${table.valuationMode} IN ('live_preferred', 'manual_only')`),
}))

export const liabilityEntries = sqliteTable('liability_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('SGD'),
  outstandingAmount: real('outstanding_amount').notNull().default(0),
  notes: text('notes'),
  externalId: text('external_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => ({
  externalIdUnique: uniqueIndex('liability_entries_external_id_unique')
    .on(table.externalId)
    .where(sql`${table.externalId} IS NOT NULL`),
  typeCheck: check('liability_entries_type_check', sql`${table.type} IN ('loan', 'credit_card', 'other')`),
  currencyCheck: check('liability_entries_currency_check', sql`${table.currency} IN ('USD', 'SGD', 'HKD')`),
}))

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * One row per SGT calendar date. The series is captured by the `snapshot`
 * sidecar at 08:00 SGT; it is not reconstructed from page loads. There is no
 * backfill, so a missed day is a permanent hole.
 */
export const valuationHistory = sqliteTable('valuation_history', {
  asOfDate: text('as_of_date').primaryKey(),
  capturedAt: text('captured_at').notNull(),
  netWorthUsd: real('net_worth_usd').notNull(),
  netWorthSgd: real('net_worth_sgd').notNull(),
  /**
   * Net worth less the CPF section subtotal. Null on rows captured before the
   * column existed; the series starts at the first capture that has it and is
   * never backfilled.
   */
  netWorthExCpfUsd: real('net_worth_ex_cpf_usd'),
  netWorthExCpfSgd: real('net_worth_ex_cpf_sgd'),
  assetsUsd: real('assets_usd').notNull(),
  liabilitiesUsd: real('liabilities_usd').notNull(),
  fxUsdSgd: real('fx_usd_sgd').notNull(),
  // Balance-sheet row counts, not just investments: `unpriced` is every row
  // excluded from the totals, including liabilities with no FX rate.
  priced: integer('priced').notNull(),
  unpriced: integer('unpriced').notNull(),
  isComplete: integer('is_complete', { mode: 'boolean' }).notNull(),
})

export type AssetEntryRow = typeof assetEntries.$inferSelect
export type AssetEntryInsert = typeof assetEntries.$inferInsert

export type LiabilityEntryRow = typeof liabilityEntries.$inferSelect
export type LiabilityEntryInsert = typeof liabilityEntries.$inferInsert
