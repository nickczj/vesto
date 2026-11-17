import { describe, expect, it } from 'vitest'
import {
  formatCurrencyVenue,
  normalizeMarketCode,
  venueLabel,
  venueTitle,
} from '~~/shared/utils/markets'

describe('market normalization', () => {
  it('maps provider aliases to the codes the app stores', () => {
    expect(normalizeMarketCode(' hkg ')).toBe('SEHK')
    expect(normalizeMarketCode('XHKG')).toBe('SEHK')
    expect(normalizeMarketCode('XLON')).toBe('LSE')
    expect(normalizeMarketCode('XAMS')).toBe('AMS')
    expect(normalizeMarketCode('XNAS')).toBe('NMS')
    expect(normalizeMarketCode('NASDAQ')).toBe('NMS')
    expect(normalizeMarketCode('NYSE')).toBe('NYQ')
    expect(normalizeMarketCode('ARCA')).toBe('PCX')
    expect(normalizeMarketCode('NYSEARCA')).toBe('PCX')
  })

  it('keeps unknown and already-canonical codes', () => {
    expect(normalizeMarketCode('SEHK')).toBe('SEHK')
    expect(normalizeMarketCode('lse')).toBe('LSE')
    expect(normalizeMarketCode('JPX')).toBe('JPX')
  })

  it('returns null for a missing market', () => {
    expect(normalizeMarketCode(null)).toBeNull()
    expect(normalizeMarketCode(undefined)).toBeNull()
    expect(normalizeMarketCode('   ')).toBeNull()
  })
})

describe('venue labels', () => {
  it('uses a short venue name for the ledger', () => {
    expect(venueLabel('SEHK')).toBe('HKEX')
    expect(venueLabel('HKG')).toBe('HKEX')
    expect(venueLabel('NMS')).toBe('NASDAQ')
    expect(venueLabel('AMS')).toBe('Euronext')
    expect(venueLabel('PCX')).toBe('NYSE Arca')
  })

  it('falls back to the code for an unknown venue', () => {
    expect(venueLabel('JPX')).toBe('JPX')
    expect(venueLabel(null)).toBeNull()
  })

  it('gives a fuller tooltip with the raw code', () => {
    expect(venueTitle('SEHK')).toBe('Stock Exchange of Hong Kong (SEHK)')
    expect(venueTitle('HKG')).toBe('Stock Exchange of Hong Kong (SEHK)')
    expect(venueTitle('JPX')).toBe('JPX')
    expect(venueTitle(null)).toBeNull()
  })
})

describe('currency and venue cell', () => {
  it('combines the currency with the venue', () => {
    expect(formatCurrencyVenue('HKD', 'SEHK')).toBe('HKD · HKEX')
    expect(formatCurrencyVenue('USD', 'HKG')).toBe('USD · HKEX')
    expect(formatCurrencyVenue('USD', 'NMS')).toBe('USD · NASDAQ')
  })

  it('shows only the currency when there is no market', () => {
    expect(formatCurrencyVenue('SGD', null)).toBe('SGD')
    expect(formatCurrencyVenue('SGD', '')).toBe('SGD')
  })
})
