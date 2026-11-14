import { describe, expect, it } from 'vitest'
import type { Facility } from '../db/db'
import { bearing, destination, toPos } from '../lib/geo'
import { centerOf, checkAllStands, upwindLabelPos, windArrowGrid, windLetter } from './revierWind'

const B = { south: 52.51, west: 7.19, north: 52.53, east: 7.23 }
const C = centerOf(B)

function fac(id: string, type: string, p = C, extra: Partial<Facility> = {}): Facility {
  return { id, type, name: id, geometry: { type: 'Point', coordinates: toPos(p) }, notes: '', photoIds: [], createdAt: 0, updatedAt: 0, ...extra }
}

describe('Revier-Wind', () => {
  it('legt ein gleichmäßiges Pfeil-Raster über das Revier', () => {
    const pts = windArrowGrid(B)
    expect(pts.length).toBeGreaterThan(15)
    expect(pts.every((p) => p.lat > B.south && p.lat < B.north && p.lng > B.west && p.lng < B.east)).toBe(true)
  })

  it('setzt Pfeile nur innerhalb der Reviergrenze, wenn es eine gibt', () => {
    // Dreieck in der Westhälfte
    const ring = [
      { lat: B.south, lng: B.west },
      { lat: B.north, lng: B.west },
      { lat: C.lat, lng: C.lng },
      { lat: B.south, lng: B.west },
    ]
    const all = windArrowGrid(B)
    const inside = windArrowGrid(B, [ring])
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.length).toBeLessThan(all.length)
    expect(inside.every((p) => p.lng < C.lng)).toBe(true)
  })

  it('stellt das Kürzel auf die Seite, aus der der Wind kommt', () => {
    const p = upwindLabelPos(B, 270)
    expect(p.lng).toBeLessThan(B.west + 0.01)
    expect(Math.round(bearing(C, p))).toBe(270)
    expect(windLetter(270)).toBe('W')
    expect(windLetter(225)).toBe('SW')
  })

  it('prüft alle Sitze und sortiert geeignete zuerst', () => {
    // Sitz A blickt nach Osten, Sitz B nach Westen; Wind aus West
    const a = fac('A', 'hochsitz', destination(C, 0, 300), { bearing: 90, fieldWidth: 90 })
    const b = fac('B', 'hochsitz', destination(C, 180, 300), { bearing: 270, fieldWidth: 90 })
    // Kirrung östlich von A → Witterung von A zieht darüber
    const k = fac('K', 'kirrung', destination(destination(C, 0, 300), 90, 150))
    const rows = checkAllStands([a, b, k], 270, { length: 300, width: 40 })
    expect(rows.map((r) => r.stand.id)).toEqual(['B', 'A'])
    expect(rows[0].status).toBe('ok')
    expect(rows[1].status).toBe('warn')
    expect(rows[1].reason).toContain('Kirrung')
  })

  it('meldet Wind von hinten', () => {
    const s = fac('S', 'hochsitz', C, { bearing: 270, fieldWidth: 90 })
    const [r] = checkAllStands([s], 90, { length: 300, width: 40 })
    expect(r.status).toBe('warn')
    expect(r.reason).toContain('von hinten')
  })
})
