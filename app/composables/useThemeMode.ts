/**
 * The theme belongs to the colour-mode module, which applies it before the
 * first paint. This is the small surface the page needs on top of it.
 */
export function useThemeMode() {
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')

  function toggleTheme() {
    colorMode.preference = isDark.value ? 'light' : 'dark'
  }

  return {
    isDark,
    toggleTheme,
  }
}
