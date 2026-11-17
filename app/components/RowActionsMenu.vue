<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <button
      type="button"
      class="row-actions-button"
      :aria-label="`Actions for ${row.name}`"
      title="Actions"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="3" r="1.3" />
        <circle cx="8" cy="8" r="1.3" />
        <circle cx="8" cy="13" r="1.3" />
      </svg>
    </button>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { BalanceSheetRow } from '~~/shared/types/balance-sheet'

defineProps<{
  row: BalanceSheetRow
}>()

const emit = defineEmits<{
  edit: []
  delete: []
}>()

const items = computed(() => [
  {
    label: 'Edit',
    onSelect: () => emit('edit'),
  },
  {
    label: 'Delete',
    color: 'error' as const,
    onSelect: () => emit('delete'),
  },
])
</script>
