import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  manualUnitPrice: real('manual_unit_price'),
  valuationMode: text('valuation_mode').notNull().default('live_preferred'),
  notes: text('notes'),
  externalId: text('external_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => ({
  externalIdUnique: uniqueIndex('asset_entries_external_id_unique').on(table.externalId),
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
  externalIdUnique: uniqueIndex('liability_entries_external_id_unique').on(table.externalId),
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
