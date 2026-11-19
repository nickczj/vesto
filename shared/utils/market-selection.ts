import { isSupportedMarket, normalizeMarketCode } from './markets'

/**
 * Whether the exchange was filled from a resolved quote (`auto`) or typed by
 * the operator (`manual`). An auto market follows the ticker; a manual market
 * is kept, but a mismatch is surfaced rather than saved silently.
 */
export type MarketSource = 'auto' | 'manual'

export interface MarketChoice {
  market: string | null
  source: MarketSource
  /** The provider's venue when it differs from a manual choice. */
  mismatch: string | null
}

/**
 * Reconcile the exchange field with the venue a ticker resolved on.
 *
 * A new or auto-filled holding adopts the provider's venue. A manually chosen
 * venue is never overwritten: the caller shows `mismatch` so the operator can
 * accept the resolved venue or keep the override deliberately.
 */
export function reconcileMarketChoice(input: {
  market: string | null | undefined
  source: MarketSource
  resolved: string | null | undefined
}): MarketChoice {
  const current = normalizeMarketCode(input.market)
  const resolved = normalizeMarketCode(input.resolved)

  if (!resolved) {
    return { market: current, source: input.source, mismatch: null }
  }

  if (!current || input.source === 'auto') {
    return { market: resolved, source: 'auto', mismatch: null }
  }

  return {
    market: current,
    source: 'manual',
    mismatch: current === resolved ? null : resolved,
  }
}

/**
 * A soft warning for a code outside the known venue list. It does not block a
 * save: Yahoo is global, and a new venue should not need a code change before
 * it can price.
 */
export function unknownMarketWarning(market: string | null | undefined): string | null {
  const code = normalizeMarketCode(market)
  if (!code || isSupportedMarket(code)) return null

  return `Unrecognised exchange code "${code}". Quotes may still resolve, but the venue will not be labelled.`
}
