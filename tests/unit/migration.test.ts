import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import initDbPlugin from '~~/server/plugins/db-init'
import { importFromLegacyVesto } from '~~/server/services/migration'
import { listAssets, listLiabilities } from '~~/server/services/repository'
import { resetTestDatabase } from './setup'

const TARGET_DB = '/tmp/vesto-v2-migration-target.db'
const LEGACY_DB = '/tmp/vesto-v1-migration-source.db'

function createLegacyFixture(path: string) {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE holdings (
      id INTEGER PRIMARY KEY,
      symbol TEXT,
      name TEXT,
      type TEXT,
      quantity REAL,
      average_cost REAL,
      currency TEXT,
      notes TEXT
    );

    CREATE TABLE cpf_accounts (
      id INTEGER PRIMARY KEY,
      type TEXT,
      balance REAL
    );

    CREATE TABLE savings_accounts (
      id INTEGER PRIMARY KEY,
      name TEXT,
      bank TEXT,
      balance REAL,
      notes TEXT
    );

    CREATE TABLE loans (
      id INTEGER PRIMARY KEY,
      name TEXT,
      type TEXT,
      outstanding_balance REAL,
      notes TEXT
    );
  `)

  db.prepare('INSERT INTO holdings (id, symbol, name, type, quantity, average_cost, currency, notes) VALUES (1, ?, ?, ?, ?, ?, ?, ?)')
    .run('AAPL', 'Apple Position', 'stock', 3, 150, 'USD', 'legacy holding')

  db.prepare('INSERT INTO cpf_accounts (id, type, balance) VALUES (1, ?, ?)').run('OA', 12345)
  db.prepare('INSERT INTO savings_accounts (id, name, bank, balance, notes) VALUES (1, ?, ?, ?, ?)').run('Savings', 'DBS', 5000, 'legacy savings')
  db.prepare('INSERT INTO loans (id, name, type, outstanding_balance, notes) VALUES (1, ?, ?, ?, ?)').run('Home Loan', 'mortgage', 200000, 'legacy loan')
  db.close()
}

describe('legacy migration', () => {
  beforeEach(() => {
    resetTestDatabase(TARGET_DB)
    resetTestDatabase(LEGACY_DB)
    createLegacyFixture(LEGACY_DB)

    globalThis.__TEST_RUNTIME_CONFIG = {
      databasePath: TARGET_DB,
      vestoGoBaseUrl: 'http://localhost:8080',
      vestoV1DbPath: LEGACY_DB,
    }

    initDbPlugin()
  })

  it('imports once and skips on repeated runs (idempotent)', () => {
    const first = importFromLegacyVesto(LEGACY_DB)
    expect(first.imported.holdings).toBe(1)
    expect(first.imported.cpf).toBe(1)
    expect(first.imported.savings).toBe(1)
    expect(first.imported.loans).toBe(1)

    const second = importFromLegacyVesto(LEGACY_DB)
    expect(second.imported.holdings).toBe(0)
    expect(second.imported.cpf).toBe(0)
    expect(second.imported.savings).toBe(0)
    expect(second.imported.loans).toBe(0)

    expect(second.skipped.holdings).toBe(1)
    expect(second.skipped.cpf).toBe(1)
    expect(second.skipped.savings).toBe(1)
    expect(second.skipped.loans).toBe(1)

    expect(listAssets().length).toBe(3)
    expect(listLiabilities().length).toBe(1)
  })
})
