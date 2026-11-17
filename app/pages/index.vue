<template>
  <main :class="['page-shell', `density-${preferences.density}`]">
    <header class="page-header">
      <h1 class="page-title">
        Vesto <span class="title-divider" aria-hidden="true">·</span> Balance sheet
      </h1>

      <div class="header-actions">
        <SourceStatusChip
          :market-status="sheet.marketData.status"
          :quotes-fetched-at="sheet.marketData.quotesFetchedAt"
          :has-loaded="hasLoaded"
          :requested="sheet.quoteSummary.requested"
        />
        <UButton size="xs" color="neutral" variant="ghost" class="header-control" :loading="isLoading" @click="onRefresh">
          Refresh
        </UButton>
        <ViewSettingsPopover />
        <UButton size="xs" color="neutral" variant="ghost" class="header-control" :loading="isExporting" title="Export to Excel" @click="onExportExcel">
          Export
        </UButton>
        <UButton size="xs" color="neutral" variant="ghost" class="header-control" @click="onToggleTheme">
          Theme
        </UButton>
        <UDropdownMenu :items="addItems" :content="{ align: 'end' }">
          <UButton size="xs" class="primary-action">
            Add <span class="button-caret" aria-hidden="true">▾</span>
          </UButton>
        </UDropdownMenu>
      </div>
    </header>

    <section class="balance-hero">
      <div class="hero-copy">
        <div class="hero-label">
          <h2>Net worth</h2>
          <div class="segmented hero-currency" role="group" aria-label="Primary currency">
            <button
              v-for="option in currencyOptions"
              :key="option"
              type="button"
              class="segmented-option"
              :class="{ active: preferences.primaryCurrency === option }"
              :aria-pressed="preferences.primaryCurrency === option"
              @click="setPrimaryCurrency(option)"
            >
              {{ option }}
            </button>
          </div>
        </div>

        <p class="hero-figure">{{ headline }}</p>
        <p class="hero-breakdown">
          Assets {{ assetsText }} less liabilities {{ liabilitiesText }}
        </p>
        <p class="hero-fx" :class="{ warning: fxUnavailable }">{{ fxLine }}</p>

        <div v-if="snapshotDelta || drawdownDelta" class="hero-deltas">
          <p v-if="snapshotDelta" class="hero-delta" :class="snapshotDelta.tone">{{ snapshotDelta.text }}</p>
          <p v-if="drawdownDelta" class="hero-delta" :class="drawdownDelta.tone">{{ drawdownDelta.text }}</p>
        </div>
      </div>

      <ValuationHistoryCard
        :history="history"
        :loading="historyLoading"
        :error="historyError"
      />
    </section>

    <section v-if="errorMessage" class="error-banner">
      {{ errorMessage }}
    </section>

    <section v-if="sheet.warnings.length > 0" class="warning-banner">
      <strong>Valuation warnings:</strong>
      <ul>
        <li v-for="warning in sheet.warnings" :key="warning">{{ warning }}</li>
      </ul>
    </section>

    <p v-if="hiddenSectionLabels.length > 0" class="table-note muted">
      Showing {{ visibleSections.length }} of 4 sections. The headline and table totals include the hidden {{ hiddenSectionLabels.join(' and ') }}.
    </p>

    <BalanceSheetTable
      :rows="tableRows"
      :totals="sheet.totals"
      :loading="isLoading"
      @edit-asset="onEditAssetRow"
      @delete-asset="onDeleteAssetRow"
      @edit-liability="onEditLiabilityRow"
      @delete-liability="onDeleteLiabilityRow"
    />

    <AssetFormModal
      v-model:open="assetModalOpen"
      :initial="activeAsset"
      :submitting="assetSubmitting"
      :error="assetFormError"
      @submit="onSubmitAsset"
    />

    <LiabilityFormModal
      v-model:open="liabilityModalOpen"
      :initial="activeLiability"
      :submitting="liabilitySubmitting"
      :error="liabilityFormError"
      @submit="onSubmitLiability"
    />
  </main>
</template>

<script setup lang="ts">
import type { AssetEntry, BalanceSheetRow, LiabilityEntry } from '~~/shared/types/balance-sheet'
import { toUserMessage } from '~/utils/errors'
import { exportBalanceSheetToExcel } from '~/utils/excel-export'
import { formatCurrency, formatShortDate } from '~/utils/formatters'
import { peakHistoryPoint, sgtDateKey } from '~/utils/history-range'
import { formatLedgerAmount, formatLedgerPercent, formatLedgerValue } from '~/utils/ledger'
import type { PrimaryCurrency } from '~/utils/view-preferences'

const {
  sheet,
  rows: allRows,
  hasLoaded,
  assets,
  liabilities,
  isLoading,
  errorMessage,
  refresh,
  createAsset,
  updateAsset,
  removeAsset,
  createLiability,
  updateLiability,
  removeLiability,
} = useBalanceSheet()
const {
  history,
  isLoading: historyLoading,
  errorMessage: historyError,
  load: loadHistory,
} = useValuationHistory()
const {
  preferences,
  visibleSections,
  hiddenSectionLabels,
  setPrimaryCurrency,
} = useViewPreferences()
const { toggleTheme } = useThemeMode()

const currencyOptions: PrimaryCurrency[] = ['SGD', 'USD']

const tableRows = computed(() => allRows.value.filter(row => visibleSections.value.includes(row.section)))
const fxUnavailable = computed(() => sheet.value.fx === null)

function amountFor(pair: { usd: number, sgd: number }, currency: PrimaryCurrency): number {
  return currency === 'USD' ? pair.usd : pair.sgd
}

function displayMoney(value: number, currency: PrimaryCurrency): string {
  if (fxUnavailable.value) return '—'
  return formatCurrency(value, currency)
}

function displayLedgerValue(value: number): string {
  if (fxUnavailable.value) return '—'
  return formatLedgerValue(value) ?? '—'
}

const headline = computed(
  () => displayMoney(amountFor(sheet.value.totals.netWorth, preferences.value.primaryCurrency), preferences.value.primaryCurrency),
)

const assetsText = computed(() => displayLedgerValue(amountFor(sheet.value.totals.totalAssets, preferences.value.primaryCurrency)))
const liabilitiesText = computed(() => displayLedgerValue(amountFor(sheet.value.totals.totalLiabilities, preferences.value.primaryCurrency)))

const secondaryCurrency = computed<PrimaryCurrency>(
  () => (preferences.value.primaryCurrency === 'SGD' ? 'USD' : 'SGD'),
)

const fxLine = computed(() => {
  const fx = sheet.value.fx
  if (!fx) return 'USD/SGD rate unavailable. Totals are hidden until a rate can be fetched.'

  const secondaryNetWorth = amountFor(sheet.value.totals.netWorth, secondaryCurrency.value)
  const rate = fx.usdToSgd.toFixed(4)
  const stale = fx.isStale ? ' (last known)' : ''

  return `${formatCurrency(secondaryNetWorth, secondaryCurrency.value)} at ${rate} SGD per USD, rate from ${formatShortDate(fx.asOf)}${stale}.`
})

// Current net worth minus the latest complete snapshot. The date is named
// whenever that snapshot is not today's, so an old baseline is not passed off
// as the 08:00 one.
const snapshotDelta = computed(() => {
  if (fxUnavailable.value) return null

  const latest = history.value?.latest
  if (!latest) return null

  const currency = preferences.value.primaryCurrency
  const previous = currency === 'SGD' ? latest.netWorthSgd : latest.netWorthUsd
  const delta = amountFor(sheet.value.totals.netWorth, currency) - previous
  const when = latest.asOfDate === sgtDateKey() ? 'the 08:00 snapshot' : `${formatShortDate(latest.asOfDate)} snapshot`

  return {
    text: `${formatLedgerAmount(delta, { signed: true }) ?? '—'} since ${when}`,
    tone: delta > 0 ? 'pnl-profit' : delta < 0 ? 'pnl-loss' : 'pnl-flat',
  }
})

const peakPoint = computed(() => {
  const points = history.value?.points
  if (!points) return null
  return peakHistoryPoint(points, preferences.value.primaryCurrency)
})

const drawdownDelta = computed(() => {
  if (fxUnavailable.value) return null

  const peak = peakPoint.value
  if (!peak) return null

  const currency = preferences.value.primaryCurrency
  const peakValue = currency === 'SGD' ? peak.netWorthSgd : peak.netWorthUsd
  if (peakValue <= 0) return null

  const current = amountFor(sheet.value.totals.netWorth, currency)
  const ratio = current / peakValue - 1
  const date = formatShortDate(peak.asOfDate)

  if (Math.abs(ratio) < 0.00005) return { text: 'At the peak', tone: 'pnl-flat' }

  if (ratio > 0) {
    return {
      text: `${formatLedgerPercent(ratio) ?? ''} above the peak on ${date}`,
      tone: 'pnl-profit',
    }
  }

  return {
    text: `${formatLedgerPercent(ratio) ?? ''} from the peak on ${date}`,
    tone: 'pnl-loss',
  }
})

const addItems = [
  { label: 'Add asset', onSelect: () => openCreateAsset() },
  { label: 'Add liability', onSelect: () => openCreateLiability() },
]

onMounted(() => {
  void loadHistory()
})

const assetModalOpen = ref(false)
const liabilityModalOpen = ref(false)
const editingAssetId = ref<number | null>(null)
const editingLiabilityId = ref<number | null>(null)
const isExporting = ref(false)
const assetSubmitting = ref(false)
const liabilitySubmitting = ref(false)
const assetFormError = ref<string | null>(null)
const liabilityFormError = ref<string | null>(null)

const activeAsset = computed<AssetEntry | null>(() => {
  if (!editingAssetId.value) return null
  return assets.value.find(item => item.id === editingAssetId.value) || null
})

const activeLiability = computed<LiabilityEntry | null>(() => {
  if (!editingLiabilityId.value) return null
  return liabilities.value.find(item => item.id === editingLiabilityId.value) || null
})

function openCreateAsset() {
  editingAssetId.value = null
  assetFormError.value = null
  assetSubmitting.value = false
  assetModalOpen.value = true
}

function openEditAsset(id: number) {
  editingAssetId.value = id
  assetFormError.value = null
  assetSubmitting.value = false
  assetModalOpen.value = true
}

function openCreateLiability() {
  editingLiabilityId.value = null
  liabilityFormError.value = null
  liabilitySubmitting.value = false
  liabilityModalOpen.value = true
}

function openEditLiability(id: number) {
  editingLiabilityId.value = id
  liabilityFormError.value = null
  liabilitySubmitting.value = false
  liabilityModalOpen.value = true
}

function onEditAssetRow(row: BalanceSheetRow) {
  openEditAsset(row.entityId)
}

function onEditLiabilityRow(row: BalanceSheetRow) {
  openEditLiability(row.entityId)
}

async function onSubmitAsset(payload: {
  kind: AssetEntry['kind']
  name: string
  symbol?: string | null
  market?: string | null
  cpfBucket?: AssetEntry['cpfBucket']
  currency: AssetEntry['currency']
  amount: number
  quantity?: number | null
  costBasisUnitPrice?: number | null
  manualPrice?: number | null
  valuationMode: AssetEntry['valuationMode']
  notes?: string | null
}) {
  assetSubmitting.value = true
  assetFormError.value = null

  try {
    if (editingAssetId.value) {
      await updateAsset(editingAssetId.value, payload)
    }
    else {
      await createAsset(payload)
    }

    assetModalOpen.value = false
  }
  catch (error) {
    assetFormError.value = toUserMessage(error)
  }
  finally {
    assetSubmitting.value = false
  }
}

async function onSubmitLiability(payload: {
  type: LiabilityEntry['type']
  name: string
  currency: LiabilityEntry['currency']
  outstandingAmount: number
  notes?: string | null
}) {
  liabilitySubmitting.value = true
  liabilityFormError.value = null

  try {
    if (editingLiabilityId.value) {
      await updateLiability(editingLiabilityId.value, payload)
    }
    else {
      await createLiability(payload)
    }

    liabilityModalOpen.value = false
  }
  catch (error) {
    liabilityFormError.value = toUserMessage(error)
  }
  finally {
    liabilitySubmitting.value = false
  }
}

async function onDeleteAssetRow(row: BalanceSheetRow) {
  if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return

  try {
    await removeAsset(row.entityId)
  }
  catch {
    // removeAsset already put a plain sentence in the page's error banner.
  }
}

async function onDeleteLiabilityRow(row: BalanceSheetRow) {
  if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return

  try {
    await removeLiability(row.entityId)
  }
  catch {
    // removeLiability already put a plain sentence in the page's error banner.
  }
}

async function onRefresh() {
  await Promise.allSettled([refresh('always'), loadHistory()])
}

function onToggleTheme() {
  toggleTheme()
}

async function onExportExcel() {
  if (!import.meta.client) return

  isExporting.value = true
  try {
    await exportBalanceSheetToExcel(sheet.value)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorMessage.value = `Excel export failed: ${message}`
  }
  finally {
    isExporting.value = false
  }
}
</script>
