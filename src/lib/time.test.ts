import { describe, expect, it } from 'vitest'
import { fromBerlinLocal, toBerlinLocal } from './time'

describe('Berliner Zeit', () => {
  it('Winterzeit (UTC+1)', () => {
    const d = fromBerlinLocal('2026-01-15T17:30')
    expect(d.toISOString()).toBe('2026-01-15T16:30:00.000Z')
    expect(toBerlinLocal(d)).toBe('2026-01-15T17:30')
  })
  it('Sommerzeit (UTC+2)', () => {
    const d = fromBerlinLocal('2026-07-01T21:00')
    expect(d.toISOString()).toBe('2026-07-01T19:00:00.000Z')
    expect(toBerlinLocal(d)).toBe('2026-07-01T21:00')
  })
  it('Tag der Zeitumstellung', () => {
    expect(fromBerlinLocal('2026-10-25T12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z')
    expect(fromBerlinLocal('2026-03-29T12:00').toISOString()).toBe('2026-03-29T10:00:00.000Z')
  })
})
