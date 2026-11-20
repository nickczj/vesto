import { describe, expect, it } from 'vitest'
import { NO_VALUE } from '~/utils/ledger'
import { HIDDEN_VALUE, maskValue } from '~/utils/privacy'

describe('privacy mask', () => {
  it('replaces a rendered value with one fixed token', () => {
    expect(maskValue('S$1,234.56', true)).toBe(HIDDEN_VALUE)
    expect(maskValue('17.9%', true)).toBe(HIDDEN_VALUE)
    expect(maskValue('(840.00)', true)).toBe(HIDDEN_VALUE)
  })

  it('does not leak magnitude through the mask width', () => {
    expect(maskValue('1.00', true)).toBe(maskValue('9,999,999.99', true))
  })

  it('leaves values alone when they are visible', () => {
    expect(maskValue('S$1,234.56', false)).toBe('S$1,234.56')
  })

  it('does not mask an empty cell or the unknown-value placeholder', () => {
    expect(maskValue('', true)).toBe('')
    expect(maskValue(null, true)).toBe('')
    expect(maskValue(NO_VALUE, true)).toBe(NO_VALUE)
  })
})
