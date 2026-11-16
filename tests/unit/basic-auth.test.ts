import { describe, expect, it } from 'vitest'
import {
  isAuthorized,
  parseBasicAuthorization,
  safeEqual,
} from '~~/server/utils/basic-auth'

function header(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`
}

const expected = { user: 'vesto', password: 'correct horse battery staple' }

describe('basic auth parsing', () => {
  it('parses a well-formed credential', () => {
    expect(parseBasicAuthorization(header('vesto', 'secret'))).toEqual({
      user: 'vesto',
      password: 'secret',
    })
  })

  it('is case-insensitive about the scheme', () => {
    const value = `basic ${Buffer.from('vesto:secret').toString('base64')}`
    expect(parseBasicAuthorization(value)).toEqual({ user: 'vesto', password: 'secret' })
  })

  it('keeps colons in the password', () => {
    expect(parseBasicAuthorization(header('vesto', 'a:b:c'))).toEqual({
      user: 'vesto',
      password: 'a:b:c',
    })
  })

  it('rejects missing or malformed headers', () => {
    expect(parseBasicAuthorization(undefined)).toBeNull()
    expect(parseBasicAuthorization('')).toBeNull()
    expect(parseBasicAuthorization('Bearer token')).toBeNull()
    expect(parseBasicAuthorization('Basic')).toBeNull()
    expect(parseBasicAuthorization(`Basic ${Buffer.from('no-colon').toString('base64')}`)).toBeNull()
  })
})

describe('basic auth comparison', () => {
  it('compares values without leaking length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })

  it('accepts only the exact credentials', () => {
    expect(isAuthorized(header(expected.user, expected.password), expected)).toBe(true)
    expect(isAuthorized(header(expected.user, 'wrong'), expected)).toBe(false)
    expect(isAuthorized(header('someone', expected.password), expected)).toBe(false)
    expect(isAuthorized(null, expected)).toBe(false)
    expect(isAuthorized('', expected)).toBe(false)
  })

  it('handles non-ASCII credentials', () => {
    const unicode = { user: 'vesto', password: 'pässwörd' }
    expect(isAuthorized(header(unicode.user, unicode.password), unicode)).toBe(true)
  })
})
