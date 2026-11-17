import {
  overallSourceState,
  type OverallSourceState,
  type SourceHealthSnapshot,
} from '~~/shared/types/source-health'
import { toUserMessage } from '~/utils/errors'

const BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60_000

export function useSourceHealth() {
  const snapshot = useState<SourceHealthSnapshot | null>('source-health:snapshot', () => null)
  const errorMessage = useState<string | null>('source-health:error', () => null)
  const isLoading = useState<boolean>('source-health:loading', () => false)
  const loadedAt = useState<number>('source-health:loaded-at', () => 0)

  const overall = computed<OverallSourceState>(() => {
    if (!snapshot.value) return 'unavailable'
    return overallSourceState(snapshot.value.sources)
  })

  async function load(options: { force?: boolean } = {}) {
    if (isLoading.value) return

    const force = options.force === true
    const isFresh = snapshot.value !== null
      && Date.now() - loadedAt.value < BACKGROUND_REFRESH_INTERVAL_MS

    if (!force && isFresh) return

    isLoading.value = true
    errorMessage.value = null
    try {
      snapshot.value = await $fetch<SourceHealthSnapshot>('/api/sources', {
        query: force ? { refresh: 'always' } : {},
      })
      loadedAt.value = Date.now()
    }
    catch (error) {
      errorMessage.value = toUserMessage(error)
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    snapshot,
    overall,
    isLoading,
    errorMessage,
    load,
  }
}
