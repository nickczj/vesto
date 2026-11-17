import { describe, expect, it } from 'vitest'
import { hasReachedCutoff, nextRunAt, sgtDateKey } from '../../scripts/snapshot-schedule.mjs'

describe('snapshot schedule', () => {
  it('rolls the SGT date at 16:00 UTC', () => {
    expect(sgtDateKey(new Date('2026-11-16T15:59:59Z'))).toBe('2026-11-16')
    expect(sgtDateKey(new Date('2026-11-16T16:00:00Z'))).toBe('2026-11-17')
  })

  it('schedules 08:00 SGT (00:00 UTC) for later the same SGT day', () => {
    expect(nextRunAt(new Date('2026-11-15T23:00:00Z'), 8).toISOString())
      .toBe('2026-11-16T00:00:00.000Z')

    expect(nextRunAt(new Date('2026-11-16T00:00:01Z'), 8).toISOString())
      .toBe('2026-11-17T00:00:00.000Z')
  })

  it('moves to tomorrow when called exactly at the cut-off', () => {
    expect(nextRunAt(new Date('2026-11-16T00:00:00Z'), 8).toISOString())
      .toBe('2026-11-17T00:00:00.000Z')
  })

  it('handles an SGT hour before 08:00 without shifting the date', () => {
    // 00:00 SGT on 17 Nov is 16:00 UTC on 16 Nov.
    expect(nextRunAt(new Date('2026-11-16T12:00:00Z'), 0).toISOString())
      .toBe('2026-11-16T16:00:00.000Z')
  })

  it('reports the cut-off only from 08:00 SGT onwards', () => {
    // 07:59:59 SGT on 17 Nov — the dangerous restart window.
    expect(hasReachedCutoff(new Date('2026-11-16T23:59:59Z'), 8)).toBe(false)
    // 03:00 SGT on 17 Nov: a restart here must not write today's row.
    expect(hasReachedCutoff(new Date('2026-11-16T19:00:00Z'), 8)).toBe(false)
    // Exactly 00:00 UTC = 08:00 SGT on 17 Nov.
    expect(hasReachedCutoff(new Date('2026-11-17T00:00:00Z'), 8)).toBe(true)
    // 09:00 SGT on 17 Nov: a late catch-up is expected.
    expect(hasReachedCutoff(new Date('2026-11-17T01:00:00Z'), 8)).toBe(true)
    // 23:59 SGT on 16 Nov is past the 16th's cut-off; the row already exists.
    expect(hasReachedCutoff(new Date('2026-11-16T15:59:59Z'), 8)).toBe(true)
  })

  it('always reports the cut-off for an SGT hour of 0', () => {
    expect(hasReachedCutoff(new Date('2026-11-16T15:59:59Z'), 0)).toBe(true)
    expect(hasReachedCutoff(new Date('2026-11-16T16:00:00Z'), 0)).toBe(true)
  })

  it('clamps an out-of-range SGT hour', () => {
    // A configured hour above 23 must behave like 23, not like "always ready".
    expect(hasReachedCutoff(new Date('2026-11-16T14:59:59Z'), 99)).toBe(false)
    expect(hasReachedCutoff(new Date('2026-11-16T15:00:00Z'), 99)).toBe(true)
  })
})
