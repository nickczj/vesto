import { describe, expect, it } from 'vitest'
import type { ValuationHistoryPoint } from '~~/shared/types/history'
import {
  HISTORY_CHART_HEIGHT,
  HISTORY_CHART_MIN_WIDTH,
  HISTORY_CHART_PADDING,
  buildHistoryChart,
} from '~/utils/history-chart'

function point(asOfDate: string, netWorthSgd: number): ValuationHistoryPoint {
  return {
    asOfDate,
    capturedAt: `${asOfDate}T00:00:00.000Z`,
    netWorthUsd: netWorthSgd / 1.3,
    netWorthSgd,
    assetsUsd: netWorthSgd / 1.3,
    liabilitiesUsd: 0,
    fxUsdSgd: 1.3,
    priced: 1,
    unpriced: 0,
    isComplete: true,
    drawdownUsd: 0,
    drawdownSgd: 0,
  }
}

const series = [
  point('2026-11-14', 100),
  point('2026-11-15', 300),
  point('2026-11-16', 200),
]

describe('history chart geometry', () => {
  it('needs two points before it draws anything', () => {
    expect(buildHistoryChart([], 800)).toBeNull()
    expect(buildHistoryChart([series[0]!], 800)).toBeNull()
  })

  it('draws at the measured width and never changes height', () => {
    const narrow = buildHistoryChart(series, 500.4)!
    const wide = buildHistoryChart(series, 1342)!

    expect(narrow.width).toBe(500)
    expect(wide.width).toBe(1342)
    expect(narrow.height).toBe(HISTORY_CHART_HEIGHT)
    expect(wide.height).toBe(HISTORY_CHART_HEIGHT)
  })

  it('does not collapse below the minimum width', () => {
    expect(buildHistoryChart(series, 0)!.width).toBe(HISTORY_CHART_MIN_WIDTH)
  })

  it('spans the plot area from the first point to the last', () => {
    const chart = buildHistoryChart(series, 1000)!
    const { top, right, bottom, left } = HISTORY_CHART_PADDING

    expect(chart.first.x).toBe(left)
    expect(chart.last.x).toBe(1000 - right)
    // 100 is the minimum, so it sits on the baseline; 200 is halfway up.
    expect(chart.first.y).toBe(HISTORY_CHART_HEIGHT - bottom)
    expect(chart.last.y).toBe(top + (HISTORY_CHART_HEIGHT - top - bottom) / 2)
    expect(chart.last.point.asOfDate).toBe('2026-11-16')
  })

  it('labels the grid with the maximum, midpoint and minimum', () => {
    const chart = buildHistoryChart(series, 1000)!
    expect(chart.grid.map(line => line.value)).toEqual([300, 200, 100])
    expect(chart.grid[0]!.y).toBe(HISTORY_CHART_PADDING.top)
  })

  it('centres a flat series instead of dividing by zero', () => {
    const chart = buildHistoryChart([point('2026-11-15', 50), point('2026-11-16', 50)], 1000)!
    const { top, bottom } = HISTORY_CHART_PADDING

    expect(chart.first.y).toBe(top + (HISTORY_CHART_HEIGHT - top - bottom) / 2)
    expect(chart.line).not.toContain('NaN')
  })
})
