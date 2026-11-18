import type { ValuationHistoryPoint } from '~~/shared/types/history'

export const HISTORY_CHART_HEIGHT = 160
export const HISTORY_CHART_MIN_WIDTH = 320
export const HISTORY_CHART_PADDING = { top: 14, right: 14, bottom: 24, left: 80 } as const

export interface HistoryChartCoord {
  x: number
  y: number
  point: ValuationHistoryPoint
}

export interface HistoryChartGeometry {
  width: number
  height: number
  line: string
  area: string
  grid: Array<{ y: number, value: number }>
  first: HistoryChartCoord
  last: HistoryChartCoord
}

/** The history chart plots one SGD series at a time. */
export type HistorySeries = 'total' | 'exCpf'

export function historySeriesValue(point: ValuationHistoryPoint, series: HistorySeries): number | null {
  return series === 'total' ? point.netWorthSgd : point.netWorthExCpfSgd
}

/**
 * Lays the selected net-worth series out in pixels. Rows captured before the
 * ex-CPF column existed have no value for that series, so they are skipped and
 * the line starts at the first capture that has one.
 *
 * The chart is drawn at the measured width and a fixed height, so the SVG never
 * has to scale: scaling it with the page is what made the axis text grow.
 */
export function buildHistoryChart(
  points: ValuationHistoryPoint[],
  measuredWidth: number,
  series: HistorySeries = 'total',
): HistoryChartGeometry | null {
  const usable = points.filter(point => historySeriesValue(point, series) !== null)
  if (usable.length < 2) return null

  const padding = HISTORY_CHART_PADDING
  const width = Math.max(HISTORY_CHART_MIN_WIDTH, Math.round(measuredWidth))
  const height = HISTORY_CHART_HEIGHT

  const values = usable.map(point => historySeriesValue(point, series) as number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom
  const baseline = padding.top + innerHeight

  const xFor = (index: number) => padding.left + (index / (usable.length - 1)) * innerWidth
  const yFor = (value: number) => {
    const ratio = range === 0 ? 0.5 : (value - min) / range
    return padding.top + (1 - ratio) * innerHeight
  }

  const coords = usable.map((point, index) => ({
    x: xFor(index),
    y: yFor(historySeriesValue(point, series) as number),
    point,
  }))

  const line = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
    .join(' ')

  const first = coords[0]!
  const last = coords[coords.length - 1]!
  const area = `${line} L${last.x.toFixed(1)},${baseline.toFixed(1)} L${first.x.toFixed(1)},${baseline.toFixed(1)} Z`

  const grid = [0, 0.5, 1].map(ratio => ({
    y: padding.top + ratio * innerHeight,
    value: max - ratio * range,
  }))

  return { width, height, line, area, grid, first, last }
}
