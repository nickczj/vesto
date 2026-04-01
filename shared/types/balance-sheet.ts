export const CURRENCIES = ['USD', 'SGD'] as const
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

export type ValuationSource = 'live' | 'manual' | 'stale' | 'book'

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
  manualUnitPrice: number | null
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
  base: 'USD'
  quote: 'SGD'
  usdToSgd: number
  sgdToUsd: number
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
  boughtUnitPrice: number | null
  costBasisNative: number | null
  costBasisUsd: number | null
  costBasisSgd: number | null
  pnlNative: number | null
  pnlUsd: number | null
  pnlSgd: number | null
  usdAmount: number
  sgdAmount: number
  source: ValuationSource
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

export interface BalanceSheetResponse {
  generatedAt: string
  refreshMode: RefreshMode
  rows: BalanceSheetRow[]
  totals: BalanceSheetTotals
  fx: FxSnapshot | null
  quoteSummary: {
    requested: number
    priced: number
    stale: number
    manualFallback: number
  }
  warnings: string[]
}
