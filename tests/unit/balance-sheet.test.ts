import { describe, expect, it, beforeEach } from 'vitest'
import initDbPlugin from '~~/server/plugins/db-init'
import { buildBalanceSheet } from '~~/server/services/balance-sheet'
import { createAsset, createLiability } from '~~/server/services/repository'
import { resetTestDatabase } from './setup'

const TEST_DB = '/tmp/vesto-v2-balance-sheet-test.db'

describe('balance sheet service', () => {
  beforeEach(() => {
    globalThis.__TEST_RUNTIME_CONFIG = {
      databasePath: TEST_DB,
      vestoGoBaseUrl: 'http://localhost:8080',
      vestoV1DbPath: '/tmp/vesto-v1.db',
    }

    resetTestDatabase(TEST_DB)
    initDbPlugin()
  })

  it('uses manual fallback when quote is unavailable', async () => {
    createAsset({
      kind: 'investment',
      name: 'Offline ETF',
      symbol: 'VWRA.L',
      market: 'LSE',
      currency: 'USD',
      amount: 0,
      quantity: 2,
      manualUnitPrice: 100,
      valuationMode: 'live_preferred',
      notes: null,
    })

    createAsset({
      kind: 'cpf',
      name: 'CPF OA',
      cpfBucket: 'OA',
      currency: 'SGD',
      amount: 500,
      quantity: null,
      manualUnitPrice: null,
      valuationMode: 'manual_only',
      notes: null,
    })

    createLiability({
      type: 'loan',
      name: 'Mortgage',
      currency: 'SGD',
      outstandingAmount: 50,
      notes: null,
    })

    const sheet = await buildBalanceSheet('never')

    const investmentRow = sheet.rows.find(row => row.name === 'Offline ETF')
    expect(investmentRow?.source).toBe('manual')
    expect(sheet.totals.totalAssets.sgd).toBe(700)
    expect(sheet.totals.totalLiabilities.sgd).toBe(50)
    expect(sheet.totals.netWorth.sgd).toBe(650)
    expect(sheet.warnings.some(w => w.includes('refresh=never'))).toBe(true)
  })
})
