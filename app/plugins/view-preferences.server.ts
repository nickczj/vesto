import { getCookie } from 'h3'
import type { ViewPreferences } from '~/utils/view-preferences'
import { defaultViewPreferences, parseViewPreferences, VIEW_PREFERENCES_COOKIE } from '~/utils/view-preferences'

/**
 * Render the first paint with the same view preferences the browser will use.
 * localStorage is still the source of truth, but the client mirrors it into a
 * cookie so SSR does not have to guess and produce hydration mismatches.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const event = nuxtApp.ssrContext?.event
  if (!event) return

  const preferences = useState<ViewPreferences>('view:preferences', defaultViewPreferences)
  preferences.value = parseViewPreferences(getCookie(event, VIEW_PREFERENCES_COOKIE) || null)
})
