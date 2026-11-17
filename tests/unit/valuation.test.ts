import { describe, expect, it } from 'vitest'
import { convertNativeAmount, roundRate } from '~~/server/services/valuation'
import type { FxSnapshot } from '~~/shared/types/balance-sheet'

const fx: FxSnapshot = {
  base: 'USD',
  quote: 'SGD',
  usdToSgd: 1.35,
  sgdToUsd: roundRate(1 / 1.35),
  sgdPerUnit: {
    USD: 1.35,
    SGD: 1,
    HKD: 0.1725,
  },
  asOf: '2026-04-01',
  fetchedAt: '2026-04-01T00:00:00Z',
  source: 'test',
  isStale: false,
}

describe('valuation conversion', () => {
  it('converts USD native amounts to SGD', () => {
    const result = convertNativeAmount(100, 'USD', fx)
    expect(result?.usd).toBe(100)
    expect(result?.sgd).toBe(135)
  })

  it('converts SGD native amounts to USD using the inverse rate', () => {
    const result = convertNativeAmount(135, 'SGD', fx)
    expect(result?.sgd).toBe(135)
    expect(result?.usd).toBe(100)
  })

  it('keeps a USD amount exact instead of round-tripping through SGD', () => {
    const result = convertNativeAmount(1234.56, 'USD', fx)
    expect(result?.usd).toBe(1234.56)
    expect(result?.sgd).toBe(1666.66)
  })

  it('keeps an SGD amount exact', () => {
    const result = convertNativeAmount(135.55, 'SGD', fx)
    expect(result?.sgd).toBe(135.55)
    expect(result?.usd).toBe(100.41)
  })

  it('converts HKD through the SGD rate table', () => {
    const result = convertNativeAmount(1000, 'HKD', fx)
    expect(result?.sgd).toBe(172.5)
    expect(result?.usd).toBe(127.78)
  })

  it('returns null instead of inventing a rate for a missing currency', () => {
    const withoutHkd: FxSnapshot = {
      ...fx,
      sgdPerUnit: { USD: 1.35, SGD: 1 },
    }

    expect(convertNativeAmount(1000, 'HKD', withoutHkd)).toBeNull()
  })

  it('returns null when the USD pivot rate is missing', () => {
    const withoutUsd: FxSnapshot = {
      ...fx,
      sgdPerUnit: { SGD: 1, HKD: 0.1725 },
    }

    expect(convertNativeAmount(1000, 'HKD', withoutUsd)).toBeNull()
  })
})
