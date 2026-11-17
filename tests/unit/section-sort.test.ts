import {
  createColumnHelper,
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/vue-table'
import { describe, expect, it } from 'vitest'
import type { BalanceSection } from '~~/shared/types/balance-sheet'
import { compareWithinSection } from '~/utils/section-sort'

interface Row {
  name: string
  section: BalanceSection
  value: number | null
}

const rows: Row[] = [
  { name: 'small', section: 'investments', value: 10 },
  { name: 'unknown', section: 'investments', value: null },
  { name: 'large', section: 'investments', value: 30 },
  { name: 'oa', section: 'cpf', value: 20 },
  { name: 'sa', section: 'cpf', value: 40 },
  { name: 'cash', section: 'cash_savings', value: 5 },
  { name: 'loan', section: 'liabilities', value: -50 },
]

// Runs the comparator through TanStack's own sorted row model, the way the
// table component does, so the test covers the library's descending inversion.
function sortedNames(sorting: SortingState): string[] {
  const helper = createColumnHelper<Row>()
  const table = createTable<Row>({
    data: rows,
    columns: [
      helper.accessor('value', {
        id: 'value',
        sortingFn: (rowA, rowB, columnId) => compareWithinSection(
          rowA.original,
          rowB.original,
          row => row.value,
          sorting.find(entry => entry.id === columnId)?.desc ?? false,
        ),
      }),
    ],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {},
    onStateChange: () => {},
    renderFallbackValue: null,
  })

  table.setOptions(previous => ({
    ...previous,
    state: { ...table.initialState, sorting },
  }))

  return table.getRowModel().rows.map(row => row.original.name)
}

describe('sorting within balance-sheet sections', () => {
  it('leaves the stored order alone when nothing is sorted', () => {
    expect(sortedNames([])).toEqual(rows.map(row => row.name))
  })

  it('sorts ascending inside each section', () => {
    expect(sortedNames([{ id: 'value', desc: false }])).toEqual([
      'small', 'large', 'unknown',
      'oa', 'sa',
      'cash',
      'loan',
    ])
  })

  it('keeps the section order when sorting descending', () => {
    expect(sortedNames([{ id: 'value', desc: true }])).toEqual([
      'large', 'small', 'unknown',
      'sa', 'oa',
      'cash',
      'loan',
    ])
  })

  it('keeps empty values last in both directions', () => {
    const empty: Row = { name: 'empty', section: 'investments', value: null }
    const priced: Row = { name: 'priced', section: 'investments', value: 1 }
    const value = (row: Row) => row.value

    // TanStack multiplies the result by -1 for a descending sort.
    expect(compareWithinSection(empty, priced, value, false)).toBeGreaterThan(0)
    expect(-1 * compareWithinSection(empty, priced, value, true)).toBeGreaterThan(0)
    expect(compareWithinSection(empty, empty, value, true)).toBe(0)
  })
})
