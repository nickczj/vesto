import { beforeEach, describe, expect, it } from 'vitest'
import initDbPlugin from '~~/server/plugins/db-init'
import { buildBalanceSheet, restoreSnapshotCache } from '~~/server/services/balance-sheet'
import { createAsset, createLiability } from '~~/server/services/repository'
import { saveCachedFx } from '~~/server/services/snapshot-cache'
import type { FxSnapshot } from '~~/shared/types/balance-sheet'
import { resetTestDatabase } from './setup'

const TEST_DB = '/tmp/vesto-v2-balance-sheet-test.db'

function fxSnapshot(usdToSgd = 1.35): FxSnapshot {
  return {
    base: 'USD',
    quote: 'SGD',
    usdToSgd,
    sgdToUsd: 1 / usdToSgd,
    asOf: '2026-11-16',
    fetchedAt: new Date().toISOString(),
    source: 'test',
    isStale: false,
  }
}

function seedAssetData() {
  createAsset({
    kind: 'investment',
    name: 'Offline ETF',
    symbol: 'VWRA.L',
    market: 'LSE',
    currency: 'USD',
    amount: 0,
    quantity: 2,
    costBasisUnitPrice: 100,
    manualPrice: 100,
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
    costBasisUnitPrice: null,
    manualPrice: null,
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
}

describe('balance sheet service', () => {
  beforeEach(() => {
    globalThis.__TEST_RUNTIME_CONFIG = {
      databasePath: TEST_DB,
      vestoGoBaseUrl: 'http://localhost:8080',
    }

    resetTestDatabase(TEST_DB)
    initDbPlugin()
    restoreSnapshotCache()
  })

  it('uses the persisted FX rate and the manual fallback when no quote is available', async () => {
    seedAssetData()
    saveCachedFx({ snapshot: fxSnapshot(), cachedAt: Date.now() })
    restoreSnapshotCache()

    const sheet = await buildBalanceSheet('never')

    expect(sheet.fx).not.toBeNull()
    expect(sheet.fx?.usdToSgd).toBe(1.35)
    expect(sheet.fx?.isStale).toBe(true)

    const investmentRow = sheet.rows.find(row => row.name === 'Offline ETF')
    expect(investmentRow?.source).toBe('manual')
    expect(investmentRow?.usdAmount).toBe(200)
    expect(investmentRow?.sgdAmount).toBe(270)

    // No P&L when the only price is the manual fallback.
    expect(investmentRow?.pnlSgd).toBeNull()

    expect(sheet.totals.totalAssets.usd).toBe(570.37)
    expect(sheet.totals.totalAssets.sgd).toBe(770)
    expect(sheet.totals.totalLiabilities.usd).toBe(37.04)
    expect(sheet.totals.totalLiabilities.sgd).toBe(50)
    expect(sheet.totals.netWorth.usd).toBe(533.33)
    expect(sheet.totals.netWorth.sgd).toBe(720)
    expect(sheet.quoteSummary.unpriced).toBe(0)
  })

  it('never falls back to 1:1 FX on a fresh install', async () => {
    seedAssetData()

    const sheet = await buildBalanceSheet('never')

    expect(sheet.fx).toBeNull()
    expect(sheet.rows.every(row => row.source === 'unpriced')).toBe(true)
    expect(sheet.rows.every(row => row.usdAmount === 0 && row.sgdAmount === 0)).toBe(true)
    expect(sheet.totals.netWorth.usd).toBe(0)
    expect(sheet.totals.netWorth.sgd).toBe(0)
    expect(sheet.quoteSummary.unpriced).toBe(3)
    expect(sheet.warnings.some(warning => warning.includes('FX rate unavailable'))).toBe(true)
  })

  it('marks an investment as unpriced instead of valuing it at zero', async () => {
    createAsset({
      kind: 'investment',
      name: 'No price',
      symbol: 'NOPE',
      market: 'NMS',
      currency: 'USD',
      amount: 0,
      quantity: 10,
      costBasisUnitPrice: null,
      manualPrice: null,
      valuationMode: 'live_preferred',
      notes: null,
    })

    saveCachedFx({ snapshot: fxSnapshot(), cachedAt: Date.now() })
    restoreSnapshotCache()

    const sheet = await buildBalanceSheet('never')

    const row = sheet.rows.find(item => item.name === 'No price')
    expect(row?.source).toBe('unpriced')
    expect(row?.usdAmount).toBe(0)
    expect(row?.sgdAmount).toBe(0)
    expect(sheet.totals.totalAssets.usd).toBe(0)
    expect(sheet.quoteSummary.unpriced).toBe(1)
    expect(sheet.warnings.some(warning => warning.includes('holding is unpriced'))).toBe(true)
  })

  it('does not request a quote for a manual_only holding', async () => {
    seedAssetData()
    createAsset({
      kind: 'investment',
      name: 'Tencent',
      symbol: '0700.HK',
      market: 'SEHK',
      currency: 'SGD',
      amount: 0,
      quantity: 100,
      costBasisUnitPrice: null,
      manualPrice: 76.05,
      valuationMode: 'manual_only',
      notes: null,
    })

    saveCachedFx({ snapshot: fxSnapshot(), cachedAt: Date.now() })
    restoreSnapshotCache()

    const sheet = await buildBalanceSheet('never')

    // Only the live_preferred VWRA.L holding needs a quote. Requesting one for
    // 0700.HK would always be discarded and would add an HKD warning.
    expect(sheet.quoteSummary.requested).toBe(1)

    const row = sheet.rows.find(item => item.name === 'Tencent')
    expect(row?.source).toBe('manual')
    expect(row?.provider).toBeNull()
    expect(row?.nativeAmount).toBe(7605)
    expect(sheet.warnings.some(warning => warning.includes('HKD'))).toBe(false)
  })
})
