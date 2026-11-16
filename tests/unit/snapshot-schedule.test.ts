import { describe, expect, it } from 'vitest'
import { nextRunAt, sgtDateKey } from '../../scripts/snapshot-schedule.mjs'

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
})
