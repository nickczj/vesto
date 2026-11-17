#!/usr/bin/env node
/**
 * Daily valuation snapshot for the Vesto portfolio.
 *
 * The app owns the valuation logic. This sidecar only asks the authenticated
 * `POST /api/snapshots` endpoint to capture the same balance sheet the page
 * shows, once per SGT day. It runs at 08:00 SGT (after the US close, before SGX
 * opens), retries while the app or a provider is unavailable, and catches up on
 * startup if today's row is missing or incomplete — but only once the cut-off
 * has passed, because a row captured earlier holds intraday prices and a
 * complete row is never replaced.
 *
 * Usage:
 *   node scripts/valuation-snapshot.mjs --once
 *   node scripts/valuation-snapshot.mjs --watch
 *
 * Env:
 *   SNAPSHOT_APP_URL             default http://vesto-v2:3000
 *   SNAPSHOT_HOUR_SGT            default 8
 *   SNAPSHOT_RETRY_MINUTES       default 120 (watch mode)
 *   SNAPSHOT_RETRY_INTERVAL_SECS default 600
 *   SNAPSHOT_REQUEST_TIMEOUT_SECS default 30
 *   NUXT_AUTH_USER               Basic auth user
 *   NUXT_AUTH_PASSWORD           Basic auth password
 */

import { hasReachedCutoff, nextRunAt, sgtDateKey } from './snapshot-schedule.mjs'

const appUrl = (process.env.SNAPSHOT_APP_URL || 'http://vesto-v2:3000').replace(/\/$/, '')
const hourSgt = Math.min(23, Math.max(0, Number(process.env.SNAPSHOT_HOUR_SGT || 8)))
const retryMinutes = Math.max(0, Number(process.env.SNAPSHOT_RETRY_MINUTES || 120))
const retryIntervalMs = Math.max(30, Number(process.env.SNAPSHOT_RETRY_INTERVAL_SECS || 600)) * 1000
const requestTimeoutMs = Math.max(5, Number(process.env.SNAPSHOT_REQUEST_TIMEOUT_SECS || 30)) * 1000
const authUser = process.env.NUXT_AUTH_USER || ''
const authPassword = process.env.NUXT_AUTH_PASSWORD || ''
const watch = process.argv.includes('--watch')
const once = process.argv.includes('--once') || !watch

function log(message) {
  console.log(`[snapshot] ${new Date().toISOString()} ${message}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

function authHeaders() {
  const headers = { accept: 'application/json' }
  if (authUser && authPassword) {
    headers.authorization = `Basic ${Buffer.from(`${authUser}:${authPassword}`).toString('base64')}`
  }
  return headers
}

async function postSnapshot() {
  const response = await fetch(`${appUrl}/api/snapshots`, {
    method: 'POST',
    headers: authHeaders(),
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  const body = await response.text()

  if (!response.ok) {
    const error = new Error(`snapshot failed: ${response.status} ${body.slice(0, 300)}`)
    error.statusCode = response.status
    error.fatal = response.status === 400 || response.status === 401 || response.status === 403
    throw error
  }

  try {
    return JSON.parse(body)
  }
  catch {
    throw new Error(`snapshot returned a non-JSON body: ${body.slice(0, 300)}`)
  }
}

/**
 * Try until a complete day is recorded or the deadline passes. An incomplete
 * day is still written by the app; retrying gives it a chance to become
 * complete before the deadline.
 */
async function captureUntil(deadline, label) {
  log(`${label}: capturing ${sgtDateKey()} SGT (deadline ${new Date(deadline).toISOString()})`)

  for (;;) {
    try {
      const payload = await postSnapshot()
      const point = payload.point
      log(`snapshot ${payload.status} for ${point.asOfDate} (complete=${point.isComplete}, unpriced=${point.unpriced})`)

      if (point.isComplete) return true
      if (Date.now() >= deadline) {
        log('deadline reached with an incomplete day; it stays recorded and excluded from the chart')
        return false
      }
    }
    catch (error) {
      if (error.fatal) {
        log(`fatal: ${error.message}`)
        throw error
      }

      log(`attempt failed: ${error.message}`)
      if (Date.now() >= deadline) {
        log('deadline reached without a snapshot')
        return false
      }
    }

    const waitMs = Math.min(retryIntervalMs, Math.max(0, deadline - Date.now()))
    log(`retrying in ${Math.round(waitMs / 1000)}s`)
    await sleep(waitMs)
  }
}

async function main() {
  if (!authUser || !authPassword) {
    log('warning: NUXT_AUTH_USER/NUXT_AUTH_PASSWORD are empty; production will reject the request')
  }

  if (once) {
    const complete = await captureUntil(Date.now() + retryMinutes * 60_000, 'once')
    process.exitCode = complete ? 0 : 1
    return
  }

  log(`watching: daily at ${hourSgt}:00 SGT, retrying up to ${retryMinutes}m every ${retryIntervalMs / 1000}s`)

  // Catch up on a restart, but never before today's cut-off. A row captured
  // mid-session is complete (every row is priced), so the scheduled run would
  // see a complete day and leave it frozen at the wrong point. A restart after
  // the cut-off still catches up within the full retry window.
  if (hasReachedCutoff(new Date(), hourSgt)) {
    await captureUntil(Date.now() + retryMinutes * 60_000, 'startup')
  }
  else {
    log(`startup: holding until ${hourSgt}:00 SGT (a capture now would freeze intraday prices)`)
  }

  for (;;) {
    const next = nextRunAt(new Date(), hourSgt)
    log(`next run at ${next.toISOString()} (${sgtDateKey(next)} ${hourSgt}:00 SGT)`)
    await sleep(next.getTime() - Date.now())
    await captureUntil(Date.now() + retryMinutes * 60_000, 'scheduled')
  }
}

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    log(`received ${signal}; exiting`)
    process.exit(0)
  })
}

main().catch((error) => {
  log(`fatal: ${error?.stack || error}`)
  process.exitCode = 1
})
