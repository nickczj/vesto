import { describe, expect, it } from 'vitest'
import {
  classifyRequestFailure,
  describeRequestFailure,
  isUnreachable,
} from '~~/shared/utils/request-failure'
import { toUserMessage } from '~/utils/errors'

/** The shape `ofetch` throws when nothing answered. */
function noResponse(detail = 'fetch failed'): Error {
  const error = new Error(`[GET] "http://127.0.0.1:8080/api/market/fx?base=USD&quote=SGD": <no response> ${detail}`)
  error.name = 'FetchError'
  return error
}

/** The shape `ofetch` throws when the other side answered with an error. */
function httpError(status: number, data?: unknown): Error {
  const error = new Error(`[GET] "/api/balance-sheet?refresh=always": ${status} Something`) as Error & {
    status: number
    statusCode: number
    data?: unknown
  }
  error.name = 'FetchError'
  error.status = status
  error.statusCode = status
  error.data = data
  return error
}

describe('classifying a failed request', () => {
  it('recognises a service that did not answer', () => {
    expect(classifyRequestFailure(noResponse())).toEqual({ kind: 'unreachable', status: null })

    const refused = new Error('connect failed') as Error & { cause: unknown }
    refused.cause = { code: 'ECONNREFUSED' }
    expect(classifyRequestFailure(refused).kind).toBe('unreachable')
  })

  it('recognises a timeout, including one reported as the cause', () => {
    expect(classifyRequestFailure(noResponse('The operation was aborted due to timeout')).kind).toBe('timeout')

    const wrapped = new Error('request failed') as Error & { cause: unknown }
    wrapped.cause = { name: 'TimeoutError', message: 'signal timed out' }
    expect(classifyRequestFailure(wrapped).kind).toBe('timeout')
  })

  it('keeps the status when the service answered with an error', () => {
    expect(classifyRequestFailure(httpError(503))).toEqual({ kind: 'http', status: 503 })
  })

  it('does not guess about anything else', () => {
    expect(classifyRequestFailure(new Error('upstream down')).kind).toBe('failed')
    expect(classifyRequestFailure('nope').kind).toBe('failed')
    expect(classifyRequestFailure(null).kind).toBe('failed')
  })

  it('treats "no answer" and "too slow" as unreachable, an HTTP error as reachable', () => {
    expect(isUnreachable(classifyRequestFailure(noResponse()))).toBe(true)
    expect(isUnreachable({ kind: 'timeout', status: null })).toBe(true)
    expect(isUnreachable(classifyRequestFailure(httpError(500)))).toBe(false)
  })
})

describe('describing a failed request', () => {
  it('never repeats the address it was calling', () => {
    const service = 'the market-data service'
    const messages = [
      describeRequestFailure(classifyRequestFailure(noResponse()), service),
      describeRequestFailure(classifyRequestFailure(noResponse('The operation was aborted due to timeout')), service),
      describeRequestFailure(classifyRequestFailure(httpError(503)), service),
      describeRequestFailure(classifyRequestFailure(new Error('http://127.0.0.1:8080 exploded')), service),
    ]

    expect(messages).toEqual([
      'the market-data service did not respond',
      'the market-data service took too long to respond',
      'the market-data service returned an error (HTTP 503)',
      'the request to the market-data service failed',
    ])
    for (const message of messages) {
      expect(message).not.toMatch(/127\.0\.0\.1|http:|\[GET\]/)
    }
  })
})

describe('messages for the page', () => {
  it('says the server did not respond instead of printing the fetch error', () => {
    expect(toUserMessage(noResponse())).toBe('The Vesto server did not respond.')
  })

  it('keeps the validation text the API wrote for a 400', () => {
    expect(toUserMessage(httpError(400, { message: 'name is required' }))).toBe('name is required')
  })

  it('keeps the gateway message the API wrote about the market-data service', () => {
    const message = 'Provider status is unavailable: the market-data service did not respond.'
    expect(toUserMessage(httpError(502, { message }))).toBe(message)
  })

  it('does not pass on the text of an unexpected server error', () => {
    const leaked = httpError(500, { message: 'SQLITE_BUSY: database is locked at /data/vesto-v2.db' })
    expect(toUserMessage(leaked)).toBe('The Vesto server returned an error (HTTP 500).')
  })

  it('asks for a sign-in on 401', () => {
    expect(toUserMessage(httpError(401))).toContain('Sign-in is required')
  })

  it('uses the message of an error that was not a request', () => {
    expect(toUserMessage(new Error('Workbook could not be written'))).toBe('Workbook could not be written')
  })
})
