import { createHash, timingSafeEqual } from 'node:crypto'

export interface BasicCredentials {
  user: string
  password: string
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * Parse an HTTP Basic authorization header. Returns null for anything that is
 * not a well-formed Basic credential. Passwords may contain colons; the first
 * colon separates the user from the password.
 */
export function parseBasicAuthorization(header: string | null | undefined): BasicCredentials | null {
  if (!header) return null

  const match = /^basic\s+(\S+)$/i.exec(header.trim())
  if (!match) return null

  const decoded = Buffer.from(match[1]!, 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator < 0) return null

  return {
    user: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  }
}

/** Constant-time comparison that does not leak input length. */
export function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right))
}

export function isAuthorized(
  header: string | null | undefined,
  expected: BasicCredentials,
): boolean {
  const supplied = parseBasicAuthorization(header)
  if (!supplied) return false

  // Evaluate both comparisons so a wrong username does not skip the password
  // comparison.
  const userMatches = safeEqual(supplied.user, expected.user)
  const passwordMatches = safeEqual(supplied.password, expected.password)

  return userMatches && passwordMatches
}
