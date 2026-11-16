#!/usr/bin/env node
/**
 * Production dependency audit gate.
 *
 * Fails on high or critical advisories in production dependencies, except for
 * documented exceptions. Moderate/low findings are reported and left to
 * Dependabot, because Nuxt's build/runtime tree regularly carries a few.
 *
 * Run locally:
 *   node scripts/audit-gate.mjs
 */

import { execFileSync } from 'node:child_process'

/**
 * Dependency -> reason it is accepted despite a high/critical advisory.
 * Keep this list short. Every entry needs a concrete risk argument, not just
 * "no fix available".
 */
const ACCEPTED = new Map([
  [
    'xlsx',
    'write-only export of self-authored data; no untrusted workbooks are parsed (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)',
  ],
])

const BLOCKING_SEVERITIES = new Set(['critical', 'high'])

function readAudit() {
  try {
    return JSON.parse(
      execFileSync('npm', ['audit', '--omit=dev', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
  } catch (error) {
    // npm exits non-zero when advisories exist; stdout still holds the report.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '') {
      return JSON.parse(error.stdout)
    }
    console.error(error.stderr || error.message)
    process.exit(1)
  }
}

const report = readAudit()
const vulnerabilities = report.vulnerabilities ?? {}
const counts = report.metadata?.vulnerabilities ?? {}

const blocking = []
const accepted = []

for (const [name, item] of Object.entries(vulnerabilities)) {
  if (!BLOCKING_SEVERITIES.has(item.severity)) continue
  if (ACCEPTED.has(name)) {
    accepted.push([name, item])
    continue
  }
  blocking.push([name, item])
}

console.log(
  `production audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
    `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low`,
)

for (const [name, item] of accepted) {
  console.log(`ACCEPTED ${item.severity} ${name}: ${ACCEPTED.get(name)}`)
}

if (blocking.length === 0) {
  console.log('audit gate passed')
  process.exit(0)
}

console.error('audit gate failed:')
for (const [name, item] of blocking) {
  const direct = item.isDirect ? 'direct' : 'transitive'
  console.error(`  ${item.severity} ${name} (${direct}, range ${item.range || 'unknown'})`)
  for (const via of item.via ?? []) {
    if (typeof via === 'object' && via.url) {
      console.error(`    ${via.title || 'advisory'}: ${via.url}`)
    }
  }
}
process.exit(1)
