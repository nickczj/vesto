#!/usr/bin/env node
/**
 * Production dependency audit gate.
 *
 * Runs `npm audit --omit=dev` and blocks on unique high/critical **advisories**,
 * not on every package that inherits them. See `audit-gate-lib.mjs` for the
 * exception list and the collapse logic.
 *
 * Run locally:
 *   node scripts/audit-gate.mjs
 */

import { execFileSync } from 'node:child_process'
import { evaluateAudit, formatReport } from './audit-gate-lib.mjs'

function readAudit() {
  try {
    return JSON.parse(
      execFileSync('npm', ['audit', '--omit=dev', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
  }
  catch (error) {
    // npm exits non-zero when advisories exist; stdout still holds the report.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') {
      return JSON.parse(error.stdout)
    }
    console.error(error.stderr || error.message)
    process.exit(1)
  }
}

const report = readAudit()
const result = evaluateAudit(report)

console.log(formatReport(result))

if (result.blocking.length > 0 || result.expired.length > 0) {
  process.exit(1)
}
