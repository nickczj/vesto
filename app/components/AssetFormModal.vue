<template>
  <FormDialog
    v-model:open="isOpen"
    :title="modalTitle"
    description="Enter the details of the asset, then save."
  >
    <form class="form-grid form-grid-two" @submit.prevent="submitForm">
      <div class="form-tabs form-span-2" role="tablist" aria-label="Asset kind">
        <button
          v-for="tab in kindTabs"
          :key="tab.value"
          type="button"
          role="tab"
          class="form-tab"
          :class="{ active: form.kind === tab.value }"
          :aria-selected="form.kind === tab.value"
          @click="setKind(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <template v-if="form.kind === 'investment'">
        <label>
          <span>Ticker</span>
          <input
            v-model.trim="form.symbol"
            class="bs-input"
            placeholder="AAPL or VWRA.L"
            maxlength="30"
            required
            @input="onSymbolInput"
            @blur="resolveSymbol"
          >
        </label>

        <label>
          <span>Exchange <span class="form-optional">optional</span></span>
          <input
            v-model.trim="form.market"
            class="bs-input"
            list="asset-market-options"
            placeholder="NMS, LSE, SEHK"
            maxlength="10"
            @input="onMarketInput"
            @blur="resolveSymbol"
          >
        </label>
        <datalist id="asset-market-options">
          <option v-for="market in SUPPORTED_MARKETS" :key="market.code" :value="market.code">
            {{ market.venue }}
          </option>
        </datalist>

        <p v-if="resolving" class="form-hint form-span-2 muted">
          Checking the ticker…
        </p>
        <p
          v-else-if="showResolution"
          class="form-resolution form-span-2"
          :class="resolutionTone"
        >
          <span class="resolution-mark" aria-hidden="true">{{ resolutionMark }}</span>
          <span>
            {{ resolution?.message }}
            <template v-if="resolution?.quote">
              Last price {{ formatCurrency(resolution.quote.price, resolution.quote.currency) }}.
            </template>
          </span>
        </p>

        <p
          v-if="resolvedCurrencyMismatch"
          class="form-resolution is-warn form-span-2"
        >
          <span class="resolution-mark" aria-hidden="true">!</span>
          <span>
            This ticker quotes in {{ resolvedCurrencyMismatch }}, but the holding is set to {{ form.currency }}.
            The quote will be ignored and the manual price used. Change the currency for live pricing.
          </span>
        </p>

        <p
          v-if="marketMismatch"
          class="form-resolution is-warn form-span-2"
        >
          <span class="resolution-mark" aria-hidden="true">!</span>
          <span>
            This ticker resolved on {{ marketMismatch }}, not {{ form.market }}.
            <button type="button" class="text-button" @click="useResolvedMarket">
              Use {{ marketMismatch }}
            </button>
          </span>
        </p>

        <p v-if="marketWarning" class="form-hint form-span-2 muted">
          {{ marketWarning }}
        </p>

        <label class="form-span-2">
          <span>Name</span>
          <input v-model.trim="form.name" class="bs-input" required>
        </label>

        <div class="form-row form-row-three form-span-2">
          <label>
            <span>Quantity</span>
            <input v-model.number="form.quantity" class="bs-input" type="number" step="0.0001" min="0.0001" required>
          </label>

          <label>
            <span>Cost per unit <span class="form-optional">{{ form.currency }}</span></span>
            <input v-model.number="form.costBasisUnitPrice" class="bs-input" type="number" step="0.0001" min="0">
          </label>

          <label>
            <span>Currency</span>
            <select v-model="form.currency" class="bs-input">
              <option v-for="currency in CURRENCIES" :key="currency" :value="currency">
                {{ currency }}
              </option>
            </select>
            <small class="muted">The currency the price is quoted in.</small>
          </label>
        </div>

        <div class="form-field form-span-2">
          <span class="form-field-label">Price source</span>
          <div class="segmented form-segmented" role="group" aria-label="Price source">
            <button
              type="button"
              class="segmented-option"
              :class="{ active: form.valuationMode === 'live_preferred' }"
              :aria-pressed="form.valuationMode === 'live_preferred'"
              @click="setValuationMode('live_preferred')"
            >
              Live quote
            </button>
            <button
              type="button"
              class="segmented-option"
              :class="{ active: form.valuationMode === 'manual_only' }"
              :aria-pressed="form.valuationMode === 'manual_only'"
              @click="setValuationMode('manual_only')"
            >
              Manual only
            </button>
          </div>
          <p class="form-hint muted">
            Manual only uses the manual price below and never asks for a quote.
          </p>
        </div>

        <label class="form-span-2">
          <span>Manual price / unit <span class="form-optional">{{ form.currency }}</span></span>
          <input
            v-model.number="form.manualPrice"
            class="bs-input"
            type="number"
            step="0.0001"
            min="0"
            :required="form.valuationMode === 'manual_only'"
          >
          <small class="muted">Used when no live quote is available.</small>
        </label>
      </template>

      <template v-else>
        <label class="form-span-2">
          <span>Name</span>
          <input v-model.trim="form.name" class="bs-input" required>
        </label>

        <div v-if="form.kind === 'cpf'" class="form-row form-row-three form-span-2">
          <label>
            <span>CPF bucket</span>
            <select v-model="form.cpfBucket" class="bs-input">
              <option value="OA">OA</option>
              <option value="SA">SA</option>
              <option value="MA">MA</option>
              <option value="RA">RA</option>
            </select>
          </label>

          <label>
            <span>Amount <span class="form-optional">{{ form.currency }}</span></span>
            <input v-model.number="form.amount" class="bs-input" type="number" step="0.01" min="0" required>
          </label>

          <label>
            <span>Currency</span>
            <select v-model="form.currency" class="bs-input">
              <option v-for="currency in CURRENCIES" :key="currency" :value="currency">
                {{ currency }}
              </option>
            </select>
          </label>
        </div>

        <div v-else class="form-row form-row-two form-span-2">
          <label>
            <span>Amount <span class="form-optional">{{ form.currency }}</span></span>
            <input v-model.number="form.amount" class="bs-input" type="number" step="0.01" min="0" required>
          </label>

          <label>
            <span>Currency</span>
            <select v-model="form.currency" class="bs-input">
              <option v-for="currency in CURRENCIES" :key="currency" :value="currency">
                {{ currency }}
              </option>
            </select>
          </label>
        </div>
      </template>

      <div v-if="currencyChanged" class="form-span-2 form-currency-warning">
        <p class="form-resolution is-warn">
          <span class="resolution-mark" aria-hidden="true">!</span>
          <span>
            Changing the currency does not convert the cost basis or manual price.
            They will be read as {{ form.currency }} amounts.
          </span>
        </p>
        <label class="form-confirm">
          <input v-model="currencyChangeAcknowledged" type="checkbox">
          <span>I understand the amounts are now {{ form.currency }} amounts.</span>
        </label>
      </div>

      <label class="form-span-2">
        <span>Notes</span>
        <textarea v-model.trim="form.notes" class="bs-input" rows="2" maxlength="300" />
      </label>

      <p v-if="error || submitError" class="form-error form-span-2" role="alert">
        {{ error || submitError }}
      </p>

      <div class="form-actions form-span-2">
        <button type="button" class="mini-button" :disabled="submitting" @click="isOpen = false">
          Cancel
        </button>
        <button type="submit" class="primary-button" :disabled="submitting || resolving">
          {{ submitting ? 'Saving…' : primaryLabel }}
        </button>
      </div>
    </form>
  </FormDialog>
</template>

<script setup lang="ts">
import { CURRENCIES, type AssetEntry } from '~~/shared/types/balance-sheet'
import type { InstrumentResolution } from '~~/shared/types/instrument'
import { normalizeMarketCode, SUPPORTED_MARKETS } from '~~/shared/utils/markets'
import { reconcileMarketChoice, unknownMarketWarning, type MarketSource } from '~~/shared/utils/market-selection'
import { formatCurrency } from '~/utils/formatters'

interface AssetPayload {
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
}

const props = defineProps<{
  open: boolean
  initial: AssetEntry | null
  submitting: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: AssetPayload]
}>()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const kindTabs: Array<{ value: AssetEntry['kind'], label: string }> = [
  { value: 'investment', label: 'Investment' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cash_savings', label: 'Cash' },
  { value: 'manual', label: 'Other' },
]

const form = reactive<AssetPayload>({
  kind: 'investment',
  name: '',
  symbol: null,
  market: null,
  cpfBucket: 'OA',
  currency: 'USD',
  amount: 0,
  quantity: 1,
  costBasisUnitPrice: null,
  manualPrice: null,
  valuationMode: 'live_preferred',
  notes: null,
})

const resolution = ref<InstrumentResolution | null>(null)
const resolvedKey = ref<string | null>(null)
const resolving = ref(false)
const submitError = ref<string | null>(null)
const currencyChangeAcknowledged = ref(false)
const marketSource = ref<MarketSource>('auto')
const marketMismatch = ref<string | null>(null)

const currencyChanged = computed(
  () => props.initial !== null && form.currency !== props.initial.currency,
)

watch(() => form.currency, () => {
  currencyChangeAcknowledged.value = false
})

const modalTitle = computed(() => (props.initial ? 'Edit asset' : 'Add asset'))
const primaryLabel = computed(() => (props.initial ? 'Save changes' : 'Add asset'))

const currentKey = computed(
  () => `${(form.symbol || '').trim().toUpperCase()}::${(form.market || '').trim().toUpperCase()}`,
)

const showResolution = computed(
  () => resolvedKey.value !== null && resolvedKey.value === currentKey.value && resolution.value !== null,
)

const resolvedCurrencyMismatch = computed(() => {
  const resolved = resolution.value
  if (!showResolution.value || resolved?.status !== 'resolved' || !resolved.quote) return null

  return resolved.quote.currency === form.currency ? null : resolved.quote.currency
})

const resolutionTone = computed(() => {
  switch (resolution.value?.status) {
    case 'resolved':
      return 'is-ok'
    case 'not_found':
      return 'is-error'
    default:
      return 'is-warn'
  }
})

const resolutionMark = computed(() => (resolution.value?.status === 'resolved' ? '✓' : '!'))
const marketWarning = computed(() => unknownMarketWarning(form.market))

function resetResolution() {
  resolution.value = null
  resolvedKey.value = null
  submitError.value = null
  marketMismatch.value = null
}

function onSymbolInput() {
  // An auto-filled exchange belongs to the previous ticker. Clear it so the
  // next resolution cannot save the new holding under the old venue; a venue
  // the operator typed is kept and checked for a mismatch instead.
  if (marketSource.value === 'auto') {
    form.market = null
  }
  resetResolution()
}

function onMarketInput() {
  marketSource.value = 'manual'
  marketMismatch.value = null
}

function useResolvedMarket() {
  const resolved = normalizeMarketCode(resolution.value?.quote?.market)
  if (!resolved) return

  form.market = resolved
  marketSource.value = 'auto'
  marketMismatch.value = null
  resolvedKey.value = currentKey.value
}

function setKind(kind: AssetEntry['kind']) {
  form.kind = kind
  resetResolution()
}

function setValuationMode(mode: AssetEntry['valuationMode']) {
  form.valuationMode = mode
  resetResolution()
}

function resetForm() {
  resetResolution()
  resolving.value = false
  currencyChangeAcknowledged.value = false

  if (props.initial) {
    form.kind = props.initial.kind
    form.name = props.initial.name
    form.symbol = props.initial.symbol
    form.market = props.initial.market
    marketSource.value = 'manual'
    form.cpfBucket = props.initial.cpfBucket || 'OA'
    form.currency = props.initial.currency
    form.amount = props.initial.amount
    form.quantity = props.initial.quantity ?? 1
    form.costBasisUnitPrice = props.initial.costBasisUnitPrice
    form.manualPrice = props.initial.manualPrice
    form.valuationMode = props.initial.valuationMode
    form.notes = props.initial.notes
    return
  }

  form.kind = 'investment'
  form.name = ''
  form.symbol = null
  form.market = null
  marketSource.value = 'auto'
  form.cpfBucket = 'OA'
  form.currency = 'USD'
  form.amount = 0
  form.quantity = 1
  form.costBasisUnitPrice = null
  form.manualPrice = null
  form.valuationMode = 'live_preferred'
  form.notes = null
}

watch(() => props.open, (next) => {
  if (next) resetForm()
})

watch(() => props.initial, () => {
  if (props.open) resetForm()
})

async function resolveSymbol() {
  if (form.kind !== 'investment' || form.valuationMode === 'manual_only' || !form.symbol?.trim()) {
    resetResolution()
    return
  }

  form.market = normalizeMarketCode(form.market)
  marketMismatch.value = null
  const key = currentKey.value
  resolving.value = true
  submitError.value = null

  try {
    const result = await $fetch<InstrumentResolution>('/api/instruments/resolve', {
      query: {
        symbol: form.symbol.trim(),
        market: form.market?.trim() || undefined,
      },
    })

    if (key !== currentKey.value) return

    resolution.value = result

    if (result.status === 'resolved' && result.quote) {
      const choice = reconcileMarketChoice({
        market: form.market,
        source: marketSource.value,
        resolved: result.quote.market,
      })
      form.market = choice.market
      marketSource.value = choice.source
      marketMismatch.value = choice.mismatch

      // A new holding should start in the quote's currency; otherwise the
      // provider quote is discarded and the row silently falls back to the
      // manual price. An existing row is never changed here: the operator
      // confirms a currency change explicitly.
      if (!props.initial) {
        form.currency = result.quote.currency
      }
    }

    resolvedKey.value = currentKey.value
  }
  catch {
    resolution.value = {
      status: 'unavailable',
      symbol: form.symbol.trim().toUpperCase(),
      quote: null,
      message: 'Could not check the ticker. You can still save the holding; it will price when a quote is available.',
    }
    resolvedKey.value = currentKey.value
  }
  finally {
    resolving.value = false
  }
}

function optionalNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function submitForm() {
  submitError.value = null

  if (currencyChanged.value && !currencyChangeAcknowledged.value) {
    submitError.value = 'Confirm that the amounts are entered in the new currency before saving.'
    return
  }

  if (form.kind === 'investment' && form.valuationMode === 'live_preferred') {
    if (!form.symbol?.trim()) {
      submitError.value = 'A ticker is required for an investment.'
      return
    }

    if (!showResolution.value) {
      await resolveSymbol()
    }

    if (resolution.value?.status === 'not_found') {
      submitError.value = resolution.value.message
      return
    }
  }

  emit('submit', {
    kind: form.kind,
    name: form.name,
    symbol: form.kind === 'investment' ? form.symbol : null,
    market: form.kind === 'investment' ? normalizeMarketCode(form.market) : null,
    cpfBucket: form.kind === 'cpf' ? form.cpfBucket : null,
    currency: form.currency,
    amount: form.kind === 'investment' ? 0 : form.amount,
    quantity: form.kind === 'investment' ? optionalNumber(form.quantity) : null,
    costBasisUnitPrice: form.kind === 'investment' ? optionalNumber(form.costBasisUnitPrice) : null,
    manualPrice: form.kind === 'investment' ? optionalNumber(form.manualPrice) : null,
    valuationMode: form.valuationMode,
    notes: form.notes,
  })
}
</script>
