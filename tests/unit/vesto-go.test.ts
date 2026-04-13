import { describe, expect, it } from 'vitest'
import { normalizeVestoGoBaseUrl } from '~~/server/utils/vesto-go'

describe('vesto-go base URL normalization', () => {
  it('rewrites the Docker service hostname to localhost for host-side runtimes', () => {
    expect(normalizeVestoGoBaseUrl('http://vesto-api:8080', false)).toBe('http://127.0.0.1:8080')
  })

  it('keeps the Docker service hostname when running inside Docker', () => {
    expect(normalizeVestoGoBaseUrl('http://vesto-api:8080', true)).toBe('http://vesto-api:8080')
  })

  it('leaves other hostnames unchanged', () => {
    expect(normalizeVestoGoBaseUrl('http://localhost:8080', false)).toBe('http://localhost:8080')
  })
})
