import type { CurrencyCode } from './balance-sheet'

export type InstrumentResolutionStatus = 'resolved' | 'not_found' | 'rate_limited' | 'unavailable'

export interface InstrumentQuotePreview {
  market: string | null
  currency: CurrencyCode
  price: number
  asOf: string
  source: string
}

/**
 * The result of resolving a ticker before saving a holding. `not_found` is a
 * definitive answer (the symbol does not exist); `rate_limited` and
 * `unavailable` mean the provider could not answer, which must not block a
 * save.
 */
export interface InstrumentResolution {
  status: InstrumentResolutionStatus
  symbol: string
  quote: InstrumentQuotePreview | null
  message: string
}
