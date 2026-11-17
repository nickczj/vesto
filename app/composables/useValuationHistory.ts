import type { ValuationHistoryResponse } from '~~/shared/types/history'
import { toUserMessage } from '~/utils/errors'

export function useValuationHistory() {
  const history = useState<ValuationHistoryResponse | null>('valuation-history:snapshot', () => null)
  const isLoading = useState<boolean>('valuation-history:loading', () => false)
  const errorMessage = useState<string | null>('valuation-history:error', () => null)

  async function load() {
    if (isLoading.value) return

    isLoading.value = true
    errorMessage.value = null
    try {
      // The card filters this series client-side for its range switch, and the
      // headline's drawdown needs the whole series, so read the full API
      // window once. 3650 days is the endpoint's maximum.
      history.value = await $fetch<ValuationHistoryResponse>('/api/history', {
        query: { days: 3650 },
      })
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
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
