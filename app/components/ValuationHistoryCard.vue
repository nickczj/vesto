<template>
  <section class="history-card">
    <header class="history-header">
      <div>
        <h2>Net worth history</h2>
        <p class="muted">
          Daily snapshot at 08:00 SGT.
          <template v-if="history && history.firstCompleteDate">
            Since {{ formatHistoryDate(history.firstCompleteDate) }}.
          </template>
        </p>
      </div>

      <div class="history-header-actions">
        <span v-if="history" class="history-days muted">
          {{ history.completeDays }} complete<template v-if="history.incompleteDays > 0"> · {{ history.incompleteDays }} excluded</template>
        </span>
        <UButton size="xs" color="neutral" variant="soft" :loading="loading" @click="emit('refresh')">
          Refresh
        </UButton>
      </div>
    </header>

    <p v-if="error" class="history-note warning">
      History refresh failed: {{ error }}
    </p>

    <template v-if="history && history.latest">
      <div class="history-stats">
        <article class="history-stat">
          <span class="history-stat-label">Current (SGD)</span>
          <strong>{{ displayMoney(history.currentSgd, 'SGD') }}</strong>
          <span class="history-stat-secondary">{{ displayMoney(history.currentUsd, 'USD') }}</span>
        </article>

        <article class="history-stat">
          <span class="history-stat-label">Peak (SGD)</span>
          <strong>{{ displayMoney(history.peakSgd, 'SGD') }}</strong>
          <span class="history-stat-secondary">{{ displayMoney(history.peakUsd, 'USD') }}</span>
        </article>

        <article class="history-stat">
          <span class="history-stat-label">From peak</span>
          <strong :class="drawdownClass">{{ formatPercent(history.drawdownSgd) }}</strong>
          <span class="history-stat-secondary">
            {{ formatDrawdownAmount(history.currentSgd, history.peakSgd) }}
            · USD {{ formatPercent(history.drawdownUsd) }}
          </span>
        </article>
      </div>

      <div v-if="chart" class="history-chart-wrap">
        <svg
          class="history-chart"
          :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
          role="img"
          :aria-label="chartSummary"
        >
          <g class="history-grid">
            <line
              v-for="line in chart.grid"
              :key="line.y"
              :x1="PADDING.left"
              :x2="CHART_WIDTH - PADDING.right"
              :y1="line.y"
              :y2="line.y"
            />
          </g>

          <path class="history-area" :d="chart.area" />
          <path class="history-line" :d="chart.line" />
          <circle class="history-dot" :cx="chart.last.x" :cy="chart.last.y" r="3.5" />

          <text
            v-for="line in chart.grid"
            :key="`label-${line.y}`"
            class="history-axis-label"
            :x="PADDING.left - 8"
            :y="line.y + 4"
            text-anchor="end"
          >
            {{ line.label }}
          </text>
          <text class="history-axis-label" :x="PADDING.left" :y="CHART_HEIGHT - 6">
            {{ formatHistoryDate(chart.firstPoint.asOfDate) }}
          </text>
          <text class="history-axis-label" :x="CHART_WIDTH - PADDING.right" :y="CHART_HEIGHT - 6" text-anchor="end">
            {{ formatHistoryDate(chart.lastPoint.asOfDate) }}
          </text>
        </svg>
      </div>

      <p v-else class="history-note muted">
        A trend needs at least two complete days. The first snapshot is recorded; check back tomorrow.
      </p>

      <p v-if="history.incompleteDays > 0" class="history-note muted">
        Incomplete days are stored but excluded from the chart and drawdown: at least one row had no trustworthy price.
      </p>
    </template>

    <p v-else-if="history" class="history-note muted">
      <template v-if="history.incompleteDays > 0">
        {{ history.incompleteDays }} incomplete day<template v-if="history.incompleteDays > 1">s are</template><template v-else> is</template>
        excluded. A complete day is needed before a trend can start.
      </template>
      <template v-else>
        History starts when the first snapshot runs at 08:00 SGT. Backfill is not possible, so the series begins today.
      </template>
    </p>

    <p v-else-if="!error" class="history-note muted">
      Loading history…
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ValuationHistoryPoint, ValuationHistoryResponse } from '~~/shared/types/history'
import { formatCurrency, formatSignedCurrency } from '~/utils/formatters'

const props = defineProps<{
  history: ValuationHistoryResponse | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

const CHART_WIDTH = 640
const CHART_HEIGHT = 190
const PADDING = { top: 14, right: 14, bottom: 24, left: 80 }

const completePoints = computed<ValuationHistoryPoint[]>(
  () => (props.history?.points || []).filter(point => point.isComplete),
)

const chart = computed(() => {
  const points = completePoints.value
  if (points.length < 2) return null

  const values = points.map(point => point.netWorthSgd)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const baseline = PADDING.top + innerHeight

  const xFor = (index: number) => PADDING.left + (index / (points.length - 1)) * innerWidth
  const yFor = (value: number) => {
    const ratio = range === 0 ? 0.5 : (value - min) / range
    return PADDING.top + (1 - ratio) * innerHeight
  }

  const coords = points.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.netWorthSgd),
    point,
  }))

  const line = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
    .join(' ')

  const first = coords[0]!
  const last = coords[coords.length - 1]!
  const area = `${line} L${last.x.toFixed(1)},${baseline.toFixed(1)} L${first.x.toFixed(1)},${baseline.toFixed(1)} Z`

  const grid = [0, 0.5, 1].map((ratio) => {
    const value = max - ratio * range
    return {
      y: PADDING.top + ratio * innerHeight,
      label: formatCurrency(value, 'SGD', true),
    }
  })

  return {
    line,
    area,
    grid,
    first,
    last,
    firstPoint: first.point,
    lastPoint: last.point,
  }
})

const chartSummary = computed(() => {
  if (!chart.value) return ''
  return `Net worth in SGD from ${chart.value.firstPoint.asOfDate} to ${chart.value.lastPoint.asOfDate}, `
    + `${formatCurrency(chart.value.firstPoint.netWorthSgd, 'SGD')} to ${formatCurrency(chart.value.lastPoint.netWorthSgd, 'SGD')}.`
})

const drawdownClass = computed(() => {
  const value = props.history?.drawdownSgd
  if (value === null || value === undefined || value === 0) return 'pnl-flat'
  return value < 0 ? 'pnl-loss' : 'pnl-profit'
})

function displayMoney(value: number | null | undefined, currency: 'USD' | 'SGD'): string {
  if (value === null || value === undefined) return '—'
  return formatCurrency(value, currency)
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-SG', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDrawdownAmount(current: number | null | undefined, peak: number | null | undefined): string {
  if (current === null || current === undefined || peak === null || peak === undefined) return '—'
  return formatSignedCurrency(current - peak, 'SGD')
}

function formatHistoryDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}
</script>
