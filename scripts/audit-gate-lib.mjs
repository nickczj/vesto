/**
 * Pure helpers for the production audit gate.
 *
 * npm reports one entry per vulnerable **package**. A single advisory on a
 * deeply shared dependency (for example `picomatch` under Nuxt's build tree)
 * marks every package that inherits it, so a package-level count turns one
 * finding into dozens and makes the gate unreadable. This module collapses the
 * report back to unique advisories and keeps exceptions scoped to a GHSA with a
 * reason and a review date.
 *
 * The CLI wrapper lives in `audit-gate.mjs`; the unit tests import this module.
 */

const BLOCKING_SEVERITIES = new Set(['critical', 'high'])
const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3 }

/**
 * Accepted advisories, keyed by GHSA id.
 *
 * Every entry needs a concrete risk argument, not just "no fix available", and
 * a review date. The weekly Security run keeps reporting the full audit, so an
 * exception is a deliberate decision, not a way to hide the finding.
 */
export const ACCEPTED_ADVISORIES = new Map([
  [
    'GHSA-4r6h-8v6p-xvw6',
    {
      package: 'xlsx',
      reason: 'write-only export of self-authored data; no untrusted workbooks are parsed',
      reviewAfter: '2027-05-18',
    },
  ],
  [
    'GHSA-5pgg-2g8v-p4x9',
    {
      package: 'xlsx',
      reason: 'write-only export of self-authored data; no untrusted workbooks are parsed',
      reviewAfter: '2027-05-18',
    },
  ],
  [
    'GHSA-fc5q-39xc-vjpf',
    {
      package: 'picomatch',
      reason: 'build/router glob matching only; no user-supplied patterns; not in the built server or client bundle; no patched version exists (4.0.7 is latest)',
      reviewAfter: '2027-02-18',
    },
  ],
])

function ghsaId(url) {
  const match = /GHSA-[a-z0-9-]+/i.exec(url ?? '')
  return match ? match[0].toLowerCase() : null
}

function displayId(id) {
  return id.replace(/^ghsa-/i, 'GHSA-')
}

/** Every package that transitively depends on `root`, including root itself. */
function affectedPackages(root, vulnerabilities) {
  const affected = new Set([root])
  const queue = [root]

  while (queue.length > 0) {
    const name = queue.pop()
    for (const parent of vulnerabilities[name]?.effects ?? []) {
      if (!affected.has(parent)) {
        affected.add(parent)
        queue.push(parent)
      }
    }
  }

  return [...affected].sort()
}

function compareAdvisories(a, b) {
  const severity = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  if (severity !== 0) return severity
  return a.package.localeCompare(b.package)
}

/**
 * Collapse npm's package-level report into unique advisories.
 *
 * The advisory objects live in each package's `via` array. Parent packages have
 * string entries in `via`; they are counted through `effects` instead, so one
 * advisory is one row with an affected-package count.
 */
export function collectAdvisories(report) {
  const vulnerabilities = report?.vulnerabilities ?? {}
  const advisories = new Map()

  for (const [name, item] of Object.entries(vulnerabilities)) {
    for (const via of item.via ?? []) {
      if (typeof via !== 'object' || via === null) continue

      const id = ghsaId(via.url) ?? `npm:${via.source ?? name}`
      if (advisories.has(id)) continue

      const root = via.name ?? name
      advisories.set(id, {
        id,
        package: root,
        title: via.title ?? 'advisory',
        severity: via.severity ?? item.severity,
        range: via.range ?? item.range,
        url: via.url ?? null,
        source: via.source ?? null,
        affectedPackages: affectedPackages(root, vulnerabilities),
      })
    }
  }

  return [...advisories.values()].sort(compareAdvisories)
}

function isExpired(reviewAfter, today) {
  if (!reviewAfter) return false
  return today.toISOString().slice(0, 10) > reviewAfter
}

/**
 * Evaluate the report against the accepted list.
 *
 * `today` is injectable so tests can exercise expiry without freezing time.
 */
export function evaluateAudit(report, options = {}) {
  const acceptedMap = new Map(
    [...(options.accepted ?? ACCEPTED_ADVISORIES)].map(([id, value]) => [id.toLowerCase(), value]),
  )
  const today = options.today ?? new Date()
  const vulnerabilities = report?.vulnerabilities ?? {}
  const advisories = collectAdvisories(report)

  const accepted = []
  const blocking = []
  const expired = []
  const stale = []

  for (const advisory of advisories) {
    const exception = acceptedMap.get(advisory.id)

    if (!exception) {
      if (BLOCKING_SEVERITIES.has(advisory.severity)) blocking.push(advisory)
      continue
    }

    if (isExpired(exception.reviewAfter, today)) {
      expired.push({ ...advisory, exception })
    }
    else {
      accepted.push({ ...advisory, exception })
    }
  }

  for (const [id, exception] of acceptedMap) {
    if (!advisories.some(advisory => advisory.id === id)) {
      stale.push({ id, exception })
    }
  }

  const counts = { critical: 0, high: 0, moderate: 0, low: 0 }
  for (const advisory of advisories) {
    counts[advisory.severity] = (counts[advisory.severity] ?? 0) + 1
  }

  return {
    advisories,
    packages: Object.keys(vulnerabilities).length,
    counts,
    accepted,
    blocking,
    expired,
    stale,
  }
}

function formatCounts(counts) {
  return ['critical', 'high', 'moderate', 'low']
    .filter(severity => (counts[severity] ?? 0) > 0)
    .map(severity => `${counts[severity]} ${severity}`)
    .join(', ') || 'none'
}

function formatAdvisory(advisory, prefix = '  ') {
  const affected = advisory.affectedPackages.length
  const lines = [
    `${prefix}${advisory.severity.toUpperCase().padEnd(8)} ${advisory.package} ${advisory.range}`,
    `${prefix}         ${affected} dependent package${affected === 1 ? '' : 's'} · ${displayId(advisory.id)}`,
    `${prefix}         ${advisory.title}`,
  ]

  if (advisory.url) lines.push(`${prefix}         ${advisory.url}`)

  return lines.join('\n')
}

/** Human-readable summary for CI logs. */
export function formatReport(result) {
  const total = result.advisories.length
  const lines = [
    `production audit: ${total} advisor${total === 1 ? 'y' : 'ies'} `
      + `(${formatCounts(result.counts)}) across ${result.packages} packages`,
  ]

  for (const advisory of result.advisories) {
    lines.push(formatAdvisory(advisory))
  }

  for (const { id, exception } of result.accepted) {
    lines.push(`ACCEPTED ${exception.package} (${displayId(id)}): ${exception.reason}`)
    lines.push(`         review by ${exception.reviewAfter}`)
  }

  for (const { id, exception } of result.stale) {
    lines.push(`STALE acceptance ${displayId(id)}: no longer reported; remove it from ACCEPTED_ADVISORIES`)
    lines.push(`         was accepted for ${exception.package}`)
  }

  if (result.expired.length > 0) {
    lines.push('audit gate failed:')
    for (const { id, exception } of result.expired) {
      lines.push(`  EXPIRED acceptance ${displayId(id)}: review by ${exception.reviewAfter} has passed`)
    }
  }

  if (result.blocking.length > 0) {
    lines.push('audit gate failed:')
    for (const advisory of result.blocking) {
      lines.push(`  ${advisory.package} ${displayId(advisory.id)} (${advisory.affectedPackages.length} dependent packages)`)
    }
  }

  if (result.expired.length === 0 && result.blocking.length === 0) {
    lines.push('audit gate passed')
  }

  return lines.join('\n')
}
