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
    <table ref="tableEl" class="balance-table">
      <thead>
        <tr>
          <th
            v-for="header in table.getFlatHeaders()"
            :key="header.id"
            class="table-header"
            :class="{ 'is-numeric': isNumericColumn(header.column.id), 'is-actions': header.column.id === 'actions' }"
            :aria-label="header.column.id === 'actions' ? 'Actions' : undefined"
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
            <td :colspan="visibleLeafColumns.length">
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
              :class="{ 'is-numeric': isNumericColumn(cell.column.id), 'is-actions': cell.column.id === 'actions' }"
            >
              <FlexRender
                :render="cell.column.columnDef.cell"
                :props="cell.getContext()"
              />
            </td>
          </tr>

          <tr v-if="isSectionEnd(index) && row.original.section !== 'liabilities'" class="subtotal-row">
            <td
              v-for="column in visibleLeafColumns"
              :key="`subtotal-${row.original.section}-${column.id}`"
              class="table-cell"
              :class="[
                { 'is-numeric': isNumericColumn(column.id) },
                subtotalToneClass(row.original.section, column.id),
              ]"
            >
              {{ subtotalText(row.original.section, column.id) }}
            </td>
          </tr>

          <tr v-if="isLastAssetSectionEnd(index)" class="total-row assets-total-row">
            <td
              v-for="column in visibleLeafColumns"
              :key="`total-assets-${column.id}`"
              class="table-cell"
              :class="{ 'is-numeric': isNumericColumn(column.id) }"
            >
              {{ totalAssetsText(column.id) }}
            </td>
          </tr>
        </template>
      </tbody>

      <tfoot>
        <tr v-if="!hasRenderedAssetRows" class="total-row assets-total-row">
          <td
            v-for="column in visibleLeafColumns"
            :key="`total-assets-empty-${column.id}`"
            class="table-cell"
            :class="{ 'is-numeric': isNumericColumn(column.id) }"
          >
            {{ totalAssetsText(column.id) }}
          </td>
        </tr>

        <tr class="total-row liabilities-total-row">
          <td
            v-for="column in visibleLeafColumns"
            :key="`total-liabilities-${column.id}`"
            class="table-cell"
            :class="{ 'is-numeric': isNumericColumn(column.id) }"
          >
            {{ totalLiabilitiesText(column.id) }}
          </td>
        </tr>

        <tr class="total-row networth-row">
          <td
            v-for="column in visibleLeafColumns"
            :key="`net-worth-${column.id}`"
            class="table-cell"
            :class="{ 'is-numeric': isNumericColumn(column.id) }"
          >
            {{ netWorthText(column.id) }}
          </td>
        </tr>
      </tfoot>
    </table>

    <p v-if="hasStalePrices" class="table-legend muted">
      <span class="stale-dot" aria-hidden="true" />
      Not a live price: the most recent one fetched.
    </p>

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
import { RowActionsMenu } from '#components'
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import type { BalanceSection, BalanceSheetRow, BalanceSheetTotals } from '~~/shared/types/balance-sheet'
import { useViewPreferences } from '~/composables/useViewPreferences'
import { formatSignedCurrency, formatTimestamp } from '~/utils/formatters'
import {
  NO_VALUE,
  formatLedgerAmount,
  formatLedgerPercent,
  formatLedgerValue,
  formatQuantity,
  formatShare,
  rowReturn,
  rowWeight,
  sectionPnl,
  sectionReturn,
  shareOf,
} from '~/utils/ledger'
import { compareWithinSection } from '~/utils/section-sort'

const props = defineProps<{
  rows: BalanceSheetRow[]
  totals: BalanceSheetTotals
  loading: boolean
}>()

const emit = defineEmits<{
  editAsset: [row: BalanceSheetRow]
  editLiability: [row: BalanceSheetRow]
  deleteAsset: [row: BalanceSheetRow]
  deleteLiability: [row: BalanceSheetRow]
}>()

const sectionLabels: Record<BalanceSection, string> = {
  investments: 'Investments',
  cpf: 'CPF',
  cash_savings: 'Cash and savings',
  liabilities: 'Liabilities',
}

const sectionTotalLabels: Record<BalanceSection, string> = {
  investments: 'Total investments',
  cpf: 'Total CPF',
  cash_savings: 'Total cash and savings',
  liabilities: 'Total liabilities',
}

const ASSET_SECTIONS = new Set<BalanceSection>(['investments', 'cpf', 'cash_savings'])
const NUMERIC_COLUMNS = new Set(['quantity', 'bought', 'current', 'usd', 'sgd', 'pnl', 'return', 'weight'])

function isNumericColumn(id: string): boolean {
  return NUMERIC_COLUMNS.has(id)
}

const sorting = ref<SortingState>([])
const { preferences } = useViewPreferences()

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

function ledgerCell(text: string) {
  if (text === NO_VALUE) return h('span', { class: 'placeholder' }, NO_VALUE)
  return text
}

function quantityText(row: BalanceSheetRow): string {
  if (row.section !== 'investments') return ''
  return formatQuantity(row.quantity) ?? NO_VALUE
}

function unitCostText(row: BalanceSheetRow): string {
  if (row.section !== 'investments') return ''
  return formatLedgerValue(row.boughtUnitPrice) ?? NO_VALUE
}

function unitPriceText(row: BalanceSheetRow): string {
  if (row.section !== 'investments') return ''
  return formatLedgerValue(row.currentUnitPrice) ?? NO_VALUE
}

function amountText(row: BalanceSheetRow, amount: number): string {
  if (row.source === 'unpriced') return NO_VALUE
  return formatLedgerAmount(signedAmount(row, amount)) ?? NO_VALUE
}

function pnlText(row: BalanceSheetRow): string {
  if (row.section !== 'investments') return ''
  if (row.source === 'unpriced' || row.pnlSgd === null) return NO_VALUE
  return formatLedgerAmount(row.pnlSgd, { signed: true }) ?? NO_VALUE
}

function returnText(row: BalanceSheetRow): string {
  if (row.section !== 'investments') return ''
  return formatLedgerPercent(rowReturn(row)) ?? NO_VALUE
}

function weightText(row: BalanceSheetRow): string {
  if (row.isLiability) return ''
  return formatShare(rowWeight(row, props.totals.totalAssets.sgd)) ?? NO_VALUE
}

function formatNativeAmount(row: BalanceSheetRow): string {
  // A row can be unpriced for totals (no FX) while its native value is still
  // known. Show it. A zero native amount means "no price", so show an em dash.
  if (row.source === 'unpriced' && row.nativeAmount === 0) return NO_VALUE
  return formatSignedCurrency(signedAmount(row, row.nativeAmount), row.nativeCurrency)
}

function toneFor(value: number | null): string {
  if (value === null || value === 0) return 'pnl-flat'
  return value > 0 ? 'pnl-profit' : 'pnl-loss'
}

function pnlToneClass(row: BalanceSheetRow): string {
  return toneFor(row.pnlSgd)
}

function returnToneClass(row: BalanceSheetRow): string {
  return toneFor(rowReturn(row))
}

// A stale price is marked on the price itself, so it shows whether or not the
// Source column is on.
function unitPriceCell(row: BalanceSheetRow) {
  const text = unitPriceText(row)
  if (text === NO_VALUE || text === '') return ledgerCell(text)
  if (row.source !== 'stale') return text

  const label = row.asOf
    ? `Not a live price. Last fetched price, as of ${formatTimestamp(row.asOf)}.`
    : 'Not a live price. Last fetched price.'

  return h('span', { class: 'price-cell' }, [
    text,
    h('span', { class: 'stale-dot', role: 'img', 'aria-label': label, title: label }),
  ])
}

const columnHelper = createColumnHelper<BalanceSheetRow>()

const columns = [
  columnHelper.accessor('name', {
    header: 'Holding',
    cell: info => h('span', { class: 'row-name' }, [
      h('span', { class: 'row-name-text' }, info.getValue()),
      info.row.original.symbol
        ? h(
            'span',
            { class: 'row-symbol', title: info.row.original.market || undefined },
            info.row.original.symbol,
          )
        : null,
      info.row.original.source === 'unpriced'
        ? h('span', {
            class: 'unpriced-badge',
            title: 'Excluded from USD/SGD totals: no trustworthy price or FX rate.',
          }, 'unpriced')
        : null,
    ]),
  }),
  columnHelper.display({
    id: 'currency',
    header: 'Ccy',
    cell: ({ row }) => row.original.nativeCurrency,
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'quantity',
    header: 'Quantity',
    cell: ({ row }) => ledgerCell(quantityText(row.original)),
    sortingFn: sortWithinSection(row => row.quantity),
  }),
  columnHelper.display({
    id: 'bought',
    header: 'Unit cost',
    cell: ({ row }) => ledgerCell(unitCostText(row.original)),
    sortingFn: sortWithinSection(row => row.boughtUnitPrice),
  }),
  columnHelper.display({
    id: 'current',
    header: 'Unit price',
    cell: ({ row }) => unitPriceCell(row.original),
    sortingFn: sortWithinSection(row => row.currentUnitPrice),
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
  columnHelper.accessor(row => signedAmount(row, row.usdAmount), {
    id: 'usd',
    header: sortableHeader('Value USD'),
    cell: ({ row }) => ledgerCell(amountText(row.original, row.original.usdAmount)),
    sortingFn: sortWithinSection(row => (row.source === 'unpriced' ? null : signedAmount(row, row.usdAmount))),
  }),
  columnHelper.accessor(row => signedAmount(row, row.sgdAmount), {
    id: 'sgd',
    header: sortableHeader('Value SGD'),
    cell: ({ row }) => ledgerCell(amountText(row.original, row.original.sgdAmount)),
    sortingFn: sortWithinSection(row => (row.source === 'unpriced' ? null : signedAmount(row, row.sgdAmount))),
  }),
  columnHelper.accessor(row => row.pnlSgd, {
    id: 'pnl',
    header: sortableHeader('Gain/loss SGD'),
    cell: ({ row }) => {
      const text = pnlText(row.original)
      if (text === '') return ''
      if (text === NO_VALUE) return h('span', { class: 'pnl-value pnl-flat' }, h('span', { class: 'placeholder' }, NO_VALUE))
      return h('span', { class: ['pnl-value', pnlToneClass(row.original)] }, text)
    },
    sortingFn: sortWithinSection(row => row.pnlSgd),
  }),
  columnHelper.display({
    id: 'return',
    header: sortableHeader('Return'),
    cell: ({ row }) => {
      const text = returnText(row.original)
      if (text === '') return ''
      return h('span', { class: ['pnl-value', returnToneClass(row.original)] }, ledgerCell(text))
    },
    sortingFn: sortWithinSection(row => rowReturn(row)),
  }),
  columnHelper.display({
    id: 'weight',
    header: sortableHeader('Weight'),
    cell: ({ row }) => {
      const text = weightText(row.original)
      if (text === '') return ''
      return h('span', { class: 'weight-value' }, ledgerCell(text))
    },
    sortingFn: sortWithinSection(row => rowWeight(row, props.totals.totalAssets.sgd)),
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => h(RowActionsMenu, {
      row: row.original,
      onEdit: () => {
        if (row.original.entityType === 'asset') emit('editAsset', row.original)
        else emit('editLiability', row.original)
      },
      onDelete: () => {
        if (row.original.entityType === 'asset') emit('deleteAsset', row.original)
        else emit('deleteLiability', row.original)
      },
    }),
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
const visibleLeafColumns = computed(() => table.getVisibleLeafColumns())
const showBlockingOverlay = computed(() => props.loading && props.rows.length === 0)
const hasStalePrices = computed(() => props.rows.some(row => row.source === 'stale'))
const hasRenderedAssetRows = computed(() => renderedRows.value.some(row => ASSET_SECTIONS.has(row.original.section)))

function isSectionStart(index: number): boolean {
  if (index === 0) return true
  return renderedRows.value[index - 1]?.original.section !== renderedRows.value[index]?.original.section
}

function isSectionEnd(index: number): boolean {
  if (index === renderedRows.value.length - 1) return true
  return renderedRows.value[index + 1]?.original.section !== renderedRows.value[index]?.original.section
}

function isLastAssetSectionEnd(index: number): boolean {
  const current = renderedRows.value[index]?.original
  if (!current || !ASSET_SECTIONS.has(current.section)) return false

  const next = renderedRows.value[index + 1]?.original
  return !next || next.section === 'liabilities'
}

function sectionRows(section: BalanceSection): BalanceSheetRow[] {
  return props.rows.filter(row => row.section === section)
}

function sectionSignedValue(section: BalanceSection, value: number): number {
  return section === 'liabilities' ? -value : value
}

function subtotalText(section: BalanceSection, columnId: string): string {
  if (columnId === 'name') return sectionTotalLabels[section]

  const totals = props.totals.sections[section]

  switch (columnId) {
    case 'usd':
      return formatLedgerAmount(sectionSignedValue(section, totals.usd)) ?? ''
    case 'sgd':
      return formatLedgerAmount(sectionSignedValue(section, totals.sgd)) ?? ''
    case 'pnl':
      if (section !== 'investments') return ''
      return formatLedgerAmount(sectionPnl(sectionRows(section)), { signed: true }) ?? NO_VALUE
    case 'return':
      if (section !== 'investments') return ''
      return formatLedgerPercent(sectionReturn(sectionRows(section))) ?? NO_VALUE
    case 'weight':
      if (section === 'liabilities') return ''
      return formatShare(shareOf(totals.sgd, props.totals.totalAssets.sgd)) ?? NO_VALUE
    default:
      return ''
  }
}

function subtotalToneClass(section: BalanceSection, columnId: string): string {
  if (section !== 'investments') return ''

  if (columnId === 'pnl') return toneFor(sectionPnl(sectionRows(section)))
  if (columnId === 'return') return toneFor(sectionReturn(sectionRows(section)))
  return ''
}

function totalAssetsText(columnId: string): string {
  switch (columnId) {
    case 'name':
      return 'Total assets'
    case 'usd':
      return formatLedgerAmount(props.totals.totalAssets.usd) ?? ''
    case 'sgd':
      return formatLedgerAmount(props.totals.totalAssets.sgd) ?? ''
    case 'weight':
      return formatShare(shareOf(props.totals.totalAssets.sgd, props.totals.totalAssets.sgd)) ?? NO_VALUE
    default:
      return ''
  }
}

function totalLiabilitiesText(columnId: string): string {
  switch (columnId) {
    case 'name':
      return 'Total liabilities'
    case 'usd':
      return formatLedgerAmount(-props.totals.totalLiabilities.usd) ?? ''
    case 'sgd':
      return formatLedgerAmount(-props.totals.totalLiabilities.sgd) ?? ''
    default:
      return ''
  }
}

function netWorthText(columnId: string): string {
  switch (columnId) {
    case 'name':
      return 'Net worth'
    case 'usd':
      return formatLedgerAmount(props.totals.netWorth.usd) ?? ''
    case 'sgd':
      return formatLedgerAmount(props.totals.netWorth.sgd) ?? ''
    default:
      return ''
  }
}
</script>
