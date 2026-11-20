<template>
  <div ref="root" class="source-status">
    <button
      type="button"
      class="source-chip"
      :class="`state-${chipState}`"
      :aria-expanded="isOpen"
      aria-haspopup="true"
      @click="toggle"
    >
      <span class="source-dot" aria-hidden="true" />
      <span>{{ chipLabel }}</span>
    </button>

    <div v-if="isOpen" class="source-panel" role="region" aria-label="Provider health">
      <header class="source-panel-header">
        <div>
          <h2>Provider health</h2>
          <p v-if="snapshot && snapshot.sources.length > 0" class="muted">
            Last {{ windowLabel }}<template v-if="snapshot.asOf"> · read {{ formatTimestamp(snapshot.asOf) }}</template>
          </p>
        </div>
        <UButton size="xs" color="neutral" variant="soft" :loading="isLoading" @click="onRefresh">
          Refresh
        </UButton>
      </header>

      <p v-if="errorMessage" class="source-panel-note warning">
        {{ errorMessage }}
      </p>
      <p v-else-if="isUnreachable" class="source-panel-note warning">
        <template v-if="snapshot && snapshot.sources.length > 0">
          The market-data service is not responding. This is the last successful read; prices on the page are the last ones fetched.
        </template>
        <template v-else>
          The market-data service is not responding. No provider status has been read yet; prices on the page are the last ones fetched.
        </template>
      </p>

      <ul v-if="snapshot && snapshot.sources.length > 0" class="source-list">
        <li v-for="source in snapshot.sources" :key="source.name" class="source-item">
          <div class="source-item-head">
            <strong>{{ source.name }}</strong>
            <span class="source-state" :class="`state-${source.state}`">{{ stateLabel(source.state) }}</span>
          </div>
          <p class="source-meta muted">
            {{ describeScope(source) }} · {{ describeTraffic(source) }}
          </p>
          <p class="source-meta muted">
            Last success: {{ formatTimestamp(source.lastSuccessAt) }}
            <template v-if="source.lastError">
              · <span class="warning">{{ source.lastError }}</span>
            </template>
          </p>
        </li>
      </ul>
      <p v-else-if="!isLoading" class="source-panel-note muted">
        No provider status is available.
      </p>

      <p class="source-panel-footer muted">
        Provider health is separate from row valuation: a healthy provider can still return no quote for one symbol.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { MarketDataStatus } from '~~/shared/types/balance-sheet'
import type { SourceHealth, SourceState } from '~~/shared/types/source-health'
import { formatClock, formatShortDate, formatTimestamp } from '~/utils/formatters'
import { sgtDateKey } from '~/utils/history-range'

const props = withDefaults(defineProps<{
  /** How the balance sheet's own last call to the market-data service went. */
  marketStatus?: MarketDataStatus
  /** When quotes for this portfolio last arrived. */
  quotesFetchedAt?: string | null
  /** False until the first balance-sheet response arrives. */
  hasLoaded?: boolean
  /** How many holdings asked for a quote; zero means the page needs none. */
  requested?: number
}>(), {
  quotesFetchedAt: null,
  hasLoaded: false,
  requested: 0,
})

const { snapshot, isLoading, errorMessage, load } = useSourceHealth()

const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)

// "One provider is flaky" and "nothing is answering" are different problems.
// Provider health is read at most every few minutes, so the balance sheet's own
// last call is the faster signal that the service has gone away.
const isUnreachable = computed(() => props.marketStatus === 'unreachable' || snapshot.value?.isStale === true)

const chipState = computed(() => {
  if (!props.hasLoaded) return 'unknown'
  if (props.marketStatus === 'unreachable') return 'unreachable'
  if (props.marketStatus === 'degraded') return 'degraded'
  if (props.marketStatus === 'ok') return 'live'
  return 'unknown'
})

function fetchedAtLabel(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return formatShortDate(value)

  return sgtDateKey(parsed) === sgtDateKey() ? formatClock(value) : formatShortDate(value)
}

// The chip reports what the page's own price call did. Provider health is one
// click away in the panel below.
const chipLabel = computed(() => {
  if (!props.hasLoaded) return 'Checking prices'

  if (props.marketStatus === 'unreachable') {
    return props.quotesFetchedAt
      ? `Market data unreachable · prices from ${fetchedAtLabel(props.quotesFetchedAt)}`
      : 'Market data unreachable'
  }

  if (props.marketStatus === 'degraded') {
    return props.quotesFetchedAt
      ? `Some prices stale · ${fetchedAtLabel(props.quotesFetchedAt)}`
      : 'Some prices stale'
  }

  if (props.requested === 0) return 'No holdings use live prices'
  if (props.quotesFetchedAt) return `Prices updated ${fetchedAtLabel(props.quotesFetchedAt)}`
  return 'Prices not fetched yet'
})

// Re-read provider health when the service goes away or comes back, rather
// than leaving the last answer on screen until the next scheduled read.
watch(() => props.marketStatus, (next, previous) => {
  if (next === previous) return
  if (next === 'unreachable' || previous === 'unreachable') void load({ force: true })
})

const stateLabels: Record<SourceState, string> = {
  live: 'live',
  degraded: 'degraded',
  failing: 'failing',
  no_traffic: 'no traffic',
  not_applicable: 'not applicable',
  disabled: 'disabled',
  unconfigured: 'unconfigured',
}

const windowLabel = computed(() => {
  const raw = snapshot.value?.window || '24h0m0s'
  return raw.replace(/0m0s$/, '').replace(/0s$/, '')
})

function stateLabel(state: SourceState): string {
  return stateLabels[state]
}

function describeScope(source: SourceHealth): string {
  if (source.disabledReason) return source.disabledReason

  const markets = source.markets.length > 0 ? source.markets.join(', ') : 'global'
  const types = source.instrumentTypes.length > 0 ? source.instrumentTypes.join(', ') : 'all types'
  const mode = source.mode === 'stream' ? 'stream' : source.mode === 'scrape' ? 'scrape' : 'REST'
  return `${mode} · ${markets} · ${types}`
}

function describeTraffic(source: SourceHealth): string {
  if (source.state === 'not_applicable') return 'no eligible symbols in scope'
  if (source.attempts === 0) return 'no attempts'
  if (source.state === 'disabled' || source.state === 'unconfigured') return 'not called'

  const rate = `${Math.round(source.successRate * 100)}% success`
  const latency = source.p95LatencyMs > 0 ? ` · p95 ${Math.round(source.p95LatencyMs)} ms` : ''
  const skipped = source.skipped > 0 ? ` · ${source.skipped} skipped` : ''
  return `${source.attempts} attempts · ${rate}${latency}${skipped}`
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) void load()
}

function onRefresh() {
  void load({ force: true })
}

function onDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return
  if (root.value && !root.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') isOpen.value = false
}

onMounted(() => {
  void load()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>
