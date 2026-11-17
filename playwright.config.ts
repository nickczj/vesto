import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const baseURL = `http://127.0.0.1:${PORT}`
const AUTH_USER = 'vesto'
const AUTH_PASSWORD = 'e2e-password'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // `nuxt preview` is a production server, so auth fails closed without a
    // password. The suite runs against a throwaway one.
    httpCredentials: { username: AUTH_USER, password: AUTH_PASSWORD, send: 'always' },
  },
  webServer: {
    // The built server, not `nuxt preview`: preview changes the working
    // directory, and the startup migrator resolves `server/database/migrations`
    // from the cwd. The Docker image runs the entry directly for the same
    // reason, so this is also the shape that deploys.
    //
    // Production, not dev: the dev server does not hydrate cleanly against an
    // empty sheet, so the Add menu never opens.
    command: 'node .output/server/index.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(PORT),
      // The suite never reads the real database. A fresh file is created and
      // migrated on startup because the assertions are structural.
      NUXT_DATABASE_PATH: process.env.NUXT_DATABASE_PATH ?? './data/e2e.db',
      NUXT_AUTH_USER: AUTH_USER,
      NUXT_AUTH_PASSWORD: AUTH_PASSWORD,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
