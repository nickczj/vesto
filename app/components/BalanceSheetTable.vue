<template>
  <div class="table-shell">
    <div class="table-toolbar">
      <label class="toolbar-toggle">
        <input v-model="showSource" type="checkbox">
        <span>Show Source</span>
      </label>

      <label class="toolbar-toggle">
        <input v-model="showNative" type="checkbox">
        <span>Show Native</span>
      </label>
    </div>

    <table class="balance-table">
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

    <div v-if="loading" class="overlay">Refreshing...</div>
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
import { computed, h, ref } from 'vue'
import type { BalanceSection, BalanceSheetRow, BalanceSheetTotals } from '~~/shared/types/balance-sheet'
import { formatCurrency, formatSignedCurrency } from '~/utils/formatters'

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

const sectionRank: Record<BalanceSection, number> = {
  investments: 0,
  cpf: 1,
  cash_savings: 2,
  liabilities: 3,
}

const sorting = ref<SortingState>([])
const showSource = ref(false)
const showNative = ref(false)

function signedAmount(row: BalanceSheetRow, amount: number): number {
  return row.isLiability ? -amount : amount
}

function sectionFirstNumberSort(getValue: (row: BalanceSheetRow) => number): SortingFn<BalanceSheetRow> {
  return (rowA, rowB) => {
    const sectionDelta = sectionRank[rowA.original.section] - sectionRank[rowB.original.section]
    if (sectionDelta !== 0) return sectionDelta

    const a = getValue(rowA.original)
    const b = getValue(rowB.original)

    if (a === b) return 0
    return a > b ? 1 : -1
  }
}

function sectionFirstNullableSort(getValue: (row: BalanceSheetRow) => number | null): SortingFn<BalanceSheetRow> {
  return (rowA, rowB) => {
    const sectionDelta = sectionRank[rowA.original.section] - sectionRank[rowB.original.section]
    if (sectionDelta !== 0) return sectionDelta

    const a = getValue(rowA.original)
    const b = getValue(rowB.original)

    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    if (a === b) return 0

    return a > b ? 1 : -1
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

function formatPnl(row: BalanceSheetRow): string {
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
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('source', {
    id: 'source',
    header: 'Source',
    cell: info => info.getValue(),
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'native',
    header: 'Native',
    cell: ({ row }) => formatSignedCurrency(signedAmount(row.original, row.original.nativeAmount), row.original.nativeCurrency),
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'bought',
    header: 'Bought',
    cell: ({ row }) => formatBoughtPrice(row.original),
    sortingFn: sectionFirstNullableSort(row => row.boughtUnitPrice),
  }),
  columnHelper.display({
    id: 'current',
    header: 'Current',
    cell: ({ row }) => formatCurrentPrice(row.original),
    sortingFn: sectionFirstNullableSort(row => row.currentUnitPrice),
  }),
  columnHelper.accessor(row => signedAmount(row, row.usdAmount), {
    id: 'usd',
    header: sortableHeader('USD'),
    cell: ({ row }) => formatSignedCurrency(signedAmount(row.original, row.original.usdAmount), 'USD'),
    sortingFn: sectionFirstNumberSort(row => signedAmount(row, row.usdAmount)),
  }),
  columnHelper.accessor(row => signedAmount(row, row.sgdAmount), {
    id: 'sgd',
    header: sortableHeader('SGD'),
    cell: ({ row }) => formatSignedCurrency(signedAmount(row.original, row.original.sgdAmount), 'SGD'),
    sortingFn: sectionFirstNumberSort(row => signedAmount(row, row.sgdAmount)),
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
    sortingFn: sectionFirstNullableSort(row => row.pnlSgd),
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
  source: showSource.value,
  native: showNative.value,
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
