import { rmSync } from 'node:fs'

declare global {
  var __TEST_RUNTIME_CONFIG: {
    databasePath: string
    vestoGoBaseUrl: string
    vestoV1DbPath: string
  }
}

globalThis.__TEST_RUNTIME_CONFIG = {
  databasePath: '/tmp/vesto-v2-default-test.db',
  vestoGoBaseUrl: 'http://localhost:8080',
  vestoV1DbPath: '/tmp/vesto-v1.db',
}

globalThis.useRuntimeConfig = () => globalThis.__TEST_RUNTIME_CONFIG

globalThis.createError = ({ statusCode, message }: { statusCode: number, message: string }) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

globalThis.defineNitroPlugin = (fn: (...args: unknown[]) => unknown) => fn

export function resetTestDatabase(path: string) {
  rmSync(path, { force: true })
  const state = globalThis as typeof globalThis & {
    __vestoV2DbState?: { sqlite?: { close: () => void } }
  }

  if (state.__vestoV2DbState?.sqlite) {
    state.__vestoV2DbState.sqlite.close()
  }

  delete state.__vestoV2DbState
}
