import { beforeEach, describe, expect, it } from 'vitest'
import initDbPlugin from '~~/server/plugins/db-init'
import {
  getValuationHistoryByDate,
  listValuationHistory,
  upsertValuationHistory,
} from '~~/server/services/history-repository'
import { resetTestDatabase } from './setup'

const TEST_DB = '/tmp/vesto-v2-history-repository-test.db'

describe('valuation history repository', () => {
  beforeEach(() => {
    globalThis.__TEST_RUNTIME_CONFIG = {
      databasePath: TEST_DB,
      vestoGoBaseUrl: 'http://localhost:8080',
    }

    resetTestDatabase(TEST_DB)
    initDbPlugin()
  })

  it('keeps one row per date and updates it in place', () => {
    upsertValuationHistory({
      asOfDate: '2026-11-15',
      capturedAt: '2026-11-15T00:00:00.000Z',
      netWorthUsd: 100,
      netWorthSgd: 130,
      assetsUsd: 150,
      liabilitiesUsd: 50,
      fxUsdSgd: 1.3,
      priced: 10,
      unpriced: 0,
      isComplete: true,
    })

    upsertValuationHistory({
      asOfDate: '2026-11-16',
      capturedAt: '2026-11-16T00:00:00.000Z',
      netWorthUsd: 110,
      netWorthSgd: 143,
      assetsUsd: 160,
      liabilitiesUsd: 50,
      fxUsdSgd: 1.3,
      priced: 9,
      unpriced: 1,
      isComplete: false,
    })

    upsertValuationHistory({
      asOfDate: '2026-11-16',
      capturedAt: '2026-11-16T01:00:00.000Z',
      netWorthUsd: 120,
      netWorthSgd: 156,
      assetsUsd: 170,
      liabilitiesUsd: 50,
      fxUsdSgd: 1.3,
      priced: 10,
      unpriced: 0,
      isComplete: true,
    })

    const all = listValuationHistory()
    expect(all).toHaveLength(2)
    expect(all.map(row => row.asOfDate)).toEqual(['2026-11-15', '2026-11-16'])
    expect(getValuationHistoryByDate('2026-11-16')).toMatchObject({
      capturedAt: '2026-11-16T01:00:00.000Z',
      netWorthUsd: 120,
      netWorthSgd: 156,
      priced: 10,
      unpriced: 0,
      isComplete: true,
    })
  })

  it('filters by the first date in the window', () => {
    for (const date of ['2026-11-14', '2026-11-15', '2026-11-16']) {
      upsertValuationHistory({
        asOfDate: date,
        capturedAt: `${date}T00:00:00.000Z`,
        netWorthUsd: 100,
        netWorthSgd: 130,
        assetsUsd: 150,
        liabilitiesUsd: 50,
        fxUsdSgd: 1.3,
        priced: 10,
        unpriced: 0,
        isComplete: true,
      })
    }

    expect(listValuationHistory('2026-11-15').map(row => row.asOfDate)).toEqual([
      '2026-11-15',
      '2026-11-16',
    ])
  })
})
