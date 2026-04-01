import { useSqlite } from '~~/server/utils/db'

const assetKindCheck = "('investment','cpf','cash_savings','manual')"
const currencyCheck = "('USD','SGD')"
const valuationModeCheck = "('live_preferred','manual_only')"
const cpfBucketCheck = "('OA','SA','MA','RA')"
const liabilityTypeCheck = "('loan','credit_card','other')"

export default defineNitroPlugin(() => {
  const sqlite = useSqlite()

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS asset_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ${assetKindCheck}),
      name TEXT NOT NULL,
      symbol TEXT,
      market TEXT,
      cpf_bucket TEXT CHECK (cpf_bucket IN ${cpfBucketCheck}),
      currency TEXT NOT NULL CHECK (currency IN ${currencyCheck}),
      amount REAL NOT NULL DEFAULT 0,
      quantity REAL,
      manual_unit_price REAL,
      valuation_mode TEXT NOT NULL DEFAULT 'live_preferred' CHECK (valuation_mode IN ${valuationModeCheck}),
      notes TEXT,
      external_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS asset_entries_external_id_unique
      ON asset_entries(external_id)
      WHERE external_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS liability_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ${liabilityTypeCheck}),
      name TEXT NOT NULL,
      currency TEXT NOT NULL CHECK (currency IN ${currencyCheck}),
      outstanding_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      external_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS liability_entries_external_id_unique
      ON liability_entries(external_id)
      WHERE external_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
})
