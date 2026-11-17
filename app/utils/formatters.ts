import type { CurrencyCode } from '~~/shared/types/balance-sheet'

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  SGD: 'S$',
  USD: 'US$',
}

export function formatCurrency(value: number, currency: CurrencyCode, compact = false): string {
  const amount = Number.isFinite(value) ? value : 0
  const body = new Intl.NumberFormat('en-SG', {
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(Math.abs(amount))

  return `${amount < 0 ? '-' : ''}${CURRENCY_SYMBOLS[currency]}${body}`
}

export function formatSignedCurrency(value: number, currency: CurrencyCode): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}${formatCurrency(Math.abs(value), currency)}`
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'

  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

const SGT_TIME_ZONE = 'Asia/Singapore'

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** A day in SGT: `16 Nov`. Used for FX and snapshot dates. */
export function formatShortDate(value: string | null | undefined): string {
  const parsed = parseDate(value)
  if (!parsed) return 'N/A'

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    timeZone: SGT_TIME_ZONE,
  }).format(parsed)
}

/** A day in SGT with the year: `16 Nov 2026`. */
export function formatHistoryDate(value: string | null | undefined): string {
  const parsed = parseDate(value)
  if (!parsed) return 'N/A'

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: SGT_TIME_ZONE,
  }).format(parsed)
}

/** A 24-hour clock time in SGT: `10:57`. */
export function formatClock(value: string | null | undefined): string {
  const parsed = parseDate(value)
  if (!parsed) return 'N/A'

  return new Intl.DateTimeFormat('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SGT_TIME_ZONE,
  }).format(parsed)
}

/**
 * A timestamp for "when did this last happen": the time alone when it was
 * today, the date and time otherwise. Keeps the common case short.
 */
export function formatRecentTimestamp(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'

  const sameDay = parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate()

  if (!sameDay) return formatTimestamp(value)

  return new Intl.DateTimeFormat('en-SG', { timeStyle: 'short' }).format(parsed)
}
