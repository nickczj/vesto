import { describe, expect, it } from 'vitest'
import type { BalanceSheetRow } from '~~/shared/types/balance-sheet'
import {
  formatLedgerAmount,
  formatLedgerPercent,
  formatLedgerValue,
  formatQuantity,
  formatShare,
  rowReturn,
  rowWeight,
  sectionPnl,
  sectionReturn,
  shareOf,
} from '~/utils/ledger'

function row(overrides: Partial<BalanceSheetRow> = {}): BalanceSheetRow {
  return {
    id: 'asset:1',
    entityType: 'asset',
    entityId: 1,
    section: 'investments',
    name: 'Vanguard FTSE All-World',
    category: 'investment',
    nativeCurrency: 'USD',
    nativeAmount: 1000,
    quantity: 10,
    boughtUnitPrice: 80,
    currentUnitPrice: 100,
    costBasisNative: 800,
    costBasisUsd: 800,
    costBasisSgd: 1040,
    pnlNative: 200,
    pnlUsd: 200,
    pnlSgd: 260,
    usdAmount: 1000,
    sgdAmount: 1300,
    source: 'live',
    provider: 'yahoo_scraped',
    asOf: null,
    symbol: 'VWRA',
    market: 'LSE',
    notes: null,
    isLiability: false,
    ...overrides,
  }
}

describe('ledger formatting', () => {
  it('prints plain amounts without a currency symbol', () => {
    expect(formatLedgerValue(307764.6)).toBe('307,764.60')
    expect(formatLedgerValue(-840)).toBe('840.00')
    expect(formatLedgerValue(0)).toBe('0.00')
    expect(formatLedgerValue(null)).toBeNull()
    expect(formatLedgerValue(Number.NaN)).toBeNull()
  })

  it('puts losses and liabilities in parentheses and marks gains with a plus', () => {
    expect(formatLedgerAmount(6051.28, { signed: true })).toBe('+6,051.28')
    expect(formatLedgerAmount(-840, { signed: true })).toBe('(840.00)')
    expect(formatLedgerAmount(0, { signed: true })).toBe('0.00')
    expect(formatLedgerAmount(30764.8)).toBe('30,764.80')
    expect(formatLedgerAmount(-119840.55)).toBe('(119,840.55)')
    expect(formatLedgerAmount(null)).toBeNull()
  })

  it('signs percentages but does not bracket them', () => {
    expect(formatLedgerPercent(0.179)).toBe('+17.9%')
    expect(formatLedgerPercent(-0.113)).toBe('−11.3%')
    expect(formatLedgerPercent(0)).toBe('0.0%')
    expect(formatLedgerPercent(null)).toBeNull()
  })

  it('prints a weight without a sign', () => {
    expect(formatShare(0.129)).toBe('12.9%')
    expect(formatShare(1)).toBe('100.0%')
    expect(formatShare(null)).toBeNull()
  })

  it('formats quantities with grouping and no forced decimals', () => {
    expect(formatQuantity(220)).toBe('220')
    expect(formatQuantity(1000)).toBe('1,000')
    expect(formatQuantity(0.125)).toBe('0.125')
    expect(formatQuantity(null)).toBeNull()
  })
})

describe('ledger derivations', () => {
  it('computes a holding return only where P&L and cost basis both exist', () => {
    expect(rowReturn(row())).toBeCloseTo(0.25)
    expect(rowReturn(row({ pnlSgd: null }))).toBeNull()
    expect(rowReturn(row({ costBasisSgd: null }))).toBeNull()
    expect(rowReturn(row({ costBasisSgd: 0 }))).toBeNull()
  })

  it('weights assets against total assets and leaves liabilities out', () => {
    expect(rowWeight(row(), 1300)).toBeCloseTo(1)
    expect(rowWeight(row({ sgdAmount: 325 }), 1300)).toBeCloseTo(0.25)
    expect(rowWeight(row({ isLiability: true }), 1300)).toBeNull()
    expect(rowWeight(row({ source: 'unpriced' }), 1300)).toBeNull()
    expect(rowWeight(row(), 0)).toBeNull()
  })

  it('sums the P&L of rows that have one', () => {
    expect(sectionPnl([row(), row({ pnlSgd: 40 })])).toBe(300)
    expect(sectionPnl([row({ pnlSgd: null })])).toBeNull()
  })

  it('computes a section return over the cost basis that produced the P&L', () => {
    const manual = row({
      id: 'asset:manual',
      name: 'Savings bond',
      pnlSgd: null,
      costBasisSgd: 5000,
      costBasisNative: 5000,
      source: 'manual',
    })

    expect(sectionReturn([row(), manual])).toBeCloseTo(0.25)
    expect(sectionReturn([manual])).toBeNull()
    expect(sectionReturn([])).toBeNull()
  })

  it('treats a missing or zero denominator as no share at all', () => {
    expect(shareOf(25, 100)).toBe(0.25)
    expect(shareOf(25, null)).toBeNull()
    expect(shareOf(25, 0)).toBeNull()
    expect(shareOf(null, 100)).toBeNull()
  })
})
