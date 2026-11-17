// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-04-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Vesto — Balance sheet',
      htmlAttrs: { lang: 'en' },
    },
  },
  // One owner for the theme. The module's inline head script sets the `dark`
  // class (for Nuxt UI) and `data-theme` (for main.css) before the first paint,
  // so a dark-mode reader never sees a light page flash by.
  colorMode: {
    preference: 'system',
    fallback: 'light',
    // The key the page has always used, so a saved choice carries over.
    storageKey: 'vesto:theme-mode',
    dataValue: 'theme',
  },
  runtimeConfig: {
    vestoGoBaseUrl: process.env.NUXT_VESTO_GO_BASE_URL || 'http://localhost:8080',
    databasePath: process.env.NUXT_DATABASE_PATH || './data/vesto-v2.db',
    authUser: process.env.NUXT_AUTH_USER || 'vesto',
    authPassword: process.env.NUXT_AUTH_PASSWORD || '',
    public: {
      appName: 'Vesto v2',
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  nitro: {
    experimental: {
      websocket: false,
    },
  },
})
