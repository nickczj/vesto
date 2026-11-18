<template>
  <section ref="cardEl" class="history-card">
    <header class="history-header">
      <div class="history-title">
        <h2>Daily history, SGD</h2>
        <p class="muted">
          Snapshot at 08:00 SGT.
          <template v-if="history && history.firstCompleteDate">
            Since {{ formatHistoryDate(history.firstCompleteDate) }}.
          </template>
        </p>
      </div>

      <div class="history-controls">
        <div class="segmented history-series" role="group" aria-label="History series">
          <button
            v-for="option in HISTORY_SERIES"
            :key="option.value"
            type="button"
            class="segmented-option"
            :class="{ active: series === option.value }"
            :aria-pressed="series === option.value"
            @click="series = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="segmented history-range" role="group" aria-label="History range">
          <button
            v-for="option in HISTORY_RANGES"
            :key="option.value"
            type="button"
            class="segmented-option"
            :class="{ active: range === option.value }"
            :aria-pressed="range === option.value"
            @click="range = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </header>

    <p v-if="error" class="history-note warning">
      History refresh failed: {{ error }}
    </p>

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
          {{ formatShortDate(chart.first.point.asOfDate) }}
        </text>
        <text class="history-axis-label" :x="chart.width - PADDING.right" :y="chart.height - 6" text-anchor="end">
          {{ formatShortDate(chart.last.point.asOfDate) }}
        </text>
      </svg>
    </div>

    <p v-else-if="history && series === 'exCpf' && exCpfPoints.length < 2" class="history-note muted">
      {{ exCpfStartNote }}
    </p>

    <p v-else-if="history && completePoints.length >= 2" class="history-note muted">
      Not enough history in this range. Choose a wider range.
    </p>

    <p v-else-if="history" class="history-note muted">
      <template v-if="history.incompleteDays > 0">
        {{ history.incompleteDays }} incomplete day<template v-if="history.incompleteDays > 1">s are</template><template v-else> is</template>
        excluded. A complete day is needed before a trend can start.
      </template>
      <template v-else>
        A trend needs at least two complete days. The first snapshot is recorded; check back tomorrow.
      </template>
    </p>

    <p v-else-if="!error" class="history-note muted">
      {{ loading ? 'Loading history…' : 'History is unavailable.' }}
    </p>

    <p v-if="history" class="history-note muted">
      <template v-if="peakText">
        {{ peakText }}
      </template>
      <template v-if="series === 'exCpf' && exCpfFirstDate">
        Ex-CPF series starts {{ formatHistoryDate(exCpfFirstDate) }}.
      </template>
      History starts {{ history.firstCompleteDate ? formatHistoryDate(history.firstCompleteDate) : 'with the first snapshot' }} and cannot be backfilled.
    </p>

    <p v-if="history && history.incompleteDays > 0" class="history-note muted">
      Incomplete days are stored but excluded from the chart and drawdown: at least one row had no trustworthy price.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ValuationHistoryPoint, ValuationHistoryResponse } from '~~/shared/types/history'
import { formatCurrency, formatHistoryDate, formatShortDate } from '~/utils/formatters'
import { HISTORY_CHART_PADDING as PADDING, buildHistoryChart, historySeriesValue, type HistorySeries } from '~/utils/history-chart'
import {
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  filterHistoryByRange,
  peakHistoryPoint,
} from '~/utils/history-range'

const props = defineProps<{
  history: ValuationHistoryResponse | null
  loading: boolean
  error: string | null
}>()

const HISTORY_SERIES: Array<{ value: HistorySeries, label: string }> = [
  { value: 'total', label: 'Total' },
  { value: 'exCpf', label: 'Ex-CPF' },
]

const range = ref(DEFAULT_HISTORY_RANGE)
const series = ref<HistorySeries>('total')

const completePoints = computed<ValuationHistoryPoint[]>(
  () => (props.history?.points || []).filter(point => point.isComplete),
)

const displayPoints = computed(() => filterHistoryByRange(completePoints.value, range.value))
const exCpfPoints = computed(() => completePoints.value.filter(point => point.netWorthExCpfSgd !== null))
const exCpfFirstDate = computed(() => exCpfPoints.value[0]?.asOfDate ?? null)
const exCpfStartNote = computed(() => exCpfPoints.value.length === 0
  ? 'Ex-CPF history starts at the next 08:00 snapshot. It cannot be backfilled.'
  : 'One ex-CPF day captured. A trend needs two; check back tomorrow.')
const peak = computed(() => peakHistoryPoint(completePoints.value, 'SGD', series.value))

const peakText = computed(() => {
  if (!peak.value) return null

  const value = series.value === 'exCpf' ? peak.value.netWorthExCpfSgd : peak.value.netWorthSgd
  if (value === null) return null

  return `Peak ${formatCurrency(value, 'SGD')} on ${formatShortDate(peak.value.asOfDate)}.`
})

// The chart is drawn at the card's measured width and a fixed height. Letting
// the SVG scale with the page made it ~400px tall with ~21px axis text.
const cardEl = ref<HTMLElement | null>(null)
const chartWidth = ref(520)
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

const chart = computed(() => buildHistoryChart(displayPoints.value, chartWidth.value, series.value))

const chartSummary = computed(() => {
  if (!chart.value) return ''

  const { first, last } = chart.value
  const firstValue = historySeriesValue(first.point, series.value)
  const lastValue = historySeriesValue(last.point, series.value)
  if (firstValue === null || lastValue === null) return ''

  const label = series.value === 'exCpf' ? 'Net worth excluding CPF' : 'Net worth'
  return `${label} in SGD from ${first.point.asOfDate} to ${last.point.asOfDate}, `
    + `${formatCurrency(firstValue, 'SGD')} to ${formatCurrency(lastValue, 'SGD')}.`
})
</script>
