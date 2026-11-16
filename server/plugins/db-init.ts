import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { useDb } from '~~/server/utils/db'

/**
 * The schema is defined once in `server/database/schema.ts`; the SQL in
 * `server/database/migrations` is generated from it by `npm run db:generate`.
 * Migrations run at startup so a deploy never serves a half-migrated database.
 */
export function migrationsFolder(): string {
  return resolve(process.cwd(), 'server/database/migrations')
}

export default defineNitroPlugin(() => {
  migrate(useDb(), {
    migrationsFolder: migrationsFolder(),
  })
})
