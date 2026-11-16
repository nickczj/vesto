export const VIEW_PREFERENCES_COOKIE = 'vesto_view_preferences'

export const VIEW_DENSITIES = ['comfortable', 'compact'] as const
export type ViewDensity = (typeof VIEW_DENSITIES)[number]

export const PRIMARY_CURRENCIES = ['SGD', 'USD'] as const
export type PrimaryCurrency = (typeof PRIMARY_CURRENCIES)[number]

export type KpiCardCount = 2 | 4

export interface ViewSectionVisibility {
  cpf: boolean
  cashSavings: boolean
  liabilities: boolean
}

export interface ViewPreferences {
  density: ViewDensity
  primaryCurrency: PrimaryCurrency
  kpiCards: KpiCardCount
  sections: ViewSectionVisibility
  stickyHeader: boolean
  stickyNameColumn: boolean
  showSource: boolean
  showNative: boolean
}

export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  density: 'comfortable',
  primaryCurrency: 'SGD',
  kpiCards: 4,
  sections: {
    cpf: true,
    cashSavings: true,
    liabilities: true,
  },
  stickyHeader: true,
  stickyNameColumn: false,
  showSource: false,
  showNative: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function defaultViewPreferences(): ViewPreferences {
  return {
    ...DEFAULT_VIEW_PREFERENCES,
    sections: { ...DEFAULT_VIEW_PREFERENCES.sections },
  }
}

/**
 * Parse per-device view preferences. Unknown keys and invalid values fall back
 * to the defaults rather than breaking the page. This has to be tolerant: the
 * stored shape may come from an older build.
 */
export function parseViewPreferences(raw: string | null): ViewPreferences {
  if (!raw) return defaultViewPreferences()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return defaultViewPreferences()
  }

  if (!isRecord(parsed)) {
    return defaultViewPreferences()
  }

  const sections = isRecord(parsed.sections) ? parsed.sections : {}

  return {
    density: parsed.density === 'compact' ? 'compact' : 'comfortable',
    primaryCurrency: parsed.primaryCurrency === 'USD' ? 'USD' : 'SGD',
    kpiCards: parsed.kpiCards === 2 ? 2 : 4,
    sections: {
      cpf: sections.cpf !== false,
      cashSavings: sections.cashSavings !== false,
      liabilities: sections.liabilities !== false,
    },
    stickyHeader: parsed.stickyHeader !== false,
    stickyNameColumn: parsed.stickyNameColumn === true,
    showSource: parsed.showSource === true,
    showNative: parsed.showNative === true,
  }
}

export function serializeViewPreferences(preferences: ViewPreferences): string {
  return JSON.stringify(preferences)
}
