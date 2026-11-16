import type { BalanceSheetResponse } from '~~/shared/types/balance-sheet'
import type {
  SnapshotCaptureResponse,
  ValuationHistoryPoint,
  ValuationHistoryRecord,
  ValuationHistoryResponse,
} from '~~/shared/types/history'
import { buildBalanceSheet } from '~~/server/services/balance-sheet'
import {
  getValuationHistoryByDate,
  listValuationHistory,
  upsertValuationHistory,
} from '~~/server/services/history-repository'
import { roundMoney, roundRate } from '~~/server/services/valuation'

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Singapore has been UTC+8 without daylight saving since 1982, so a fixed
 * offset is correct and avoids depending on the container's tz database.
 */
export function sgtDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10)
}

function withDrawdown(
  record: ValuationHistoryRecord,
  drawdownUsd: number | null,
  drawdownSgd: number | null,
): ValuationHistoryPoint {
  return { ...record, drawdownUsd, drawdownSgd }
}

/**
 * Drawdown is computed from the series at read time so there is no state to
 * migrate or keep in sync. Incomplete days are kept in `points` for visibility
 * but never set a peak and never get a drawdown.
 */
export function buildHistoryResponse(records: ValuationHistoryRecord[]): ValuationHistoryResponse {
  const points: ValuationHistoryPoint[] = []
  let peakUsd: number | null = null
  let peakSgd: number | null = null
  let firstCompleteDate: string | null = null
  let lastCompleteDate: string | null = null
  let completeDays = 0
  let incompleteDays = 0
  let latest: ValuationHistoryPoint | null = null

  for (const record of records) {
    if (!record.isComplete) {
      incompleteDays += 1
      points.push(withDrawdown(record, null, null))
      continue
    }

    completeDays += 1
    firstCompleteDate ??= record.asOfDate
    lastCompleteDate = record.asOfDate

    peakUsd = peakUsd === null ? record.netWorthUsd : Math.max(peakUsd, record.netWorthUsd)
    peakSgd = peakSgd === null ? record.netWorthSgd : Math.max(peakSgd, record.netWorthSgd)

    const drawdownUsd = peakUsd > 0 ? record.netWorthUsd / peakUsd - 1 : null
    const drawdownSgd = peakSgd > 0 ? record.netWorthSgd / peakSgd - 1 : null
    latest = withDrawdown(record, drawdownUsd, drawdownSgd)
    points.push(latest)
  }

  return {
    generatedAt: new Date().toISOString(),
    points,
    completeDays,
    incompleteDays,
    firstCompleteDate,
    lastCompleteDate,
    latest,
    peakSgd,
    peakUsd,
    currentSgd: latest?.netWorthSgd ?? null,
    currentUsd: latest?.netWorthUsd ?? null,
    drawdownSgd: latest?.drawdownSgd ?? null,
    drawdownUsd: latest?.drawdownUsd ?? null,
  }
}

export function readValuationHistory(days: number): ValuationHistoryResponse {
  const since = sgtDateKey(new Date(Date.now() - (days - 1) * DAY_MS))
  return buildHistoryResponse(listValuationHistory(since))
}

export type CaptureSnapshotResult = SnapshotCaptureResponse | { status: 'fx_unavailable' }

/** A complete day is final unless explicitly forced; an incomplete day may improve. */
export function shouldReplaceHistory(
  existing: ValuationHistoryRecord | null,
  force = false,
): boolean {
  return force || existing === null || !existing.isComplete
}

/** Turn a balance-sheet response into the row for today's SGT date. */
export function buildHistoryRecord(
  sheet: BalanceSheetResponse,
  now: Date,
): ValuationHistoryRecord | null {
  if (!sheet.fx) return null

  const unpriced = sheet.rows.filter(row => row.source === 'unpriced').length

  return {
    asOfDate: sgtDateKey(now),
    capturedAt: now.toISOString(),
    netWorthUsd: roundMoney(sheet.totals.netWorth.usd),
    netWorthSgd: roundMoney(sheet.totals.netWorth.sgd),
    assetsUsd: roundMoney(sheet.totals.totalAssets.usd),
    liabilitiesUsd: roundMoney(sheet.totals.totalLiabilities.usd),
    fxUsdSgd: roundRate(sheet.fx.usdToSgd),
    priced: sheet.rows.length - unpriced,
    unpriced,
    isComplete: unpriced === 0,
  }
}

/**
 * Capture the same balance sheet the page shows into one row per SGT date.
 * A complete day is never overwritten unless `force` is set; an incomplete day
 * may be improved by a later retry. This keeps retries idempotent.
 */
export async function captureValuationSnapshot(
  options: { force?: boolean; now?: Date } = {},
): Promise<CaptureSnapshotResult> {
  const now = options.now ?? new Date()
  const asOfDate = sgtDateKey(now)
  const existing = getValuationHistoryByDate(asOfDate)

  // Check this before fetching quotes: the sidecar calls on every deploy, and a
  // complete day must not cost a fresh provider round-trip.
  if (existing && !shouldReplaceHistory(existing, options.force)) {
    return {
      status: 'unchanged',
      point: withDrawdown(existing, null, null),
    }
  }

  const sheet: BalanceSheetResponse = await buildBalanceSheet('always')
  if (!sheet.fx) {
    return { status: 'fx_unavailable' }
  }

  const record = buildHistoryRecord(sheet, now)
  if (!record) {
    return { status: 'fx_unavailable' }
  }

  upsertValuationHistory(record)

  return {
    status: existing ? 'updated' : 'created',
    point: withDrawdown(record, null, null),
  }
}
