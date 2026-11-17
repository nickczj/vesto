<template>
  <!--
    Nuxt UI's modal supplies the behaviour a dialog needs and the hand-rolled
    one lacked: focus moves in and is trapped, Esc and a click outside close it
    from anywhere, the page behind is inert, and focus returns to whatever
    opened it. The look still comes from the `simple-modal` classes.
  -->
  <UModal
    v-model:open="isOpen"
    :title="title"
    :description="description"
    scrollable
    :transition="false"
    :content="{ onOpenAutoFocus: focusFirstField }"
    :ui="{ overlay: 'simple-modal-backdrop', content: 'simple-modal divide-y-0' }"
  >
    <template #content>
      <header class="simple-modal-header">
        <h3>{{ title }}</h3>
        <button type="button" class="mini-button" @click="isOpen = false">Close</button>
      </header>

      <slot />
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title: string
  /** Read out with the title by assistive technology; not shown. */
  description: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

// By default focus lands on the first focusable element, which is the Close
// button. Start in the form instead.
function focusFirstField(event: Event) {
  const content = event.target as HTMLElement | null
  const field = content?.querySelector<HTMLElement>('input, select, textarea')
  if (!field) return

  event.preventDefault()
  field.focus()
}
</script>
