<template>
  <div ref="root" class="view-settings">
    <UButton
      size="xs"
      color="neutral"
      variant="ghost"
      class="header-control"
      :aria-expanded="isOpen"
      aria-haspopup="true"
      @click="toggle"
    >
      View
    </UButton>

    <div v-if="isOpen" class="view-panel" role="region" aria-label="View settings">
      <header class="view-panel-header">
        <h2>View settings</h2>
        <button type="button" class="text-button" @click="resetPreferences">Reset</button>
      </header>

      <div class="view-group">
        <span class="view-group-label">Density</span>
        <div class="segmented" role="group" aria-label="Density">
          <button
            v-for="option in densityOptions"
            :key="option.value"
            type="button"
            class="segmented-option"
            :class="{ active: preferences.density === option.value }"
            :aria-pressed="preferences.density === option.value"
            @click="setDensity(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="view-group">
        <span class="view-group-label">Primary currency</span>
        <div class="segmented" role="group" aria-label="Primary currency">
          <button
            type="button"
            class="segmented-option"
            :class="{ active: preferences.primaryCurrency === 'SGD' }"
            :aria-pressed="preferences.primaryCurrency === 'SGD'"
            @click="setPrimaryCurrency('SGD')"
          >
            SGD
          </button>
          <button
            type="button"
            class="segmented-option"
            :class="{ active: preferences.primaryCurrency === 'USD' }"
            :aria-pressed="preferences.primaryCurrency === 'USD'"
            @click="setPrimaryCurrency('USD')"
          >
            USD
          </button>
        </div>
      </div>

      <div class="view-group">
        <span class="view-group-label">Privacy</span>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.hideValues"
            @change="onHideValuesChange"
          >
          <span>Hide all values</span>
        </label>
        <p class="view-hint muted">
          Amounts, prices and the history chart are hidden. Holding names, currencies and valuation states stay visible. Reset keeps this setting.
        </p>
      </div>

      <div class="view-group">
        <span class="view-group-label">Sections</span>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.sections.cpf"
            @change="onSectionChange('cpf', $event)"
          >
          <span>CPF</span>
        </label>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.sections.cashSavings"
            @change="onSectionChange('cashSavings', $event)"
          >
          <span>Cash and savings</span>
        </label>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.sections.liabilities"
            @change="onSectionChange('liabilities', $event)"
          >
          <span>Liabilities</span>
        </label>
        <p class="view-hint muted">
          Investments always stay visible. Hidden sections are removed from the table; the headline and totals still cover the full portfolio.
        </p>
      </div>

      <div class="view-group">
        <span class="view-group-label">Columns</span>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.showSource"
            @change="onShowSourceChange"
          >
          <span>Source</span>
        </label>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.showNative"
            @change="onShowNativeChange"
          >
          <span>Native value</span>
        </label>
        <p class="view-hint muted">
          Source shows the provider and valuation state. Native shows each row's own currency.
        </p>
      </div>

      <div class="view-group">
        <span class="view-group-label">Table</span>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.stickyHeader"
            @change="onStickyHeaderChange($event)"
          >
          <span>Sticky header</span>
        </label>
        <label class="view-toggle">
          <input
            type="checkbox"
            :checked="preferences.stickyNameColumn"
            @change="onStickyNameColumnChange($event)"
          >
          <span>Sticky name column</span>
        </label>
      </div>

      <p class="view-panel-footer muted">
        Saved on this device. The 45-second refresh interval is fixed.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { ViewSectionKey } from '~/composables/useViewPreferences'
import type { ViewDensity } from '~/utils/view-preferences'

const {
  preferences,
  setDensity,
  setPrimaryCurrency,
  setSectionVisible,
  setStickyHeader,
  setStickyNameColumn,
  setShowSource,
  setShowNative,
  setHideValues,
  resetPreferences,
} = useViewPreferences()

const isOpen = ref(false)
const root = ref<HTMLElement | null>(null)

const densityOptions: Array<{ value: ViewDensity, label: string }> = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

function toggle() {
  isOpen.value = !isOpen.value
}

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}

function onSectionChange(section: ViewSectionKey, event: Event) {
  setSectionVisible(section, checked(event))
}

function onStickyHeaderChange(event: Event) {
  setStickyHeader(checked(event))
}

function onStickyNameColumnChange(event: Event) {
  setStickyNameColumn(checked(event))
}

function onShowSourceChange(event: Event) {
  setShowSource(checked(event))
}

function onShowNativeChange(event: Event) {
  setShowNative(checked(event))
}

function onHideValuesChange(event: Event) {
  setHideValues(checked(event))
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
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>
