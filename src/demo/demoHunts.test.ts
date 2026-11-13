import { describe, expect, it } from 'vitest'
import { huntStats } from '../domain/assistant'
import { buildDemoFacilities } from './demoRevier'
import { buildDemoHunts } from './demoHunts'

describe('Test-Ansitze', () => {
  const facs = buildDemoFacilities()
  const now = Date.UTC(2026, 10, 13, 12)
  const { hunts, sightings } = buildDemoHunts(facs, now)

  it('erzeugt rund 40 abgeschlossene Ansitze, alle als Testdaten markiert', () => {
    expect(hunts.length).toBeGreaterThanOrEqual(35)
    expect(hunts.length).toBeLessThanOrEqual(42)
    expect(hunts.every((h) => h.demo && h.status === 'done' && h.end! <= now && h.env?.weather)).toBe(true)
    expect(sightings.every((s) => s.demo && hunts.some((h) => h.id === s.huntId))).toBe(true)
  })

  it('gehört zu den Sitzen des Beispielreviers', () => {
    const ids = new Set(facs.map((f) => f.id))
    expect(hunts.every((h) => h.standId && ids.has(h.standId))).toBe(true)
  })

  it('enthält Erfolge und Fehlansitze', () => {
    const rows = huntStats(hunts, sightings, null, 'sitz', facs)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    expect(hunts.some((h) => h.kills.length)).toBe(true)
    expect(hunts.some((h) => !sightings.some((s) => s.huntId === h.id))).toBe(true)
  })
})
