import { describe, expect, it } from 'vitest'
import { formatRecentTimestamp, formatTimestamp } from '~/utils/formatters'

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
