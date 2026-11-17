import type { BalanceSheetRow } from '~~/shared/types/balance-sheet'

/**
 * The one placeholder for a value that applies to a row but is unknown (no
 * price, no cost basis, no FX rate). A blank cell means the column does not
 * apply to that row at all, such as quantity on a liability.
 */
export const NO_VALUE = '—'

const DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const QUANTITY = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
})

const PERCENT = new Intl.NumberFormat('en-SG', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A plain amount with grouping and two decimals, no currency symbol. */
export function formatLedgerValue(value: number | null | undefined): string | null {
  const amount = finite(value)
  if (amount === null) return null
  return DECIMAL.format(Math.abs(amount))
}

/**
 * A ledger amount. With `signed`, a gain carries a plus and a loss sits in
 * parentheses (`+6,051.28`, `(840.00)`). Without it, only negatives are
 * parenthesised, which is how liabilities are shown.
 */
export function formatLedgerAmount(
  value: number | null | undefined,
  options: { signed?: boolean } = {},
): string | null {
  const amount = finite(value)
  if (amount === null) return null

  const body = DECIMAL.format(Math.abs(amount))
  if (amount < 0) return `(${body})`
  if (options.signed && amount > 0) return `+${body}`
  return body
}

/** A signed percentage: `+17.9%`, `−11.3%`, `0.0%`. */
export function formatLedgerPercent(value: number | null | undefined): string | null {
  const ratio = finite(value)
  if (ratio === null) return null

  const body = PERCENT.format(Math.abs(ratio))
  if (ratio < 0) return `−${body}`
  if (ratio > 0) return `+${body}`
  return body
}

/** A share of a total, `12.9%`, never signed. */
export function formatShare(value: number | null | undefined): string | null {
  const ratio = finite(value)
  if (ratio === null) return null
  return PERCENT.format(Math.abs(ratio))
}

/** Units held, up to four decimals, with grouping. */
export function formatQuantity(value: number | null | undefined): string | null {
  const quantity = finite(value)
  if (quantity === null) return null
  return QUANTITY.format(quantity)
}

/**
 * A holding's return, only where the server actually computed P&L. A manual
 * price is not a market price, so those rows have no return rather than a
 * misleading one.
 */
export function rowReturn(row: BalanceSheetRow): number | null {
  if (row.pnlSgd === null || row.costBasisSgd === null || row.costBasisSgd <= 0) {
    return null
  }

  return row.pnlSgd / row.costBasisSgd
}

/** A row's share of total assets. Liabilities and unpriced rows have none. */
export function rowWeight(row: BalanceSheetRow, totalAssetsSgd: number | null): number | null {
  if (row.isLiability || row.source === 'unpriced') return null
  return shareOf(row.sgdAmount, totalAssetsSgd)
}

/** `value / total`, or null when the denominator is missing or zero. */
export function shareOf(value: number | null | undefined, total: number | null | undefined): number | null {
  const amount = finite(value)
  const denominator = finite(total)
  if (amount === null || denominator === null || denominator <= 0) return null

  return amount / denominator
}

/** Sum of the P&L on rows that have one. Null when no row does. */
export function sectionPnl(rows: BalanceSheetRow[]): number | null {
  const priced = rows.filter(row => row.pnlSgd !== null)
  if (priced.length === 0) return null

  return priced.reduce((sum, row) => sum + (row.pnlSgd || 0), 0)
}

/**
 * A section's return: the P&L it made over the cost basis that produced it.
 * Rows without P&L (manual prices, cash, CPF) stay out of both sides so their
 * cost basis cannot dilute the result.
 */
export function sectionReturn(rows: BalanceSheetRow[]): number | null {
  let pnl = 0
  let costBasis = 0
  let seen = false

  for (const row of rows) {
    if (row.pnlSgd === null || row.costBasisSgd === null || row.costBasisSgd <= 0) continue
    pnl += row.pnlSgd
    costBasis += row.costBasisSgd
    seen = true
  }

  if (!seen || costBasis <= 0) return null
  return pnl / costBasis
}
