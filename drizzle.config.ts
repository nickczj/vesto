import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dbCredentials: {
    // Used by `drizzle-kit migrate` when testing a copy of the database.
    url: process.env.MIGRATION_DB_PATH || './data/vesto-v2.db',
  },
})
