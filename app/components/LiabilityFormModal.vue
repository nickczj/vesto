<template>
  <FormDialog
    v-model:open="isOpen"
    :title="modalTitle"
    description="Enter the details of the liability, then save."
  >
    <form class="form-grid form-grid-two" @submit.prevent="submitForm">
      <label>
        <span>Type</span>
        <select v-model="form.type" class="bs-input">
          <option value="loan">Loan</option>
          <option value="credit_card">Credit card</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label>
        <span>Name</span>
        <input v-model.trim="form.name" class="bs-input" required>
      </label>

      <label>
        <span>Currency</span>
        <select v-model="form.currency" class="bs-input">
          <option v-for="currency in CURRENCIES" :key="currency" :value="currency">
            {{ currency }}
          </option>
        </select>
      </label>

      <label>
        <span>Outstanding amount <span class="form-optional">{{ form.currency }}</span></span>
        <input v-model.number="form.outstandingAmount" class="bs-input" type="number" step="0.01" min="0.01" required>
      </label>

      <label class="form-span-2">
        <span>Notes</span>
        <textarea v-model.trim="form.notes" class="bs-input" rows="2" maxlength="300" />
      </label>

      <p v-if="error" class="form-error form-span-2" role="alert">
        {{ error }}
      </p>

      <div class="form-actions form-span-2">
        <button type="button" class="mini-button" :disabled="submitting" @click="isOpen = false">
          Cancel
        </button>
        <button type="submit" class="primary-button" :disabled="submitting">
          {{ submitting ? 'Saving…' : primaryLabel }}
        </button>
      </div>
    </form>
  </FormDialog>
</template>

<script setup lang="ts">
import { CURRENCIES, type LiabilityEntry } from '~~/shared/types/balance-sheet'

interface LiabilityPayload {
  type: LiabilityEntry['type']
  name: string
  currency: LiabilityEntry['currency']
  outstandingAmount: number
  notes?: string | null
}

const props = defineProps<{
  open: boolean
  initial: LiabilityEntry | null
  submitting: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: LiabilityPayload]
}>()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const form = reactive<LiabilityPayload>({
  type: 'loan',
  name: '',
  currency: 'SGD',
  outstandingAmount: 0,
  notes: null,
})

const modalTitle = computed(() => (props.initial ? 'Edit liability' : 'Add liability'))
const primaryLabel = computed(() => (props.initial ? 'Save changes' : 'Add liability'))

function resetForm() {
  if (props.initial) {
    form.type = props.initial.type
    form.name = props.initial.name
    form.currency = props.initial.currency
    form.outstandingAmount = props.initial.outstandingAmount
    form.notes = props.initial.notes
    return
  }

  form.type = 'loan'
  form.name = ''
  form.currency = 'SGD'
  form.outstandingAmount = 0
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
    type: form.type,
    name: form.name,
    currency: form.currency,
    outstandingAmount: form.outstandingAmount,
    notes: form.notes,
  })
}
</script>
