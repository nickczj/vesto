import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEW_PREFERENCES,
  defaultViewPreferences,
  parseViewPreferences,
  serializeViewPreferences,
} from '~/utils/view-preferences'

describe('view preferences', () => {
  it('starts from the documented defaults', () => {
    const parsed = parseViewPreferences(null)
    expect(parsed).toEqual(DEFAULT_VIEW_PREFERENCES)
    expect(parsed).toMatchObject({
      density: 'comfortable',
      primaryCurrency: 'SGD',
      stickyHeader: true,
      stickyNameColumn: false,
      showSource: false,
      showNative: false,
    })
    expect(parsed).not.toBe(DEFAULT_VIEW_PREFERENCES)
    expect(parsed.sections).not.toBe(DEFAULT_VIEW_PREFERENCES.sections)
  })

  it('falls back to defaults on broken JSON or bad shapes', () => {
    expect(parseViewPreferences('{not json')).toEqual(DEFAULT_VIEW_PREFERENCES)
    expect(parseViewPreferences('[]')).toEqual(DEFAULT_VIEW_PREFERENCES)
    expect(parseViewPreferences('"compact"')).toEqual(DEFAULT_VIEW_PREFERENCES)
  })

  it('keeps valid values and rejects unknown ones', () => {
    const parsed = parseViewPreferences(JSON.stringify({
      density: 'compact',
      primaryCurrency: 'USD',
      sections: { cpf: false, cashSavings: true, liabilities: false },
      stickyHeader: false,
      stickyNameColumn: true,
      showSource: true,
      showNative: false,
    }))

    expect(parsed).toEqual({
      density: 'compact',
      primaryCurrency: 'USD',
      sections: { cpf: false, cashSavings: true, liabilities: false },
      stickyHeader: false,
      stickyNameColumn: true,
      showSource: true,
      showNative: false,
    })

    const invalid = parseViewPreferences(JSON.stringify({
      density: 'tiny',
      primaryCurrency: 'EUR',
      kpiCards: 3,
      sections: { cpf: 'yes' },
      stickyHeader: 'no',
      stickyNameColumn: 1,
      showSource: 1,
    }))

    expect(invalid.density).toBe('comfortable')
    expect(invalid.primaryCurrency).toBe('SGD')
    expect(invalid.sections).toEqual({ cpf: true, cashSavings: true, liabilities: true })
    expect(invalid.stickyHeader).toBe(true)
    expect(invalid.stickyNameColumn).toBe(false)
    expect(invalid.showSource).toBe(false)
  })

  it('ignores the KPI card setting stored by an older build', () => {
    const parsed = parseViewPreferences(JSON.stringify({
      ...DEFAULT_VIEW_PREFERENCES,
      kpiCards: 2,
    }))

    expect(parsed).not.toHaveProperty('kpiCards')
    expect(parsed).toEqual(DEFAULT_VIEW_PREFERENCES)
  })

  it('round-trips a serialized preference object', () => {
    const preferences = defaultViewPreferences()
    preferences.density = 'compact'
    preferences.sections.liabilities = false
    expect(parseViewPreferences(serializeViewPreferences(preferences))).toEqual(preferences)
  })
})
