import { describe, expect, it } from 'vitest'
import { reconcileMarketChoice, unknownMarketWarning } from '~~/shared/utils/market-selection'

describe('market reconciliation', () => {
  it('adopts the resolved venue for an auto-filled or empty market', () => {
    expect(reconcileMarketChoice({ market: null, source: 'auto', resolved: 'NMS' })).toEqual({
      market: 'NMS',
      source: 'auto',
      mismatch: null,
    })
    expect(reconcileMarketChoice({ market: 'SEHK', source: 'auto', resolved: 'NMS' })).toEqual({
      market: 'NMS',
      source: 'auto',
      mismatch: null,
    })
  })

  it('keeps a manual venue and reports the mismatch', () => {
    expect(reconcileMarketChoice({ market: 'SEHK', source: 'manual', resolved: 'NMS' })).toEqual({
      market: 'SEHK',
      source: 'manual',
      mismatch: 'NMS',
    })
  })

  it('does not report a mismatch when the manual venue matches', () => {
    expect(reconcileMarketChoice({ market: 'HKG', source: 'manual', resolved: 'SEHK' })).toEqual({
      market: 'SEHK',
      source: 'manual',
      mismatch: null,
    })
  })

  it('leaves the market alone when the quote has no venue', () => {
    expect(reconcileMarketChoice({ market: 'LSE', source: 'manual', resolved: null })).toEqual({
      market: 'LSE',
      source: 'manual',
      mismatch: null,
    })
  })
})

describe('unknown market warning', () => {
  it('stays quiet for a known or aliased venue', () => {
    expect(unknownMarketWarning('NMS')).toBeNull()
    expect(unknownMarketWarning('HKG')).toBeNull()
    expect(unknownMarketWarning(null)).toBeNull()
    expect(unknownMarketWarning('  ')).toBeNull()
  })

  it('warns without blocking an unrecognised code', () => {
    expect(unknownMarketWarning('JPX')).toContain('JPX')
    expect(unknownMarketWarning('JPX')).toContain('may still resolve')
  })
})
