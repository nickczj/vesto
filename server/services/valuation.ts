import type {
  BalanceSheetRow,
  BalanceSheetTotals,
  CurrencyCode,
  FxSnapshot,
} from '~~/shared/types/balance-sheet'

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function roundRate(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000
}

export function emptyTotals(): BalanceSheetTotals {
  return {
    sections: {
      investments: { usd: 0, sgd: 0 },
      cpf: { usd: 0, sgd: 0 },
      cash_savings: { usd: 0, sgd: 0 },
      liabilities: { usd: 0, sgd: 0 },
    },
    totalAssets: { usd: 0, sgd: 0 },
    totalLiabilities: { usd: 0, sgd: 0 },
    netWorth: { usd: 0, sgd: 0 },
  }
}

export function convertNativeAmount(amount: number, currency: CurrencyCode, fx: FxSnapshot): {
  usd: number
  sgd: number
} {
  switch (currency) {
    case 'USD':
      return {
        usd: roundMoney(amount),
        sgd: roundMoney(amount * fx.usdToSgd),
      }
    case 'SGD':
      return {
        usd: roundMoney(amount * fx.sgdToUsd),
        sgd: roundMoney(amount),
      }
    default: {
      // Exhaustiveness guard: adding a currency must be a deliberate change,
      // never an implicit "treat it as USD/SGD".
      const unsupported: never = currency
      throw new Error(`unsupported currency: ${String(unsupported)}`)
    }
  }
}

export function accumulateTotals(rows: BalanceSheetRow[]): BalanceSheetTotals {
  const totals = emptyTotals()

  for (const row of rows) {
    // Unpriced rows have no trustworthy USD/SGD value. Counting them as 0 is
    // worse than not counting them: it silently understates net worth.
    if (row.source === 'unpriced') {
      continue
    }

    const sectionTotal = totals.sections[row.section]
    sectionTotal.usd = roundMoney(sectionTotal.usd + row.usdAmount)
    sectionTotal.sgd = roundMoney(sectionTotal.sgd + row.sgdAmount)

    if (row.section === 'liabilities') {
      totals.totalLiabilities.usd = roundMoney(totals.totalLiabilities.usd + row.usdAmount)
      totals.totalLiabilities.sgd = roundMoney(totals.totalLiabilities.sgd + row.sgdAmount)
    }
    else {
      totals.totalAssets.usd = roundMoney(totals.totalAssets.usd + row.usdAmount)
      totals.totalAssets.sgd = roundMoney(totals.totalAssets.sgd + row.sgdAmount)
    }
  }

  totals.netWorth.usd = roundMoney(totals.totalAssets.usd - totals.totalLiabilities.usd)
  totals.netWorth.sgd = roundMoney(totals.totalAssets.sgd - totals.totalLiabilities.sgd)

  return totals
}
