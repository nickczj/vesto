<template>
  <UModal v-model:open="isOpen" :title="modalTitle">
    <template #body>
      <form class="form-grid" @submit.prevent="submitForm">
        <label>
          <span>Type</span>
          <select v-model="form.type" class="bs-input">
            <option value="loan">Loan</option>
            <option value="credit_card">Credit Card</option>
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
            <option value="USD">USD</option>
            <option value="SGD">SGD</option>
          </select>
        </label>

        <label>
          <span>Outstanding Amount</span>
          <input v-model.number="form.outstandingAmount" class="bs-input" type="number" step="0.01" min="0.01" required>
        </label>

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
import type { LiabilityEntry } from '~~/shared/types/balance-sheet'

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

const modalTitle = computed(() => (props.initial ? 'Edit Liability' : 'Add Liability'))

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
