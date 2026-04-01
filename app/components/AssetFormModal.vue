<template>
  <UModal v-model:open="isOpen" :title="modalTitle">
    <template #body>
      <form class="form-grid" @submit.prevent="submitForm">
        <label>
          <span>Kind</span>
          <select v-model="form.kind" class="bs-input">
            <option value="investment">Investment</option>
            <option value="cpf">CPF</option>
            <option value="cash_savings">Cash/Savings</option>
            <option value="manual">Manual</option>
          </select>
        </label>

        <label>
          <span>Name</span>
          <input v-model.trim="form.name" class="bs-input" required>
        </label>

        <label>
          <span>Currency</span>
          <select v-model="form.currency" class="bs-input">
            <option value="USD">USD</option>
            <option value="SGD">SGD</option>
          </select>
        </label>

        <template v-if="form.kind === 'investment'">
          <label>
            <span>Symbol</span>
            <input v-model.trim="form.symbol" class="bs-input" placeholder="AAPL or VWRA.L" required>
          </label>

          <label>
            <span>Market</span>
            <input v-model.trim="form.market" class="bs-input" placeholder="NMS, LSE, SES">
          </label>

          <label>
            <span>Quantity</span>
            <input v-model.number="form.quantity" class="bs-input" type="number" step="0.0001" min="0.0001" required>
          </label>

          <label>
            <span>Valuation Mode</span>
            <select v-model="form.valuationMode" class="bs-input">
              <option value="live_preferred">Live Preferred</option>
              <option value="manual_only">Manual Only</option>
            </select>
          </label>

          <label>
            <span>Manual Unit Price</span>
            <input v-model.number="form.manualUnitPrice" class="bs-input" type="number" step="0.0001" min="0">
          </label>
        </template>

        <template v-else>
          <label v-if="form.kind === 'cpf'">
            <span>CPF Bucket</span>
            <select v-model="form.cpfBucket" class="bs-input">
              <option value="OA">OA</option>
              <option value="SA">SA</option>
              <option value="MA">MA</option>
              <option value="RA">RA</option>
            </select>
          </label>

          <label>
            <span>Amount</span>
            <input v-model.number="form.amount" class="bs-input" type="number" step="0.01" min="0" required>
          </label>
        </template>

        <label>
          <span>Notes</span>
          <textarea v-model.trim="form.notes" class="bs-input" rows="3" />
        </label>

        <div class="form-actions">
          <UButton color="neutral" variant="soft" @click="isOpen = false">Cancel</UButton>
          <UButton type="submit">Save</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { AssetEntry } from '~~/shared/types/balance-sheet'

interface AssetPayload {
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
}

const props = defineProps<{
  open: boolean
  initial: AssetEntry | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: AssetPayload]
}>()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const form = reactive<AssetPayload>({
  kind: 'investment',
  name: '',
  symbol: null,
  market: null,
  cpfBucket: 'OA',
  currency: 'USD',
  amount: 0,
  quantity: 1,
  manualUnitPrice: null,
  valuationMode: 'live_preferred',
  notes: null,
})

const modalTitle = computed(() => (props.initial ? 'Edit Asset' : 'Add Asset'))

function resetForm() {
  if (props.initial) {
    form.kind = props.initial.kind
    form.name = props.initial.name
    form.symbol = props.initial.symbol
    form.market = props.initial.market
    form.cpfBucket = props.initial.cpfBucket || 'OA'
    form.currency = props.initial.currency
    form.amount = props.initial.amount
    form.quantity = props.initial.quantity ?? 1
    form.manualUnitPrice = props.initial.manualUnitPrice
    form.valuationMode = props.initial.valuationMode
    form.notes = props.initial.notes
    return
  }

  form.kind = 'investment'
  form.name = ''
  form.symbol = null
  form.market = null
  form.cpfBucket = 'OA'
  form.currency = 'USD'
  form.amount = 0
  form.quantity = 1
  form.manualUnitPrice = null
  form.valuationMode = 'live_preferred'
  form.notes = null
}

watch(() => props.open, (next) => {
  if (next) resetForm()
})

watch(() => props.initial, () => {
  if (props.open) resetForm()
})

function submitForm() {
  emit('submit', {
    kind: form.kind,
    name: form.name,
    symbol: form.symbol,
    market: form.market,
    cpfBucket: form.kind === 'cpf' ? form.cpfBucket : null,
    currency: form.currency,
    amount: form.kind === 'investment' ? (form.amount || 0) : form.amount,
    quantity: form.kind === 'investment' ? form.quantity : null,
    manualUnitPrice: form.kind === 'investment' ? form.manualUnitPrice : null,
    valuationMode: form.valuationMode,
    notes: form.notes,
  })
}
</script>
