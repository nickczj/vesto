import type { ThemeMode } from '~/composables/useThemeMode'

const THEME_STORAGE_KEY = 'vesto:theme-mode'

function parseThemeMode(value: string | null): ThemeMode | null {
  if (value === 'light' || value === 'dark') return value
  return null
}

function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement
  root.dataset.theme = mode
  root.classList.toggle('dark', mode === 'dark')
}

export default defineNuxtPlugin(() => {
  const mode = useState<ThemeMode>('theme:mode', () => 'light')
  const initialized = useState<boolean>('theme:initialized', () => false)

  if (initialized.value) return

  const storedMode = parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY))
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  mode.value = storedMode ?? (prefersDark ? 'dark' : 'light')
  applyThemeMode(mode.value)

  watch(mode, (nextMode) => {
    applyThemeMode(nextMode)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode)
  })

  initialized.value = true
})
