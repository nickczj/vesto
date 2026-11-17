export const CURRENCIES = ['USD', 'SGD', 'HKD'] as const
export type CurrencyCode = (typeof CURRENCIES)[number]

export const ASSET_KINDS = ['investment', 'cpf', 'cash_savings', 'manual'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export const CPF_BUCKETS = ['OA', 'SA', 'MA', 'RA'] as const
export type CpfBucket = (typeof CPF_BUCKETS)[number]

export const LIABILITY_TYPES = ['loan', 'credit_card', 'other'] as const
export type LiabilityType = (typeof LIABILITY_TYPES)[number]

export const VALUATION_MODES = ['live_preferred', 'manual_only'] as const
export type ValuationMode = (typeof VALUATION_MODES)[number]

export const BALANCE_SECTIONS = ['investments', 'cpf', 'cash_savings', 'liabilities'] as const
export type BalanceSection = (typeof BALANCE_SECTIONS)[number]

export const REFRESH_MODES = ['never', 'stale', 'always'] as const
export type RefreshMode = (typeof REFRESH_MODES)[number]

export const LIVE_REFRESH_INTERVAL_MS = 45_000

export type ValuationSource = 'live' | 'manual' | 'stale' | 'book' | 'unpriced'

export interface AssetEntry {
  id: number
  kind: AssetKind
  name: string
  symbol: string | null
  market: string | null
  cpfBucket: CpfBucket | null
  currency: CurrencyCode
  amount: number
  quantity: number | null
  costBasisUnitPrice: number | null
  manualPrice: number | null
  valuationMode: ValuationMode
  notes: string | null
  externalId: string | null
  createdAt: string
  updatedAt: string
}

export interface LiabilityEntry {
  id: number
  type: LiabilityType
  name: string
  currency: CurrencyCode
  outstandingAmount: number
  notes: string | null
  externalId: string | null
  createdAt: string
  updatedAt: string
}

export interface QuoteSnapshot {
  symbol: string
  market: string | null
  currency: CurrencyCode
  price: number
  asOf: string
  fetchedAt: string
  source: string
  isStale: boolean
}

export interface FxSnapshot {
  /**
   * The headline pair. USD and SGD stay the only totals currencies; every other
   * currency is converted through `sgdPerUnit` before it reaches a total.
   */
  base: 'USD'
  quote: 'SGD'
  usdToSgd: number
  sgdToUsd: number
  /**
   * SGD per one unit of each currency this sheet needs, including USD and SGD.
   * A missing entry means the rate is unknown; it is never treated as 1:1, so
   * rows in that currency become unpriced instead of silently misvalued.
   */
  sgdPerUnit: Partial<Record<CurrencyCode, number>>
  asOf: string
  fetchedAt: string
  source: string
  isStale: boolean
}

export interface BalanceSheetRow {
  id: string
  entityType: 'asset' | 'liability'
  entityId: number
  section: BalanceSection
  name: string
  category: string
  nativeCurrency: CurrencyCode
  nativeAmount: number
  /** Units held, for investments that have one. Null for every other row. */
  quantity: number | null
  boughtUnitPrice: number | null
  currentUnitPrice: number | null
  costBasisNative: number | null
  costBasisUsd: number | null
  costBasisSgd: number | null
  pnlNative: number | null
  pnlUsd: number | null
  pnlSgd: number | null
  usdAmount: number
  sgdAmount: number
  source: ValuationSource
  /** Provider that supplied the quote behind `source`, when one did. */
  provider: string | null
  asOf: string | null
  symbol: string | null
  market: string | null
  notes: string | null
  isLiability: boolean
  isPending?: boolean
}

export interface AmountPair {
  usd: number
  sgd: number
}

export interface BalanceSheetTotals {
  sections: {
    investments: AmountPair
    cpf: AmountPair
    cash_savings: AmountPair
    liabilities: AmountPair
  }
  totalAssets: AmountPair
  totalLiabilities: AmountPair
  netWorth: AmountPair
}

/**
 * How the last attempt to reach vesto-go went. `unreachable` means nothing
 * answered; `degraded` means it answered but some of it failed.
 */
export type MarketDataStatus = 'ok' | 'degraded' | 'unreachable' | 'unknown'

export interface MarketDataState {
  status: MarketDataStatus
  /** When quotes for this portfolio last arrived. Null when none ever have. */
  quotesFetchedAt: string | null
  /** When the most recent attempt was made. Null before the first one. */
  checkedAt: string | null
}

export interface BalanceSheetResponse {
  /** When this response was built. Not when prices were fetched: see `marketData`. */
  generatedAt: string
  refreshMode: RefreshMode
  rows: BalanceSheetRow[]
  totals: BalanceSheetTotals
  fx: FxSnapshot | null
  quoteSummary: {
    requested: number
    priced: number
    stale: number
    manualPriced: number
    unpriced: number
  }
  marketData: MarketDataState
  warnings: string[]
}
