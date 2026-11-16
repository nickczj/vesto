import { asc, eq, gte } from 'drizzle-orm'
import type { ValuationHistoryRecord } from '~~/shared/types/history'
import { valuationHistory } from '~~/server/database/schema'
import { useDb } from '~~/server/utils/db'

type ValuationHistoryRow = typeof valuationHistory.$inferSelect

function toDomain(row: ValuationHistoryRow): ValuationHistoryRecord {
  return {
    asOfDate: row.asOfDate,
    capturedAt: row.capturedAt,
    netWorthUsd: Number(row.netWorthUsd),
    netWorthSgd: Number(row.netWorthSgd),
    assetsUsd: Number(row.assetsUsd),
    liabilitiesUsd: Number(row.liabilitiesUsd),
    fxUsdSgd: Number(row.fxUsdSgd),
    priced: Number(row.priced),
    unpriced: Number(row.unpriced),
    isComplete: Boolean(row.isComplete),
  }
}

export function getValuationHistoryByDate(asOfDate: string): ValuationHistoryRecord | null {
  const db = useDb()
  const row = db
    .select()
    .from(valuationHistory)
    .where(eq(valuationHistory.asOfDate, asOfDate))
    .get()

  return row ? toDomain(row) : null
}

export function listValuationHistory(sinceDate?: string): ValuationHistoryRecord[] {
  const db = useDb()
  const rows = sinceDate
    ? db
        .select()
        .from(valuationHistory)
        .where(gte(valuationHistory.asOfDate, sinceDate))
        .orderBy(asc(valuationHistory.asOfDate))
        .all()
    : db
        .select()
        .from(valuationHistory)
        .orderBy(asc(valuationHistory.asOfDate))
        .all()

  return rows.map(toDomain)
}

export function upsertValuationHistory(record: ValuationHistoryRecord): void {
  const db = useDb()

  db.insert(valuationHistory)
    .values({
      asOfDate: record.asOfDate,
      capturedAt: record.capturedAt,
      netWorthUsd: record.netWorthUsd,
      netWorthSgd: record.netWorthSgd,
      assetsUsd: record.assetsUsd,
      liabilitiesUsd: record.liabilitiesUsd,
      fxUsdSgd: record.fxUsdSgd,
      priced: record.priced,
      unpriced: record.unpriced,
      isComplete: record.isComplete,
    })
    .onConflictDoUpdate({
      target: valuationHistory.asOfDate,
      set: {
        capturedAt: record.capturedAt,
        netWorthUsd: record.netWorthUsd,
        netWorthSgd: record.netWorthSgd,
        assetsUsd: record.assetsUsd,
        liabilitiesUsd: record.liabilitiesUsd,
        fxUsdSgd: record.fxUsdSgd,
        priced: record.priced,
        unpriced: record.unpriced,
        isComplete: record.isComplete,
      },
    })
    .run()
}
