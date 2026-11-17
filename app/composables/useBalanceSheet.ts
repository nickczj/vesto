import { LIVE_REFRESH_INTERVAL_MS } from '~~/shared/types/balance-sheet'
import { toUserMessage } from '~/utils/errors'
import type {
  AssetEntry,
  BalanceSheetResponse,
  BalanceSheetRow,
  CurrencyCode,
  LiabilityEntry,
  RefreshMode,
} from '~~/shared/types/balance-sheet'

interface AssetUpsertPayload {
  kind: AssetEntry['kind']
  name: string
  symbol?: string | null
  market?: string | null
  cpfBucket?: AssetEntry['cpfBucket']
  currency: CurrencyCode
  amount: number
  quantity?: number | null
  costBasisUnitPrice?: number | null
  manualPrice?: number | null
  valuationMode: AssetEntry['valuationMode']
  notes?: string | null
}

interface LiabilityUpsertPayload {
  type: LiabilityEntry['type']
  name: string
  currency: CurrencyCode
  outstandingAmount: number
  notes?: string | null
}

const EMPTY_SHEET: BalanceSheetResponse = {
  generatedAt: new Date(0).toISOString(),
  refreshMode: 'stale',
  rows: [],
  totals: {
    sections: {
      investments: { usd: 0, sgd: 0 },
      cpf: { usd: 0, sgd: 0 },
      cash_savings: { usd: 0, sgd: 0 },
      liabilities: { usd: 0, sgd: 0 },
    },
    totalAssets: { usd: 0, sgd: 0 },
    totalLiabilities: { usd: 0, sgd: 0 },
    netWorth: { usd: 0, sgd: 0 },
  },
  fx: null,
  quoteSummary: {
    requested: 0,
    priced: 0,
    stale: 0,
    manualPriced: 0,
    unpriced: 0,
  },
  marketData: {
    status: 'unknown',
    quotesFetchedAt: null,
    checkedAt: null,
  },
  warnings: [],
}

function toTempAssetRow(payload: AssetUpsertPayload): BalanceSheetRow {
  const section = payload.kind === 'cpf'
    ? 'cpf'
    : payload.kind === 'cash_savings'
      ? 'cash_savings'
      : 'investments'

  const isInvestment = payload.kind === 'investment'
  const manualPrice = payload.manualPrice ?? null
  const costBasis = payload.costBasisUnitPrice ?? null
  const nativeAmount = isInvestment
    ? (manualPrice !== null ? (payload.quantity || 0) * manualPrice : 0)
    : payload.amount
  const boughtUnitPrice = isInvestment ? costBasis : null
  const costBasisNative = isInvestment && costBasis !== null
    ? (payload.quantity || 0) * costBasis
    : null

  return {
    id: `temp:asset:${Date.now()}:${Math.random()}`,
    entityType: 'asset',
    entityId: -1,
    section,
    name: payload.name,
    category: payload.kind === 'cpf' ? `cpf:${payload.cpfBucket || 'N/A'}` : payload.kind,
    nativeCurrency: payload.currency,
    nativeAmount,
    quantity: isInvestment ? (payload.quantity ?? null) : null,
    boughtUnitPrice,
    currentUnitPrice: isInvestment ? manualPrice : null,
    costBasisNative,
    costBasisUsd: null,
    costBasisSgd: null,
    pnlNative: null,
    pnlUsd: null,
    pnlSgd: null,
    usdAmount: payload.currency === 'USD' ? nativeAmount : 0,
    sgdAmount: payload.currency === 'SGD' ? nativeAmount : 0,
    source: isInvestment ? (manualPrice !== null ? 'manual' : 'unpriced') : 'book',
    provider: null,
    asOf: null,
    symbol: payload.symbol || null,
    market: payload.market || null,
    notes: payload.notes || null,
    isLiability: false,
    isPending: true,
  }
}

function toTempLiabilityRow(payload: LiabilityUpsertPayload): BalanceSheetRow {
  return {
    id: `temp:liability:${Date.now()}:${Math.random()}`,
    entityType: 'liability',
    entityId: -1,
    section: 'liabilities',
    name: payload.name,
    category: payload.type,
    nativeCurrency: payload.currency,
    nativeAmount: payload.outstandingAmount,
    quantity: null,
    boughtUnitPrice: null,
    currentUnitPrice: null,
    costBasisNative: null,
    costBasisUsd: null,
    costBasisSgd: null,
    pnlNative: null,
    pnlUsd: null,
    pnlSgd: null,
    usdAmount: payload.currency === 'USD' ? payload.outstandingAmount : 0,
    sgdAmount: payload.currency === 'SGD' ? payload.outstandingAmount : 0,
    source: 'book',
    provider: null,
    asOf: null,
    symbol: null,
    market: null,
    notes: payload.notes || null,
    isLiability: true,
    isPending: true,
  }
}

export function useBalanceSheet() {
  const sheet = useState<BalanceSheetResponse>('balance-sheet:sheet', () => ({ ...EMPTY_SHEET }))
  const pendingRows = useState<BalanceSheetRow[]>('balance-sheet:pending-rows', () => [])
  const assets = useState<AssetEntry[]>('balance-sheet:assets', () => [])
  const liabilities = useState<LiabilityEntry[]>('balance-sheet:liabilities', () => [])
  const isLoading = useState<boolean>('balance-sheet:loading', () => false)
  const isMutating = useState<boolean>('balance-sheet:mutating', () => false)
  const errorMessage = useState<string | null>('balance-sheet:error', () => null)

  let pollingTimer: ReturnType<typeof setInterval> | null = null
  const lastSuccessfulRefreshAt = useState<number>('balance-sheet:last-refresh-at', () => 0)

  async function refresh(refresh: RefreshMode = 'stale', options: { silent?: boolean } = {}) {
    const silent = options.silent === true
    if (!silent) {
      isLoading.value = true
      errorMessage.value = null
    }

    try {
      const next = await $fetch<BalanceSheetResponse>('/api/balance-sheet', {
        query: { refresh },
      })
      sheet.value = next
      lastSuccessfulRefreshAt.value = Date.now()
    }
    catch (error) {
      if (!silent) {
        errorMessage.value = toUserMessage(error)
      }
      throw error
    }
    finally {
      if (!silent) {
        isLoading.value = false
      }
    }
  }

  async function loadAssets() {
    const payload = await $fetch<{ items: AssetEntry[] }>('/api/assets')
    assets.value = payload.items
  }

  async function loadLiabilities() {
    const payload = await $fetch<{ items: LiabilityEntry[] }>('/api/liabilities')
    liabilities.value = payload.items
  }

  async function refreshAll(refreshMode: RefreshMode = 'stale', options: { silent?: boolean } = {}) {
    await Promise.all([
      loadAssets(),
      loadLiabilities(),
      refresh(refreshMode, options),
    ])
  }

  async function syncAfterMutation() {
    try {
      await Promise.all([
        loadAssets(),
        loadLiabilities(),
        refresh('never', { silent: true }),
      ])
    }
    catch (error) {
      errorMessage.value = `Saved, but the page could not be reloaded. ${toUserMessage(error)}`
    }

    void refresh('always', { silent: true }).catch((error) => {
      errorMessage.value = `Prices could not be refreshed. ${toUserMessage(error)}`
    })
  }

  async function createAsset(payload: AssetUpsertPayload) {
    const temp = toTempAssetRow(payload)
    pendingRows.value.unshift(temp)
    isMutating.value = true
    errorMessage.value = null

    try {
      await $fetch('/api/assets', { method: 'POST', body: payload })
      await syncAfterMutation()
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    }
    finally {
      pendingRows.value = pendingRows.value.filter(row => row.id !== temp.id)
      isMutating.value = false
    }
  }

  async function updateAsset(id: number, payload: Partial<AssetUpsertPayload>) {
    isMutating.value = true
    errorMessage.value = null
    try {
      await $fetch(`/api/assets/${id}`, { method: 'PATCH', body: payload })
      await syncAfterMutation()
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    }
    finally {
      isMutating.value = false
    }
  }

  async function removeAsset(id: number) {
    const existingRows = sheet.value.rows
    sheet.value = {
      ...sheet.value,
      rows: sheet.value.rows.filter(row => !(row.entityType === 'asset' && row.entityId === id)),
    }

    isMutating.value = true
    errorMessage.value = null
    try {
      await $fetch(`/api/assets/${id}`, { method: 'DELETE' })
      await syncAfterMutation()
    }
    catch (error) {
      sheet.value = {
        ...sheet.value,
        rows: existingRows,
      }
      errorMessage.value = toUserMessage(error)
      throw error
    }
    finally {
      isMutating.value = false
    }
  }

  async function createLiability(payload: LiabilityUpsertPayload) {
    const temp = toTempLiabilityRow(payload)
    pendingRows.value.unshift(temp)
    isMutating.value = true
    errorMessage.value = null

    try {
      await $fetch('/api/liabilities', { method: 'POST', body: payload })
      await syncAfterMutation()
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    }
    finally {
      pendingRows.value = pendingRows.value.filter(row => row.id !== temp.id)
      isMutating.value = false
    }
  }

  async function updateLiability(id: number, payload: Partial<LiabilityUpsertPayload>) {
    isMutating.value = true
    errorMessage.value = null
    try {
      await $fetch(`/api/liabilities/${id}`, { method: 'PATCH', body: payload })
      await syncAfterMutation()
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    }
    finally {
      isMutating.value = false
    }
  }

  async function removeLiability(id: number) {
    const existingRows = sheet.value.rows
    sheet.value = {
      ...sheet.value,
      rows: sheet.value.rows.filter(row => !(row.entityType === 'liability' && row.entityId === id)),
    }

    isMutating.value = true
    errorMessage.value = null
    try {
      await $fetch(`/api/liabilities/${id}`, { method: 'DELETE' })
      await syncAfterMutation()
    }
    catch (error) {
      sheet.value = {
        ...sheet.value,
        rows: existingRows,
      }
      errorMessage.value = toUserMessage(error)
      throw error
    }
    finally {
      isMutating.value = false
    }
  }

  function clearPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  function startPolling() {
    if (!import.meta.client) return
    if (pollingTimer) return

    pollingTimer = setInterval(() => {
      if (document.hidden) return
      void refresh('stale', { silent: true })
    }, LIVE_REFRESH_INTERVAL_MS)
  }

  function handleVisibilityChange() {
    if (document.hidden) return

    const shouldRefresh = Date.now() - lastSuccessfulRefreshAt.value > LIVE_REFRESH_INTERVAL_MS
    if (!shouldRefresh) return
    void refresh('stale', { silent: true })
  }

  function refreshLiveInBackground() {
    void refresh('always', { silent: true }).catch((error) => {
      errorMessage.value = `Prices could not be refreshed. ${toUserMessage(error)}`
    })
  }

  async function hydrateInitialSnapshot() {
    try {
      await refreshAll('never')
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
    }
    finally {
      refreshLiveInBackground()
    }
  }

  onMounted(() => {
    void hydrateInitialSnapshot()
    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    clearPolling()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  const rows = computed(() => [...pendingRows.value, ...sheet.value.rows])
  // False until the first response arrives, so the page can say "loading"
  // instead of describing the empty placeholder sheet.
  const hasLoaded = computed(() => lastSuccessfulRefreshAt.value > 0)

  return {
    sheet,
    rows,
    hasLoaded,
    assets,
    liabilities,
    isLoading,
    isMutating,
    errorMessage,
    refresh,
    refreshAll,
    createAsset,
    updateAsset,
    removeAsset,
    createLiability,
    updateLiability,
    removeLiability,
  }
}
