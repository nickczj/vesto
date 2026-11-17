import { describe, expect, it } from 'vitest'
import { formatClock, formatCurrency, formatHistoryDate, formatRecentTimestamp, formatShortDate, formatTimestamp } from '~/utils/formatters'

describe('formatRecentTimestamp', () => {
  // Built from local-time parts so the test does not depend on the machine's zone.
  const now = new Date(2026, 10, 17, 14, 30)
  const earlierToday = new Date(2026, 10, 17, 9, 5).toISOString()
  const yesterday = new Date(2026, 10, 16, 23, 50).toISOString()

  it('shows the time alone for something that happened today', () => {
    const text = formatRecentTimestamp(earlierToday, now)
    expect(text).toMatch(/9:05/)
    expect(text).not.toMatch(/2026|Nov/)
  })

  it('shows the date as well for anything older', () => {
    expect(formatRecentTimestamp(yesterday, now)).toBe(formatTimestamp(yesterday))
    expect(formatRecentTimestamp(yesterday, now)).toMatch(/16 Nov 2026/)
  })

  it('says N/A for a missing or unreadable value', () => {
    expect(formatRecentTimestamp(null, now)).toBe('N/A')
    expect(formatRecentTimestamp('not a date', now)).toBe('N/A')
  })
})

describe('currency formatting', () => {
  it('uses the region symbols', () => {
    expect(formatCurrency(1234.5, 'SGD')).toBe('S$1,234.50')
    expect(formatCurrency(1234.5, 'USD')).toBe('US$1,234.50')
    expect(formatCurrency(1234.5, 'HKD')).toBe('HK$1,234.50')
  })
})

describe('SGT date and time labels', () => {
  it('formats a day without and with the year', () => {
    expect(formatShortDate('2026-11-16')).toBe('16 Nov')
    expect(formatHistoryDate('2026-11-16')).toBe('16 Nov 2026')
  })

  it('formats a 24-hour clock time in Singapore time', () => {
    expect(formatClock('2026-11-16T02:57:00Z')).toBe('10:57')
    expect(formatClock('2026-11-16T16:05:00Z')).toBe('00:05')
  })

  it('says N/A for missing or unreadable dates', () => {
    expect(formatShortDate(null)).toBe('N/A')
    expect(formatHistoryDate('not a date')).toBe('N/A')
    expect(formatClock(undefined)).toBe('N/A')
  })
})
