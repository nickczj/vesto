import { resolveInstrumentSchema } from '~~/shared/validation/schemas'
import { classifyRequestFailure, describeRequestFailure } from '~~/shared/utils/request-failure'
import { resolutionFromFailure, resolutionFromQuote } from '~~/server/utils/instrument-resolution'
import { fetchLatestQuote } from '~~/server/utils/vesto-go'

/**
 * Resolve a ticker for the add/edit dialog. Returns `resolved`, `not_found`,
 * `rate_limited` or `unavailable` with a sentence rather than throwing on a
 * provider problem: the dialog only blocks on a definitive not-found.
 */
export default defineEventHandler(async (event) => {
  const parsed = resolveInstrumentSchema.safeParse(getQuery(event))
  if (!parsed.success) {
    return {
      status: 'not_found',
      symbol: '',
      quote: null,
      message: 'Enter a ticker to check.',
    }
  }

  const symbol = parsed.data.symbol.toUpperCase()

  try {
    const quote = await fetchLatestQuote(symbol, parsed.data.market)
    return resolutionFromQuote(quote)
  }
  catch (error) {
    const failure = classifyRequestFailure(error)
    console.warn(
      `[vesto] instrument resolve failed: ${describeRequestFailure(failure, 'the market-data service')}:`,
      error instanceof Error ? error.message : String(error),
    )
    return resolutionFromFailure(symbol, failure)
  }
})
