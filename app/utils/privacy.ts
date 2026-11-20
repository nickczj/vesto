import { NO_VALUE } from '~/utils/ledger'

/**
 * The one token every hidden value renders as. It is deliberately fixed: a
 * per-character mask would leak how many digits the hidden number has.
 */
export const HIDDEN_VALUE = '••••'

/**
 * Replace a rendered value with the privacy mask. Only real values are
 * masked: an empty cell means the column does not apply to the row, and `—`
 * means no value exists, so neither is hiding anything.
 */
export function maskValue(text: string | null | undefined, hidden: boolean): string {
  if (!hidden || !text || text === NO_VALUE) return text ?? ''
  return HIDDEN_VALUE
}
