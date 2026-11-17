/**
 * Provider market codes are not canonical. Yahoo returns `HKG` for Hong Kong
 * and `XLON`/`XAMS` for London and Amsterdam; older rows may hold either form.
 * Normalise the known aliases once, at every boundary that stores or displays a
 * market, so the quote request, session logic and table all agree.
 */
const MARKET_ALIASES: Record<string, string> = {
  HKG: 'SEHK',
  XHKG: 'SEHK',
  XLON: 'LSE',
  LON: 'LSE',
  XAMS: 'AMS',
  XSES: 'SGX',
  SES: 'SGX',
  XNAS: 'NMS',
  NASDAQ: 'NMS',
  XNYS: 'NYQ',
  NYSE: 'NYQ',
  ARCX: 'PCX',
  ARCA: 'PCX',
  NYSEARCA: 'PCX',
}

const VENUE_LABELS: Record<string, string> = {
  SEHK: 'HKEX',
  LSE: 'LSE',
  AMS: 'Euronext',
  SGX: 'SGX',
  NMS: 'NASDAQ',
  NYQ: 'NYSE',
  PCX: 'NYSE Arca',
}

const VENUE_NAMES: Record<string, string> = {
  SEHK: 'Stock Exchange of Hong Kong',
  LSE: 'London Stock Exchange',
  AMS: 'Euronext Amsterdam',
  SGX: 'Singapore Exchange',
  NMS: 'NASDAQ',
  NYQ: 'New York Stock Exchange',
  PCX: 'NYSE Arca',
}

export function normalizeMarketCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase()
  if (!normalized) return null

  return MARKET_ALIASES[normalized] ?? normalized
}

/** A short label for the ledger: `HKEX`, `NASDAQ`, `Euronext`. */
export function venueLabel(market: string | null | undefined): string | null {
  const code = normalizeMarketCode(market)
  if (!code) return null

  return VENUE_LABELS[code] ?? code
}

/** A fuller label for a tooltip, with the raw code when it differs. */
export function venueTitle(market: string | null | undefined): string | null {
  const code = normalizeMarketCode(market)
  if (!code) return null

  const name = VENUE_NAMES[code]
  return name ? `${name} (${code})` : code
}

/** The Ccy cell: `HKD · HKEX`, or just the currency for a row with no market. */
export function formatCurrencyVenue(currency: string, market: string | null | undefined): string {
  const venue = venueLabel(market)
  return venue ? `${currency} · ${venue}` : currency
}
