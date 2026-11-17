<template>
  <section ref="cardEl" class="history-card">
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
          :width="chart.width"
          :height="chart.height"
          :viewBox="`0 0 ${chart.width} ${chart.height}`"
          role="img"
          :aria-label="chartSummary"
        >
          <g class="history-grid">
            <line
              v-for="line in chart.grid"
              :key="line.y"
              :x1="PADDING.left"
              :x2="chart.width - PADDING.right"
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
            {{ formatCurrency(line.value, 'SGD', true) }}
          </text>
          <text class="history-axis-label" :x="PADDING.left" :y="chart.height - 6">
            {{ formatHistoryDate(chart.first.point.asOfDate) }}
          </text>
          <text class="history-axis-label" :x="chart.width - PADDING.right" :y="chart.height - 6" text-anchor="end">
            {{ formatHistoryDate(chart.last.point.asOfDate) }}
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ValuationHistoryPoint, ValuationHistoryResponse } from '~~/shared/types/history'
import { formatCurrency, formatSignedCurrency } from '~/utils/formatters'
import { HISTORY_CHART_PADDING as PADDING, buildHistoryChart } from '~/utils/history-chart'

const props = defineProps<{
  history: ValuationHistoryResponse | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  refresh: []
}>()

const completePoints = computed<ValuationHistoryPoint[]>(
  () => (props.history?.points || []).filter(point => point.isComplete),
)

// The chart is drawn at the card's measured width and a fixed height. Letting
// the SVG scale with the page made it ~400px tall with ~21px axis text.
const cardEl = ref<HTMLElement | null>(null)
const chartWidth = ref(640)
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !cardEl.value) return

  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width
    if (width) chartWidth.value = Math.round(width)
  })
  resizeObserver.observe(cardEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

const chart = computed(() => buildHistoryChart(completePoints.value, chartWidth.value))

const chartSummary = computed(() => {
  if (!chart.value) return ''
  const { first, last } = chart.value
  return `Net worth in SGD from ${first.point.asOfDate} to ${last.point.asOfDate}, `
    + `${formatCurrency(first.point.netWorthSgd, 'SGD')} to ${formatCurrency(last.point.netWorthSgd, 'SGD')}.`
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
