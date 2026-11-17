/**
 * SGT calendar helpers shared by the snapshot sidecar and its tests.
 * Singapore is UTC+8 without daylight saving, so a fixed offset is exact.
 */
export const SGT_OFFSET_MS = 8 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

export function sgtDateKey(date = new Date()) {
  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * The next `hourSgt`:00 SGT instant strictly after `now`. Because SGT is a
 * fixed offset, this is a UTC instant at `hourSgt - 8` on the SGT date (or the
 * previous UTC day for hours before 08:00).
 */
export function nextRunAt(now = new Date(), hourSgt = 8) {
  const hour = Math.min(23, Math.max(0, Number(hourSgt)))
  const shifted = new Date(now.getTime() + SGT_OFFSET_MS)
  let target = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    hour - 8,
    0,
    0,
  )

  if (target <= now.getTime()) {
    target += DAY_MS
  }

  return new Date(target)
}

/**
 * Whether `now` is at or after `hourSgt`:00 SGT today.
 *
 * A row captured before the cut-off holds intraday prices. Because the app
 * marks a row complete whenever every row is priced, that row would then never
 * be replaced — the scheduled run sees a complete day and reports "unchanged".
 * Startup catch-up is gated on this so a restart at 03:00 waits for 08:00
 * instead of freezing the day at the wrong point.
 */
export function hasReachedCutoff(now = new Date(), hourSgt = 8) {
  const hour = Math.min(23, Math.max(0, Number(hourSgt)))
  const shifted = new Date(now.getTime() + SGT_OFFSET_MS)
  return shifted.getUTCHours() >= hour
}
