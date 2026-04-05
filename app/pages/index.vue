<template>
  <main class="page-shell">
    <section class="page-header">
      <div class="header-copy">
        <h1>Vesto v2 Balance Sheet</h1>
        <p class="header-description">Track assets, CPF, and liabilities in one table with USD/SGD net worth.</p>
        <p class="header-meta muted">
          <span>Auto-refresh runs every 10 minutes while the tab is visible.</span>
          <span aria-hidden="true">•</span>
          <span>Last snapshot: {{ formatTimestamp(sheet.generatedAt) }}</span>
        </p>
      </div>

      <div class="header-actions">
        <UButton size="xs" color="neutral" variant="soft" @click="onToggleTheme">Toggle Theme</UButton>
        <UButton size="xs" color="neutral" variant="soft" :loading="isExporting" @click="onExportExcel">Export Excel</UButton>
        <UButton size="xs" color="neutral" variant="soft" :loading="isLoading" @click="onRefresh">Refresh Now</UButton>
        <UButton size="xs" color="neutral" variant="soft" :loading="isMutating" @click="onImport">Import v1 Data</UButton>
        <UButton size="xs" @click="openCreateAsset">Add Asset</UButton>
        <UButton size="xs" color="warning" @click="openCreateLiability">Add Liability</UButton>
      </div>
    </section>

    <section class="kpi-grid">
      <article class="kpi-card">
        <h2>Net Worth (USD)</h2>
        <p>{{ formatCurrency(sheet.totals.netWorth.usd, 'USD') }}</p>
      </article>

      <article class="kpi-card">
        <h2>Net Worth (SGD)</h2>
        <p>{{ formatCurrency(sheet.totals.netWorth.sgd, 'SGD') }}</p>
      </article>

      <article class="kpi-card">
        <h2>Total Assets</h2>
        <p>{{ formatCurrency(sheet.totals.totalAssets.sgd, 'SGD') }}</p>
      </article>

      <article class="kpi-card">
        <h2>Total Liabilities</h2>
        <p>{{ formatCurrency(sheet.totals.totalLiabilities.sgd, 'SGD') }}</p>
      </article>
    </section>

    <section class="fx-strip" v-if="sheet.fx">
      <span>USD/SGD: {{ sheet.fx.usdToSgd.toFixed(4) }}</span>
      <span>SGD/USD: {{ sheet.fx.sgdToUsd.toFixed(4) }}</span>
      <span>FX as-of: {{ sheet.fx.asOf }}</span>
      <span>FX source: {{ sheet.fx.source }}</span>
      <span v-if="sheet.fx.isStale" class="warning">FX snapshot is stale</span>
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

    <BalanceSheetTable
      :rows="rows"
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
import { formatCurrency, formatTimestamp } from '~/utils/formatters'

const {
  sheet,
  rows,
  assets,
  liabilities,
  isLoading,
  isMutating,
  errorMessage,
  refresh,
  createAsset,
  updateAsset,
  removeAsset,
  createLiability,
  updateLiability,
  removeLiability,
  importFromV1,
} = useBalanceSheet()
const { toggleTheme } = useThemeMode()

const assetModalOpen = ref(false)
const liabilityModalOpen = ref(false)
const editingAssetId = ref<number | null>(null)
const editingLiabilityId = ref<number | null>(null)
const isExporting = ref(false)

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
  manualUnitPrice?: number | null
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

async function onImport() {
  if (!window.confirm('Import data from legacy v1 SQLite? This operation is idempotent.')) return
  await importFromV1()
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
