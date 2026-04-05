export type ThemeMode = 'light' | 'dark'

export function useThemeMode() {
  const mode = useState<ThemeMode>('theme:mode', () => 'light')
  const isDark = computed(() => mode.value === 'dark')

  function toggleTheme() {
    mode.value = isDark.value ? 'light' : 'dark'
  }

  return {
    mode,
    isDark,
    toggleTheme,
  }
}
