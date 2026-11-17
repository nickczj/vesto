import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { assetEntries } from '~~/server/database/schema'
import initDbPlugin from '~~/server/plugins/db-init'
import { useDb, useSqlite } from '~~/server/utils/db'
import { resetTestDatabase } from './setup'

const TEST_DB = '/tmp/vesto-v2-schema-migration-test.db'

describe('schema migrations', () => {
  beforeEach(() => {
    globalThis.__TEST_RUNTIME_CONFIG = {
      databasePath: TEST_DB,
      vestoGoBaseUrl: 'http://localhost:8080',
    }

    resetTestDatabase(TEST_DB)
  })

  it('adds the split price columns, backfills them, and drops the mirror', () => {
    const legacy = new Database(TEST_DB)
    legacy.exec(`
      CREATE TABLE asset_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        symbol TEXT,
        market TEXT,
        cpf_bucket TEXT,
        currency TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        quantity REAL,
        manual_unit_price REAL,
        valuation_mode TEXT NOT NULL DEFAULT 'live_preferred',
        notes TEXT,
        external_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO asset_entries
        (kind, name, symbol, market, currency, amount, quantity, manual_unit_price, valuation_mode, created_at, updated_at)
      VALUES
        ('investment', 'Legacy ETF', 'VWRA.L', 'LSE', 'USD', 0, 2, 100, 'live_preferred', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    `)
    legacy.close()

    initDbPlugin()

    const row = useDb().select().from(assetEntries).get()
    expect(row?.name).toBe('Legacy ETF')
    expect(row?.costBasisUnitPrice).toBe(100)
    expect(row?.manualPrice).toBe(100)

    const mirror = useSqlite()
      .prepare("SELECT COUNT(*) AS n FROM pragma_table_info('asset_entries') WHERE name = 'manual_unit_price'")
      .get() as { n: number }
    expect(mirror.n).toBe(0)

    const applied = useSqlite()
      .prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations')
      .get() as { n: number }
    expect(applied.n).toBe(5)

    const history = useSqlite()
      .prepare("SELECT COUNT(*) AS n FROM pragma_table_info('valuation_history')")
      .get() as { n: number }
    expect(history.n).toBe(10)
  })

  it('rebuilt the tables with HKD allowed and the unique index intact', () => {
    initDbPlugin()

    const table = useSqlite()
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'asset_entries'")
      .get() as { sql: string }
    expect(table.sql).toContain("'HKD'")

    const index = useSqlite()
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'asset_entries_external_id_unique'")
      .get() as { n: number }
    expect(index.n).toBe(1)

    const insert = (currency: string) => useSqlite().prepare(`
      INSERT INTO asset_entries (kind, name, currency, amount, valuation_mode, created_at, updated_at)
      VALUES ('manual', 'Currency check', ?, 100, 'live_preferred', '2026-11-17T00:00:00Z', '2026-11-17T00:00:00Z')
    `).run(currency)

    expect(() => insert('HKD')).not.toThrow()
    expect(() => insert('EUR')).toThrow(/CHECK constraint failed/)
  })
})
