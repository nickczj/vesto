import { describe, expect, it } from 'vitest'
import { convertNativeAmount, roundRate } from '~~/server/services/valuation'
import type { FxSnapshot } from '~~/shared/types/balance-sheet'

const fx: FxSnapshot = {
  base: 'USD',
  quote: 'SGD',
  usdToSgd: 1.35,
  sgdToUsd: roundRate(1 / 1.35),
  asOf: '2026-04-01',
  fetchedAt: '2026-04-01T00:00:00Z',
  source: 'test',
  isStale: false,
}

describe('valuation conversion', () => {
  it('converts USD native amounts to SGD', () => {
    const result = convertNativeAmount(100, 'USD', fx)
    expect(result.usd).toBe(100)
    expect(result.sgd).toBe(135)
  })

  it('converts SGD native amounts to USD using inverse FX', () => {
    const result = convertNativeAmount(135, 'SGD', fx)
    expect(result.sgd).toBe(135)
    expect(result.usd).toBe(100)
  })
})
