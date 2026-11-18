import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_ADVISORIES,
  collectAdvisories,
  evaluateAudit,
  formatReport,
} from '../../scripts/audit-gate-lib.mjs'

const PICOMATCH = 'ghsa-fc5q-39xc-vjpf'
const XLSX_PROTOTYPE = 'ghsa-4r6h-8v6p-xvw6'
const XLSX_REDOS = 'ghsa-5pgg-2g8v-p4x9'
const MINIMATCH = 'ghsa-g3hv-75wg-m249'
const ESBUILD = 'ghsa-g7r4-m6w7-qqqr'
const NEW_HIGH = 'ghsa-new0-0000-0000'

function advisory(overrides: Record<string, unknown> = {}) {
  return {
    source: 1,
    name: 'picomatch',
    dependency: 'picomatch',
    title: 'advisory',
    url: `https://github.com/advisories/${PICOMATCH}`,
    severity: 'high',
    range: '<=4.0.7',
    ...overrides,
  }
}

function pkg(overrides: Record<string, unknown> = {}) {
  return {
    name: 'package',
    severity: 'high',
    isDirect: false,
    via: [],
    effects: [],
    range: '*',
    nodes: [],
    fixAvailable: false,
    ...overrides,
  }
}

function report(vulnerabilities: Record<string, unknown>) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: {} },
  }
}

function baseVulnerabilities(extra: Record<string, unknown> = {}) {
  return {
    picomatch: pkg({
      name: 'picomatch',
      via: [advisory({ name: 'picomatch' })],
      effects: ['nuxt'],
    }),
    nuxt: pkg({
      name: 'nuxt',
      via: ['picomatch'],
      effects: [],
    }),
    xlsx: pkg({
      name: 'xlsx',
      via: [
        advisory({ source: 2, name: 'xlsx', title: 'Prototype pollution', url: `https://github.com/advisories/${XLSX_PROTOTYPE}`, range: '<0.19.3' }),
        advisory({ source: 3, name: 'xlsx', title: 'ReDoS', url: `https://github.com/advisories/${XLSX_REDOS}`, range: '<0.20.2' }),
      ],
      effects: [],
    }),
    minimatch: pkg({
      name: 'minimatch',
      severity: 'moderate',
      via: [advisory({ source: 4, name: 'minimatch', title: 'DoS', severity: 'moderate', url: `https://github.com/advisories/${MINIMATCH}`, range: '>=7 <11.0.1' })],
      effects: [],
    }),
    esbuild: pkg({
      name: 'esbuild',
      severity: 'low',
      via: [advisory({ source: 5, name: 'esbuild', title: 'Windows dev server', severity: 'low', url: `https://github.com/advisories/${ESBUILD}`, range: '>=0.27.3 <0.28.1' })],
      effects: [],
    }),
    ...extra,
  }
}

const TODAY = new Date('2026-11-18T00:00:00Z')

describe('audit gate advisories', () => {
  it('collapses a dependent-package chain into one advisory', () => {
    const vulnerabilities: Record<string, any> = {
      picomatch: pkg({ name: 'picomatch', via: [advisory()], effects: ['parent-0'] }),
    }

    for (let index = 0; index < 50; index++) {
      const name = `parent-${index}`
      vulnerabilities[name] = pkg({
        name,
        via: [index === 0 ? 'picomatch' : `parent-${index - 1}`],
        effects: index < 49 ? [`parent-${index + 1}`] : [],
      })
    }

    const advisories = collectAdvisories(report(vulnerabilities))

    expect(advisories).toHaveLength(1)
    expect(advisories[0]?.package).toBe('picomatch')
    expect(advisories[0]?.affectedPackages).toHaveLength(51)
  })

  it('passes when every high advisory has an accepted exception', () => {
    const result = evaluateAudit(report(baseVulnerabilities()), { today: TODAY })

    expect(result.counts).toEqual({ critical: 0, high: 3, moderate: 1, low: 1 })
    expect(result.blocking).toEqual([])
    expect(result.expired).toEqual([])
    expect(result.accepted.map(item => item.id)).toEqual([PICOMATCH, XLSX_PROTOTYPE, XLSX_REDOS])
    expect(formatReport(result)).toContain('audit gate passed')
  })

  it('blocks a new high advisory that has no exception', () => {
    const vulnerabilities = baseVulnerabilities({
      newpkg: pkg({
        name: 'newpkg',
        via: [advisory({ name: 'newpkg', title: 'New high finding', url: `https://github.com/advisories/${NEW_HIGH}` })],
      }),
    })
    const result = evaluateAudit(report(vulnerabilities), { today: TODAY })

    expect(result.blocking.map(item => item.package)).toEqual(['newpkg'])
    expect(formatReport(result)).toContain('audit gate failed')
    expect(formatReport(result)).toContain('newpkg')
  })

  it('reports moderate and low advisories without blocking', () => {
    const result = evaluateAudit(report({
      minimatch: pkg({
        name: 'minimatch',
        severity: 'moderate',
        via: [advisory({ name: 'minimatch', severity: 'moderate', url: `https://github.com/advisories/${MINIMATCH}` })],
      }),
      esbuild: pkg({
        name: 'esbuild',
        severity: 'low',
        via: [advisory({ name: 'esbuild', severity: 'low', url: `https://github.com/advisories/${ESBUILD}` })],
      }),
    }), { today: TODAY })

    expect(result.blocking).toEqual([])
    expect(result.counts).toEqual({ critical: 0, high: 0, moderate: 1, low: 1 })
    expect(formatReport(result)).toContain('audit gate passed')
  })

  it('fails when an accepted advisory passes its review date', () => {
    const accepted = new Map(ACCEPTED_ADVISORIES)
    accepted.set(PICOMATCH, {
      package: 'picomatch',
      reason: 'test',
      reviewAfter: '2026-01-01',
    })

    const result = evaluateAudit(report(baseVulnerabilities()), { accepted, today: TODAY })

    expect(result.expired.map(item => item.id)).toEqual([PICOMATCH])
    expect(result.blocking).toEqual([])
    expect(formatReport(result)).toContain('EXPIRED acceptance')
  })

  it('warns about a stale exception without failing', () => {
    const accepted = new Map(ACCEPTED_ADVISORIES)
    accepted.set('GHSA-stale-0000-0000', {
      package: 'stale',
      reason: 'test',
      reviewAfter: '2027-01-01',
    })

    const result = evaluateAudit(report(baseVulnerabilities()), { accepted, today: TODAY })

    expect(result.stale.map(item => item.id)).toEqual(['ghsa-stale-0000-0000'])
    expect(formatReport(result)).toContain('STALE acceptance')
    expect(formatReport(result)).toContain('audit gate passed')
  })
})
