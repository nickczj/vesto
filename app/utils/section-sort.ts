import type { BalanceSection } from '~~/shared/types/balance-sheet'

export const SECTION_RANK: Record<BalanceSection, number> = {
  investments: 0,
  cpf: 1,
  cash_savings: 2,
  liabilities: 3,
}

/**
 * Compares two rows for a sort that stays inside each balance-sheet section.
 *
 * TanStack Table negates a sorting function's result when the column is sorted
 * descending. The section order and "empty values last" must not flip with the
 * direction, so both are negated here first and come out unchanged.
 */
export function compareWithinSection<T extends { section: BalanceSection }>(
  a: T,
  b: T,
  getValue: (row: T) => number | null,
  descending: boolean,
): number {
  const keep = descending ? -1 : 1

  const sectionDelta = SECTION_RANK[a.section] - SECTION_RANK[b.section]
  if (sectionDelta !== 0) return sectionDelta * keep

  const left = getValue(a)
  const right = getValue(b)

  if (left === null && right === null) return 0
  if (left === null) return keep
  if (right === null) return -keep
  if (left === right) return 0

  return left > right ? 1 : -1
}
