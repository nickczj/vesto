import type { ViewPreferences } from '~/utils/view-preferences'
import {
  defaultViewPreferences,
  parseViewPreferences,
  serializeViewPreferences,
  VIEW_PREFERENCES_COOKIE,
} from '~/utils/view-preferences'

const VIEW_PREFERENCES_STORAGE_KEY = 'vesto:view-preferences'

function persist(preferences: ViewPreferences) {
  const serialized = serializeViewPreferences(preferences)

  try {
    window.localStorage.setItem(VIEW_PREFERENCES_STORAGE_KEY, serialized)
  }
  catch {
    // A full or blocked localStorage must not break the page.
  }

  // Mirror to a cookie so SSR can render the same first paint. This is not a
  // secret; it only contains layout preferences.
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${VIEW_PREFERENCES_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=31536000; SameSite=Lax${secure}`
}

/**
 * localStorage is the source of truth for per-device view preferences. The
 * server plugin reads the mirrored cookie so SSR and hydration agree.
 */
export default defineNuxtPlugin(() => {
  const preferences = useState<ViewPreferences>('view:preferences', defaultViewPreferences)
  const initialized = useState<boolean>('view:initialized', () => false)

  if (initialized.value) return

  const stored = window.localStorage.getItem(VIEW_PREFERENCES_STORAGE_KEY)
  if (stored !== null) {
    preferences.value = parseViewPreferences(stored)
  }

  // Ensure the cookie exists even on a first visit, so the next SSR request
  // already knows the defaults instead of re-deriving them.
  persist(preferences.value)

  watch(preferences, persist, { deep: true })
  initialized.value = true
})
