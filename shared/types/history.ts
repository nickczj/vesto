export interface ValuationHistoryRecord {
  /** SGT calendar date, `YYYY-MM-DD`. */
  asOfDate: string
  capturedAt: string
  netWorthUsd: number
  netWorthSgd: number
  assetsUsd: number
  liabilitiesUsd: number
  fxUsdSgd: number
  priced: number
  unpriced: number
  /** No unpriced rows and an FX rate existed when the snapshot was taken. */
  isComplete: boolean
}

export interface ValuationHistoryPoint extends ValuationHistoryRecord {
  /** Running-max drawdown, only on complete points. A fraction, e.g. -0.052. */
  drawdownUsd: number | null
  drawdownSgd: number | null
}

export interface ValuationHistoryResponse {
  generatedAt: string
  points: ValuationHistoryPoint[]
  completeDays: number
  incompleteDays: number
  firstCompleteDate: string | null
  lastCompleteDate: string | null
  /** The most recent complete day, not the most recent row. */
  latest: ValuationHistoryPoint | null
  peakSgd: number | null
  peakUsd: number | null
  currentSgd: number | null
  currentUsd: number | null
  drawdownSgd: number | null
  drawdownUsd: number | null
}

export type SnapshotWriteStatus = 'created' | 'updated' | 'unchanged'

export interface SnapshotCaptureResponse {
  status: SnapshotWriteStatus
  point: ValuationHistoryPoint
}
