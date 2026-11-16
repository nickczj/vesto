import type { ValuationHistoryResponse } from '~~/shared/types/history'

export function useValuationHistory() {
  const history = useState<ValuationHistoryResponse | null>('valuation-history:snapshot', () => null)
  const isLoading = useState<boolean>('valuation-history:loading', () => false)
  const errorMessage = useState<string | null>('valuation-history:error', () => null)

  async function load() {
    if (isLoading.value) return

    isLoading.value = true
    errorMessage.value = null
    try {
      history.value = await $fetch<ValuationHistoryResponse>('/api/history')
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    history,
    isLoading,
    errorMessage,
    load,
  }
}
