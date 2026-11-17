<template>
  <main :class="['page-shell', `density-${preferences.density}`]">
    <section class="page-header">
      <div class="header-copy">
        <h1>Vesto v2 Balance Sheet</h1>
        <p class="header-description">Track assets, CPF, and liabilities in one table with USD/SGD net worth.</p>
        <p class="header-meta muted">
          <span>Auto-refresh runs every 45 seconds while the tab is visible.</span>
          <span aria-hidden="true">•</span>
          <span :class="{ warning: marketUnreachable }">{{ pricesLabel }}</span>
          <template v-if="sheet.quoteSummary.unpriced > 0">
            <span aria-hidden="true">•</span>
            <span class="warning">{{ sheet.quoteSummary.unpriced }} unpriced</span>
          </template>
        </p>
      </div>

      <div class="header-actions">
        <SourceStatusChip :market-status="sheet.marketData.status" />
        <UButton size="xs" color="neutral" variant="soft" @click="onToggleTheme">Toggle Theme</UButton>
        <ViewSettingsPopover />
        <UButton size="xs" color="neutral" variant="soft" :loading="isExporting" @click="onExportExcel">Export Excel</UButton>
        <UButton size="xs" color="neutral" variant="soft" :loading="isLoading" @click="onRefresh">Refresh Now</UButton>
        <UButton size="xs" @click="openCreateAsset">Add Asset</UButton>
        <UButton size="xs" color="warning" @click="openCreateLiability">Add Liability</UButton>
      </div>
    </section>

    <section class="kpi-grid" :class="{ 'is-two-up': preferences.kpiCards === 2 }">
      <article v-for="card in kpiCards" :key="card.label" class="kpi-card">
        <h2>{{ card.label }}</h2>
        <p>{{ card.value }}</p>
      </article>
    </section>

    <section class="fx-strip" v-if="sheet.fx">
      <span>USD/SGD: {{ sheet.fx.usdToSgd.toFixed(4) }}</span>
      <span>SGD/USD: {{ sheet.fx.sgdToUsd.toFixed(4) }}</span>
      <span>FX as-of: {{ sheet.fx.asOf }}</span>
      <span>FX source: {{ sheet.fx.source }}</span>
      <span v-if="sheet.fx.isStale" class="warning">FX snapshot is stale</span>
    </section>

    <section v-if="fxUnavailable" class="warning-banner">
      <strong>FX rate unavailable.</strong>
      USD/SGD totals are hidden until a USD/SGD rate can be fetched. Native values are still shown.
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

    <ValuationHistoryCard
      :history="history"
      :loading="historyLoading"
      :error="historyError"
      @refresh="loadHistory"
    />

    <p v-if="hiddenSectionLabels.length > 0" class="table-note muted">
      Showing {{ visibleSections.length }} of 4 sections. Table totals include the hidden {{ hiddenSectionLabels.join(' and ') }}.
    </p>

    <BalanceSheetTable
      :rows="tableRows"
      :totals="sheet.totals"
      :loading="isLoading"
      @edit-asset="openEditAsset"
      @delete-asset="onDeleteAsset"
      @edit-liability="openEditLiability"
      @delete-liability="onDeleteLiability"
    />

    <AssetFormModal
      v-model:open="assetModalOpen"
      :initial="activeAsset"
      @submit="onSubmitAsset"
    />

    <LiabilityFormModal
      v-model:open="liabilityModalOpen"
      :initial="activeLiability"
      @submit="onSubmitLiability"
    />
  </main>
</template>

<script setup lang="ts">
import type { AssetEntry, LiabilityEntry } from '~~/shared/types/balance-sheet'
import { exportBalanceSheetToExcel } from '~/utils/excel-export'
import { formatCurrency, formatRecentTimestamp } from '~/utils/formatters'

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
} = useViewPreferences()
const { toggleTheme } = useThemeMode()

const tableRows = computed(() => allRows.value.filter(row => visibleSections.value.includes(row.section)))

const marketUnreachable = computed(() => sheet.value.marketData.status === 'unreachable')

// The time prices were last fetched, not the time of the last attempt: a
// failed refresh must not make old prices look current.
const pricesLabel = computed(() => {
  if (!hasLoaded.value) return 'Loading prices…'

  const fetchedAt = sheet.value.marketData.quotesFetchedAt
  if (marketUnreachable.value) {
    // The status chip beside this says the service is unreachable; this says
    // how old the prices on the page therefore are.
    return fetchedAt
      ? `Prices last fetched: ${formatRecentTimestamp(fetchedAt)}`
      : 'No prices fetched yet'
  }

  if (fetchedAt) return `Prices fetched: ${formatRecentTimestamp(fetchedAt)}`
  if (sheet.value.quoteSummary.requested === 0) return 'No holdings use live prices'
  return 'Prices not fetched yet'
})

interface KpiCardView {
  label: string
  value: string
}

function amountFor(pair: { usd: number, sgd: number }, currency: 'USD' | 'SGD'): number {
  return currency === 'USD' ? pair.usd : pair.sgd
}

const kpiCards = computed<KpiCardView[]>(() => {
  const primary = preferences.value.primaryCurrency
  const secondary = primary === 'SGD' ? 'USD' : 'SGD'
  const totals = sheet.value.totals

  const cards: KpiCardView[] = [
    {
      label: `Net Worth (${primary})`,
      value: displayMoney(amountFor(totals.netWorth, primary), primary),
    },
    {
      label: `Net Worth (${secondary})`,
      value: displayMoney(amountFor(totals.netWorth, secondary), secondary),
    },
    {
      label: `Total Assets (${primary})`,
      value: displayMoney(amountFor(totals.totalAssets, primary), primary),
    },
    {
      label: `Total Liabilities (${primary})`,
      value: displayMoney(amountFor(totals.totalLiabilities, primary), primary),
    },
  ]

  if (preferences.value.kpiCards === 2) {
    return [cards[0]!, cards[2]!]
  }

  return cards
})

onMounted(() => {
  void loadHistory()
})

const assetModalOpen = ref(false)
const liabilityModalOpen = ref(false)
const editingAssetId = ref<number | null>(null)
const editingLiabilityId = ref<number | null>(null)
const isExporting = ref(false)
const fxUnavailable = computed(() => sheet.value.fx === null)

function displayMoney(value: number, currency: 'USD' | 'SGD'): string {
  if (fxUnavailable.value) return '—'
  return formatCurrency(value, currency)
}

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
  assetModalOpen.value = true
}

function openEditAsset(id: number) {
  editingAssetId.value = id
  assetModalOpen.value = true
}

function openCreateLiability() {
  editingLiabilityId.value = null
  liabilityModalOpen.value = true
}

function openEditLiability(id: number) {
  editingLiabilityId.value = id
  liabilityModalOpen.value = true
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
  if (editingAssetId.value) {
    await updateAsset(editingAssetId.value, payload)
  }
  else {
    await createAsset(payload)
  }

  assetModalOpen.value = false
}

async function onSubmitLiability(payload: {
  type: LiabilityEntry['type']
  name: string
  currency: LiabilityEntry['currency']
  outstandingAmount: number
  notes?: string | null
}) {
  if (editingLiabilityId.value) {
    await updateLiability(editingLiabilityId.value, payload)
  }
  else {
    await createLiability(payload)
  }

  liabilityModalOpen.value = false
}

async function onDeleteAsset(id: number) {
  if (!window.confirm('Delete this asset?')) return
  await removeAsset(id)
}

async function onDeleteLiability(id: number) {
  if (!window.confirm('Delete this liability?')) return
  await removeLiability(id)
}

async function onRefresh() {
  await refresh('always')
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
