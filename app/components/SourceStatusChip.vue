<template>
  <div ref="root" class="source-status">
    <button
      type="button"
      class="source-chip"
      :class="`state-${overall}`"
      :aria-expanded="isOpen"
      aria-haspopup="true"
      @click="toggle"
    >
      <span class="source-dot" aria-hidden="true" />
      <span>{{ overallLabel }}</span>
    </button>

    <div v-if="isOpen" class="source-panel" role="region" aria-label="Provider health">
      <header class="source-panel-header">
        <div>
          <h2>Provider health</h2>
          <p class="muted">
            Last {{ windowLabel }}<template v-if="snapshot"> · read {{ formatTimestamp(snapshot.asOf) }}</template>
          </p>
        </div>
        <UButton size="xs" color="neutral" variant="soft" :loading="isLoading" @click="onRefresh">
          Refresh
        </UButton>
      </header>

      <p v-if="errorMessage" class="source-panel-note warning">
        {{ errorMessage }}
      </p>
      <p v-else-if="snapshot?.isStale" class="source-panel-note warning">
        vesto-go is unreachable. Showing the last successful read.
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { OverallSourceState, SourceHealth, SourceState } from '~~/shared/types/source-health'
import { formatTimestamp } from '~/utils/formatters'

const { snapshot, overall, isLoading, errorMessage, load } = useSourceHealth()

const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)

const overallLabels: Record<OverallSourceState, string> = {
  live: 'Providers live',
  degraded: 'Providers degraded',
  failing: 'Providers failing',
  no_traffic: 'No provider traffic',
  not_applicable: 'Providers n/a',
  disabled: 'Providers disabled',
  unconfigured: 'Providers unconfigured',
  unavailable: 'Source status unavailable',
}

const overallLabel = computed(() => {
  // Before the first read completes (SSR and hydration), say "checking"
  // rather than claiming the status is unavailable.
  if (snapshot.value === null && errorMessage.value === null) return 'Checking providers'
  return overallLabels[overall.value]
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
