<template>
  <div
    ref="shellEl"
    class="table-shell"
    :class="{
      'sticky-header': preferences.stickyHeader,
      'sticky-name': preferences.stickyNameColumn,
      'fits-width': fitsWidth,
    }"
  >
    <div class="table-toolbar">
      <label class="toolbar-toggle">
        <input
          type="checkbox"
          :checked="preferences.showSource"
          @change="onSourceChange"
        >
        <span>Show Source</span>
      </label>

      <label class="toolbar-toggle">
        <input
          type="checkbox"
          :checked="preferences.showNative"
          @change="onNativeChange"
        >
        <span>Show Native</span>
      </label>
    </div>

    <table ref="tableEl" class="balance-table">
      <thead>
        <tr>
          <th
            v-for="header in table.getFlatHeaders()"
            :key="header.id"
            class="table-header"
          >
            <FlexRender
              :render="header.column.columnDef.header"
              :props="header.getContext()"
            />
          </th>
        </tr>
      </thead>

      <tbody>
        <template v-for="(row, index) in renderedRows" :key="row.id">
          <tr v-if="isSectionStart(index)" class="section-row">
            <td :colspan="visibleColumnCount">
              <div class="section-header">
                <span>{{ sectionLabels[row.original.section] }}</span>
              </div>
            </td>
          </tr>

          <tr :class="['data-row', row.original.isLiability ? 'is-liability' : '', row.original.isPending ? 'is-pending' : '']">
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="table-cell"
            >
              <FlexRender
                :render="cell.column.columnDef.cell"
                :props="cell.getContext()"
              />
            </td>
          </tr>

          <tr v-if="isSectionEnd(index)" class="subtotal-row">
            <td :colspan="visibleColumnCount" class="table-cell subtotal-cell">
              {{ formatSectionSummary(row.original.section) }}
            </td>
          </tr>
        </template>
      </tbody>

      <tfoot>
        <tr class="footer-row">
          <td :colspan="visibleColumnCount" class="table-cell footer-value">
            Total Assets: {{ formatCurrency(totals.totalAssets.usd, 'USD') }} / {{ formatCurrency(totals.totalAssets.sgd, 'SGD') }}
          </td>
        </tr>

        <tr class="footer-row liabilities-row">
          <td :colspan="visibleColumnCount" class="table-cell footer-value">
            Total Liabilities: {{ formatSignedCurrency(-totals.totalLiabilities.usd, 'USD') }} / {{ formatSignedCurrency(-totals.totalLiabilities.sgd, 'SGD') }}
          </td>
        </tr>

        <tr class="footer-row networth-row">
          <td :colspan="visibleColumnCount" class="table-cell footer-value">
            Net Worth: {{ formatCurrency(totals.netWorth.usd, 'USD') }} / {{ formatCurrency(totals.netWorth.sgd, 'SGD') }}
          </td>
        </tr>
      </tfoot>
    </table>

    <div v-if="showBlockingOverlay" class="overlay">Refreshing...</div>
  </div>
</template>

<script setup lang="ts">
import {
  FlexRender,
  createColumnHelper,
  functionalUpdate,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type SortingFn,
  type SortingState,
} from '@tanstack/vue-table'
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import type { BalanceSection, BalanceSheetRow, BalanceSheetTotals } from '~~/shared/types/balance-sheet'
import { useViewPreferences } from '~/composables/useViewPreferences'
import { formatCurrency, formatSignedCurrency } from '~/utils/formatters'
import { compareWithinSection } from '~/utils/section-sort'

const props = defineProps<{
  rows: BalanceSheetRow[]
  totals: BalanceSheetTotals
  loading: boolean
}>()

const emit = defineEmits<{
  editAsset: [id: number]
  editLiability: [id: number]
  deleteAsset: [id: number]
  deleteLiability: [id: number]
}>()

const sectionLabels: Record<BalanceSection, string> = {
  investments: 'Investments',
  cpf: 'CPF',
  cash_savings: 'Cash / Savings',
  liabilities: 'Liabilities',
}

const sorting = ref<SortingState>([])
const { preferences, setShowSource, setShowNative } = useViewPreferences()

// The shell scrolls sideways only when the table is wider than it. While the
// table fits, the shell is not a scroll container, so the sticky header sticks
// to the page instead of to a box that never scrolls vertically.
const shellEl = ref<HTMLElement | null>(null)
const tableEl = ref<HTMLTableElement | null>(null)
const fitsWidth = ref(false)
let resizeObserver: ResizeObserver | null = null

function measureFit() {
  if (!shellEl.value || !tableEl.value) return
  fitsWidth.value = tableEl.value.offsetWidth <= shellEl.value.clientWidth + 1
}

onMounted(() => {
  measureFit()
  if (typeof ResizeObserver === 'undefined' || !shellEl.value || !tableEl.value) return

  resizeObserver = new ResizeObserver(measureFit)
  resizeObserver.observe(shellEl.value)
  resizeObserver.observe(tableEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

function onSourceChange(event: Event) {
  setShowSource((event.target as HTMLInputElement).checked)
}

function onNativeChange(event: Event) {
  setShowNative((event.target as HTMLInputElement).checked)
}

function signedAmount(row: BalanceSheetRow, amount: number): number {
  return row.isLiability ? -amount : amount
}

function sortWithinSection(getValue: (row: BalanceSheetRow) => number | null): SortingFn<BalanceSheetRow> {
  return (rowA, rowB, columnId) => {
    const descending = sorting.value.find(entry => entry.id === columnId)?.desc ?? false
    return compareWithinSection(rowA.original, rowB.original, getValue, descending)
  }
}

function sortableHeader(label: string) {
  return (context: any) => {
    const column = context.column as {
      getToggleSortingHandler?: () => ((event: unknown) => void) | undefined
      getIsSorted: () => false | 'asc' | 'desc'
    }
    const direction = column.getIsSorted()
    const icon = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'
    const onClick = column.getToggleSortingHandler?.()

    return h(
      'button',
      {
        class: 'sort-button',
        onClick,
        type: 'button',
      },
      [
        h('span', label),
        h('span', { class: 'sort-indicator' }, icon),
      ],
    )
  }
}

function formatBoughtPrice(row: BalanceSheetRow): string {
  if (row.boughtUnitPrice === null) return '-'
  return formatCurrency(row.boughtUnitPrice, row.nativeCurrency)
}

function formatCurrentPrice(row: BalanceSheetRow): string {
  if (row.currentUnitPrice === null) return '-'
  return formatCurrency(row.currentUnitPrice, row.nativeCurrency)
}

function formatRowAmount(row: BalanceSheetRow, amount: number, currency: BalanceSheetRow['nativeCurrency']): string {
  if (row.source === 'unpriced') return '—'
  return formatSignedCurrency(signedAmount(row, amount), currency)
}

function formatNativeAmount(row: BalanceSheetRow): string {
  // A row can be unpriced for totals (no FX) while its native value is still
  // known. Show it. A zero native amount means "no price", so show an em dash.
  if (row.source === 'unpriced' && row.nativeAmount === 0) return '—'
  return formatSignedCurrency(signedAmount(row, row.nativeAmount), row.nativeCurrency)
}

function formatPnl(row: BalanceSheetRow): string {
  if (row.source === 'unpriced') return '—'
  if (row.pnlSgd === null) return '-'
  return formatSignedCurrency(row.pnlSgd, 'SGD')
}

function pnlToneClass(row: BalanceSheetRow): string {
  if (row.pnlSgd === null) return 'pnl-flat'
  if (row.pnlSgd > 0) return 'pnl-profit'
  if (row.pnlSgd < 0) return 'pnl-loss'
  return 'pnl-flat'
}

const columnHelper = createColumnHelper<BalanceSheetRow>()

const columns = [
  columnHelper.accessor('name', {
    header: 'Name',
    cell: info => h('span', { class: 'row-name' }, [
      info.getValue(),
      info.row.original.source === 'unpriced'
        ? h('span', {
            class: 'unpriced-badge',
            title: 'Excluded from USD/SGD totals: no trustworthy price or FX rate.',
          }, 'unpriced')
        : null,
    ]),
  }),
  columnHelper.accessor('source', {
    id: 'source',
    header: 'Source',
    cell: (info) => {
      const row = info.row.original
      if (!row.provider) return info.getValue()

      return h('span', { class: 'source-cell' }, [
        h('span', { class: 'source-provider' }, row.provider),
        h('span', { class: 'source-separator', 'aria-hidden': 'true' }, ' · '),
        h('span', {}, info.getValue()),
      ])
    },
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'native',
    header: 'Native',
    cell: ({ row }) => formatNativeAmount(row.original),
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'bought',
    header: 'Bought',
    cell: ({ row }) => formatBoughtPrice(row.original),
    sortingFn: sortWithinSection(row => row.boughtUnitPrice),
  }),
  columnHelper.display({
    id: 'current',
    header: 'Current',
    cell: ({ row }) => formatCurrentPrice(row.original),
    sortingFn: sortWithinSection(row => row.currentUnitPrice),
  }),
  columnHelper.accessor(row => signedAmount(row, row.usdAmount), {
    id: 'usd',
    header: sortableHeader('USD'),
    cell: ({ row }) => formatRowAmount(row.original, row.original.usdAmount, 'USD'),
    sortingFn: sortWithinSection(row => signedAmount(row, row.usdAmount)),
  }),
  columnHelper.accessor(row => signedAmount(row, row.sgdAmount), {
    id: 'sgd',
    header: sortableHeader('SGD'),
    cell: ({ row }) => formatRowAmount(row.original, row.original.sgdAmount, 'SGD'),
    sortingFn: sortWithinSection(row => signedAmount(row, row.sgdAmount)),
  }),
  columnHelper.accessor(row => row.pnlSgd, {
    id: 'pnl',
    header: sortableHeader('P&L (SGD)'),
    cell: ({ row }) =>
      h(
        'span',
        {
          class: ['pnl-value', pnlToneClass(row.original)],
        },
        formatPnl(row.original),
      ),
    sortingFn: sortWithinSection(row => row.pnlSgd),
  }),
  columnHelper.display({
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }) => {
      return h('div', { class: 'action-group' }, [
        h(
          'button',
          {
            class: 'mini-button',
            onClick: () => {
              if (row.original.entityType === 'asset') emit('editAsset', row.original.entityId)
              else emit('editLiability', row.original.entityId)
            },
          },
          'Edit',
        ),
        h(
          'button',
          {
            class: 'mini-button danger',
            onClick: () => {
              if (row.original.entityType === 'asset') emit('deleteAsset', row.original.entityId)
              else emit('deleteLiability', row.original.entityId)
            },
          },
          'Delete',
        ),
      ])
    },
  }),
]

const columnVisibility = computed(() => ({
  source: preferences.value.showSource,
  native: preferences.value.showNative,
}))

const table = useVueTable({
  get data() {
    return props.rows
  },
  columns,
  state: {
    get sorting() {
      return sorting.value
    },
    get columnVisibility() {
      return columnVisibility.value
    },
  },
  onSortingChange: (updater) => {
    sorting.value = functionalUpdate(updater, sorting.value)
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

const renderedRows = computed(() => table.getRowModel().rows)
const visibleColumnCount = computed(() => table.getVisibleLeafColumns().length)
const showBlockingOverlay = computed(() => props.loading && props.rows.length === 0)

function isSectionStart(index: number): boolean {
  if (index === 0) return true
  return renderedRows.value[index - 1]?.original.section !== renderedRows.value[index]?.original.section
}

function isSectionEnd(index: number): boolean {
  if (index === renderedRows.value.length - 1) return true
  return renderedRows.value[index + 1]?.original.section !== renderedRows.value[index]?.original.section
}

function sectionPnl(section: BalanceSection): number | null {
  const sectionRows = renderedRows.value
    .map(row => row.original)
    .filter(row => row.section === section)

  if (section !== 'investments') return null

  const pnlRows = sectionRows.filter(row => row.pnlSgd !== null)
  if (pnlRows.length === 0) return null

  return pnlRows.reduce((sum, row) => sum + (row.pnlSgd || 0), 0)
}

function formatSectionSummary(section: BalanceSection): string {
  const totals = props.totals.sections[section]
  const signedUsd = section === 'liabilities' ? -totals.usd : totals.usd
  const signedSgd = section === 'liabilities' ? -totals.sgd : totals.sgd
  const summary = `Subtotal: ${formatSignedCurrency(signedUsd, 'USD')} / ${formatSignedCurrency(signedSgd, 'SGD')}`

  const pnl = sectionPnl(section)
  if (pnl === null) return summary
  return `${summary} | P&L: ${formatSignedCurrency(pnl, 'SGD')}`
}
</script>
