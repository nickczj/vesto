import { CURRENCIES } from '~~/shared/types/balance-sheet'
import type { InstrumentResolution } from '~~/shared/types/instrument'
import type { RequestFailure } from '~~/shared/utils/request-failure'
import { canonicalCurrency, type InstrumentQuoteSnapshot } from '~~/server/utils/vesto-go'

export function resolutionFromQuote(quote: InstrumentQuoteSnapshot): InstrumentResolution {
  const currency = canonicalCurrency(quote.currency)

  if (!currency) {
    return {
      status: 'not_found',
      symbol: quote.symbol,
      quote: null,
      message: `The quote is in ${quote.currency || 'an unsupported currency'}; Vesto supports ${CURRENCIES.join(', ')}.`,
    }
  }

  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    return {
      status: 'unavailable',
      symbol: quote.symbol,
      quote: null,
      message: 'The provider returned no usable price. Try again, or save the holding as manual only.',
    }
  }

  return {
    status: 'resolved',
    symbol: quote.symbol,
    quote: {
      market: quote.market,
      currency,
      price: quote.price,
      asOf: quote.asOf,
      source: quote.source,
    },
    message: `Resolved${quote.market ? ` on ${quote.market}` : ''} in ${currency}.`,
  }
}

/**
 * A missing symbol is a definitive answer and may block a live-priced save.
 * A rate limit or an outage is not: the holding should still be saveable and
 * will price on a later refresh.
 */
export function resolutionFromFailure(symbol: string, failure: RequestFailure): InstrumentResolution {
  if (failure.kind === 'http' && (failure.status === 404 || failure.status === 400)) {
    return {
      status: 'not_found',
      symbol,
      quote: null,
      message: `No quote found for ${symbol}. Check the ticker and exchange.`,
    }
  }

  if (failure.kind === 'http' && failure.status === 429) {
    return {
      status: 'rate_limited',
      symbol,
      quote: null,
      message: 'The provider is rate limited. Try again in a minute, or save the holding as manual only.',
    }
  }

  return {
    status: 'unavailable',
    symbol,
    quote: null,
    message: 'The market-data service is not responding. You can still save the holding; it will price when a quote is available.',
  }
}
