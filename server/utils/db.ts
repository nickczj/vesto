import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '~~/server/database/schema'

type DbInstance = BetterSQLite3Database<typeof schema>

type GlobalDbState = {
  sqlite?: Database.Database
  drizzle?: DbInstance
}

const globalState = globalThis as typeof globalThis & {
  __vestoV2DbState?: GlobalDbState
}

function getState(): GlobalDbState {
  if (!globalState.__vestoV2DbState) {
    globalState.__vestoV2DbState = {}
  }
  return globalState.__vestoV2DbState
}

function resolveDatabasePath(): string {
  const config = useRuntimeConfig()
  const configuredPath = String(config.databasePath || './data/vesto-v2.db').trim()

  if (configuredPath.startsWith('/')) {
    return configuredPath
  }

  return resolve(process.cwd(), configuredPath)
}

export function useDb(): DbInstance {
  const state = getState()
  if (state.drizzle) {
    return state.drizzle
  }

  const dbPath = resolveDatabasePath()
  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  state.sqlite = sqlite
  state.drizzle = drizzle(sqlite, { schema })
  return state.drizzle
}

export function useSqlite(): Database.Database {
  const state = getState()
  if (state.sqlite) {
    return state.sqlite
  }

  useDb()
  return getState().sqlite as Database.Database
}
