import type {
  AmountPair,
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

/**
 * Convert a native amount into the two totals currencies through the SGD rate
 * table. USD is the only required rate besides the row's own: `sgdPerUnit` is
 * expressed as SGD per one unit, so HKD -> SGD -> USD needs no special case.
 *
 * Returns null when the row's currency has no known rate. Callers must mark the
 * row unpriced rather than substituting 1:1, which would invent a value.
 */
export function convertNativeAmount(amount: number, currency: CurrencyCode, fx: FxSnapshot): AmountPair | null {
  const sgdPerUnit = fx.sgdPerUnit[currency]
  const usdPerSgd = fx.sgdPerUnit.USD

  if (typeof sgdPerUnit !== 'number' || !Number.isFinite(sgdPerUnit) || sgdPerUnit <= 0) {
    return null
  }
  if (typeof usdPerSgd !== 'number' || !Number.isFinite(usdPerSgd) || usdPerSgd <= 0) {
    return null
  }

  // The two totals currencies keep their native amount exact. Converting USD
  // to SGD and back would lose a cent to rounding on every row.
  if (currency === 'USD') {
    return {
      usd: roundMoney(amount),
      sgd: roundMoney(amount * sgdPerUnit),
    }
  }

  if (currency === 'SGD') {
    return {
      usd: roundMoney(amount / usdPerSgd),
      sgd: roundMoney(amount),
    }
  }

  const sgd = amount * sgdPerUnit

  return {
    usd: roundMoney(sgd / usdPerSgd),
    sgd: roundMoney(sgd),
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
