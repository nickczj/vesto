#!/usr/bin/env node
/**
 * Consistent SQLite snapshots for the Vesto portfolio database.
 *
 * The app runs SQLite in WAL mode, so copying `vesto-v2.db` alone can produce
 * an empty or stale file: recent writes live in `vesto-v2.db-wal` until a
 * checkpoint. better-sqlite3's `backup()` uses SQLite's online backup API, which
 * produces a single consistent file while the app keeps writing.
 *
 * Usage:
 *   node scripts/backup-db.mjs --once
 *   node scripts/backup-db.mjs --watch
 *
 * Env:
 *   BACKUP_DATABASE_PATH   default /data/vesto-v2.db
 *   BACKUP_DIR             default /backups
 *   BACKUP_RETENTION_DAYS  default 14
 *   BACKUP_INTERVAL_SECS   default 86400 (watch mode)
 */

import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const databasePath = process.env.BACKUP_DATABASE_PATH || '/data/vesto-v2.db'
const backupDir = process.env.BACKUP_DIR || '/backups'
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14))
const intervalSeconds = Math.max(60, Number(process.env.BACKUP_INTERVAL_SECS || 86400))
const watch = process.argv.includes('--watch')

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function log(message) {
  console.log(`[backup] ${new Date().toISOString()} ${message}`)
}

function prune() {
  const cutoff = Date.now() - retentionDays * 86_400_000
  let removed = 0

  for (const name of readdirSync(backupDir)) {
    if (!name.startsWith('vesto-v2-')) continue
    if (!name.endsWith('.db') && !name.endsWith('.db-wal') && !name.endsWith('.db-shm')) continue

    const path = join(backupDir, name)
    if (statSync(path).mtimeMs >= cutoff) continue

    unlinkSync(path)
    removed += 1
  }

  if (removed > 0) {
    log(`pruned ${removed} file(s) older than ${retentionDays} day(s)`)
  }
}

/**
 * Turn the snapshot into a single self-contained file. Without this the copy
 * keeps WAL journal mode and opening it creates `-wal`/`-shm` sidecars.
 */
function finalize(path) {
  const db = new Database(path)
  try {
    db.pragma('journal_mode = DELETE')
    db.pragma('wal_checkpoint(TRUNCATE)')
  }
  finally {
    db.close()
  }

  for (const suffix of ['-wal', '-shm']) {
    try {
      unlinkSync(path + suffix)
    }
    catch {
      // Already removed by the checkpoint.
    }
  }
}

function verify(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') {
      throw new Error(`integrity_check failed: ${integrity}`)
    }

    const count = (table) => {
      try {
        return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
      }
      catch {
        return null
      }
    }

    return {
      assets: count('asset_entries'),
      liabilities: count('liability_entries'),
    }
  }
  finally {
    db.close()
  }
}

async function backupOnce() {
  if (!backupDir || !databasePath) {
    throw new Error('BACKUP_DIR and BACKUP_DATABASE_PATH are required')
  }

  mkdirSync(backupDir, { recursive: true })

  const destination = join(backupDir, `vesto-v2-${timestamp()}.db`)
  const db = new Database(databasePath, { readonly: true, fileMustExist: true })

  try {
    await db.backup(destination)
  }
  finally {
    db.close()
  }

  finalize(destination)

  const stats = verify(destination)
  log(`wrote ${destination} (assets=${stats.assets ?? '?'} liabilities=${stats.liabilities ?? '?'})`)
  prune()
}

async function main() {
  if (!watch) {
    await backupOnce()
    return
  }

  log(`watching: every ${intervalSeconds}s, keeping ${retentionDays} day(s)`)
  for (;;) {
    try {
      await backupOnce()
    }
    catch (error) {
      console.error(`[backup] ${new Date().toISOString()} backup failed:`, error)
    }

    await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000))
  }
}

main().catch((error) => {
  console.error('[backup] fatal:', error)
  process.exitCode = 1
})
