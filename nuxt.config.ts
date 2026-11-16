// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-04-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
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
