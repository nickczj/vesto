import { restoreSnapshotCache } from '~~/server/services/balance-sheet'

/**
 * Runs after `db-init.ts` (Nitro loads plugins in path order), so the
 * `app_settings` table exists by the time this reads it.
 *
 * Restoring is best-effort: a missing or corrupt cache must never stop the
 * server from starting.
 */
export default defineNitroPlugin(() => {
  try {
    restoreSnapshotCache()
  }
  catch (error) {
    console.warn('[vesto] failed to restore snapshot cache:', error)
  }
})
