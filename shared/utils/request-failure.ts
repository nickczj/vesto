/**
 * Turns a failed request into something that can be shown on the page.
 *
 * A raw fetch error reads like
 * `[GET] "http://127.0.0.1:8080/api/market/fx?base=USD&quote=SGD": <no response> fetch failed`.
 * That is a log line, not a message: it names an internal address and says
 * nothing a person can act on. The raw error still belongs in the server log.
 */
export type RequestFailureKind = 'unreachable' | 'timeout' | 'http' | 'failed'

export interface RequestFailure {
  kind: RequestFailureKind
  /** HTTP status when the other side answered with one. */
  status: number | null
}

interface ErrorLike {
  name?: unknown
  message?: unknown
  status?: unknown
  statusCode?: unknown
  cause?: unknown
  code?: unknown
}

function asErrorLike(value: unknown): ErrorLike | null {
  return typeof value === 'object' && value !== null ? value as ErrorLike : null
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function looksLikeTimeout(error: ErrorLike | null): boolean {
  if (!error) return false

  const name = textOf(error.name)
  if (name === 'TimeoutError' || name === 'AbortError') return true

  return /timed? ?out|aborted/i.test(textOf(error.message))
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

function looksUnreachable(error: ErrorLike | null): boolean {
  if (!error) return false
  if (UNREACHABLE_CODES.has(textOf(error.code))) return true

  // `ofetch` reports a request that got no answer as "<no response>", and the
  // platform fetch reports it as "fetch failed" / "Failed to fetch".
  return /<no response>|fetch failed|failed to fetch|network ?error|load failed/i.test(textOf(error.message))
}

export function classifyRequestFailure(error: unknown): RequestFailure {
  const outer = asErrorLike(error)
  const cause = asErrorLike(outer?.cause)

  const status = Number(outer?.status ?? outer?.statusCode)
  if (Number.isInteger(status) && status >= 400) {
    return { kind: 'http', status }
  }

  if (looksLikeTimeout(outer) || looksLikeTimeout(cause)) {
    return { kind: 'timeout', status: null }
  }

  if (looksUnreachable(outer) || looksUnreachable(cause)) {
    return { kind: 'unreachable', status: null }
  }

  return { kind: 'failed', status: null }
}

/** True when nothing answered at all, as opposed to answering with an error. */
export function isUnreachable(failure: RequestFailure): boolean {
  return failure.kind === 'unreachable' || failure.kind === 'timeout'
}

/**
 * A sentence fragment about `service`, for example
 * "the market-data service did not respond".
 */
export function describeRequestFailure(failure: RequestFailure, service: string): string {
  switch (failure.kind) {
    case 'unreachable':
      return `${service} did not respond`
    case 'timeout':
      return `${service} took too long to respond`
    case 'http':
      return `${service} returned an error (HTTP ${failure.status})`
    default:
      return `the request to ${service} failed`
  }
}
