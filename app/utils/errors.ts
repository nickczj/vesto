import {
  classifyRequestFailure,
  describeRequestFailure,
} from '~~/shared/utils/request-failure'

const SERVER = 'the Vesto server'

function sentence(fragment: string): string {
  return `${fragment.charAt(0).toUpperCase()}${fragment.slice(1)}.`
}

/** The message the API wrote for this response, when it wrote one. */
function serverMessage(error: unknown): string | null {
  const data = (error as { data?: { message?: unknown } } | null)?.data
  const message = typeof data?.message === 'string' ? data.message.trim() : ''
  return message || null
}

/**
 * A message for the page from anything a request or an action threw.
 *
 * `$fetch` errors stringify as `[GET] "/api/…": 502 …`, which is a log line.
 * The API's own 4xx text (validation) and its gateway errors (502–504, written
 * about the market-data service) are already meant for a person and are kept.
 */
export function toUserMessage(error: unknown): string {
  const failure = classifyRequestFailure(error)

  if (failure.kind === 'http' && failure.status !== null) {
    if (failure.status === 401) {
      return 'Sign-in is required. Reload the page to sign in again.'
    }

    const written = serverMessage(error)
    const isAuthored = failure.status < 500 || (failure.status >= 502 && failure.status <= 504)
    if (written && isAuthored) return written

    return sentence(describeRequestFailure(failure, SERVER))
  }

  if (failure.kind === 'failed') {
    // Not a request at all (an export or a parse failed): its own message is
    // the useful one.
    return error instanceof Error ? error.message : String(error)
  }

  return sentence(describeRequestFailure(failure, SERVER))
}
