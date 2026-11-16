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
  // Deprecated: mirror of cost_basis_unit_price kept for one release so an
  // image rollback still reads a sensible value. The app no longer reads it.
  manualUnitPrice: real('manual_unit_price'),
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
  currencyCheck: check('asset_entries_currency_check', sql`${table.currency} IN ('USD', 'SGD')`),
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
  currencyCheck: check('liability_entries_currency_check', sql`${table.currency} IN ('USD', 'SGD')`),
}))

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type AssetEntryRow = typeof assetEntries.$inferSelect
export type AssetEntryInsert = typeof assetEntries.$inferInsert

export type LiabilityEntryRow = typeof liabilityEntries.$inferSelect
export type LiabilityEntryInsert = typeof liabilityEntries.$inferInsert
