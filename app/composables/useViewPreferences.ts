import type { BalanceSection } from '~~/shared/types/balance-sheet'
import {
  defaultViewPreferences,
  type KpiCardCount,
  type PrimaryCurrency,
  type ViewDensity,
  type ViewPreferences,
} from '~/utils/view-preferences'

export type ViewSectionKey = keyof ViewPreferences['sections']

const SECTION_LABELS: Record<ViewSectionKey, string> = {
  cpf: 'CPF',
  cashSavings: 'Cash / Savings',
  liabilities: 'Liabilities',
}

export function useViewPreferences() {
  const preferences = useState<ViewPreferences>('view:preferences', defaultViewPreferences)

  const visibleSections = computed<BalanceSection[]>(() => {
    const sections: BalanceSection[] = ['investments']
    if (preferences.value.sections.cpf) sections.push('cpf')
    if (preferences.value.sections.cashSavings) sections.push('cash_savings')
    if (preferences.value.sections.liabilities) sections.push('liabilities')
    return sections
  })

  const hiddenSectionLabels = computed<string[]>(() => {
    const hidden: string[] = []
    if (!preferences.value.sections.cpf) hidden.push(SECTION_LABELS.cpf)
    if (!preferences.value.sections.cashSavings) hidden.push(SECTION_LABELS.cashSavings)
    if (!preferences.value.sections.liabilities) hidden.push(SECTION_LABELS.liabilities)
    return hidden
  })

  function setDensity(density: ViewDensity) {
    preferences.value = { ...preferences.value, density }
  }

  function setPrimaryCurrency(primaryCurrency: PrimaryCurrency) {
    preferences.value = { ...preferences.value, primaryCurrency }
  }

  function setKpiCards(kpiCards: KpiCardCount) {
    preferences.value = { ...preferences.value, kpiCards }
  }

  function setSectionVisible(section: ViewSectionKey, visible: boolean) {
    preferences.value = {
      ...preferences.value,
      sections: { ...preferences.value.sections, [section]: visible },
    }
  }

  function setStickyHeader(stickyHeader: boolean) {
    preferences.value = { ...preferences.value, stickyHeader }
  }

  function setStickyNameColumn(stickyNameColumn: boolean) {
    preferences.value = { ...preferences.value, stickyNameColumn }
  }

  function setShowSource(showSource: boolean) {
    preferences.value = { ...preferences.value, showSource }
  }

  function setShowNative(showNative: boolean) {
    preferences.value = { ...preferences.value, showNative }
  }

  function resetPreferences() {
    preferences.value = defaultViewPreferences()
  }

  return {
    preferences,
    visibleSections,
    hiddenSectionLabels,
    setDensity,
    setPrimaryCurrency,
    setKpiCards,
    setSectionVisible,
    setStickyHeader,
    setStickyNameColumn,
    setShowSource,
    setShowNative,
    resetPreferences,
  }
}
