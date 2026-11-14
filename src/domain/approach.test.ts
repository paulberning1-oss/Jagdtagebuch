import { describe, expect, it } from 'vitest'
import type { Facility } from '../db/db'
import { destination, distance, toPos, type LatLng } from '../lib/geo'
import { attachToStand, checkRoute, checkRoutes, samplePath } from './approach'

const STAND: LatLng = { lat: 52.52, lng: 7.21 }
const P = (bearingDeg: number, m: number) => destination(STAND, bearingDeg, m)

function fac(id: string, type: string, geometry: Facility['geometry'], extra: Partial<Facility> = {}): Facility {
  return { id, type, name: id, geometry, notes: '', photoIds: [], createdAt: 0, updatedAt: 0, ...extra }
}
const point = (p: LatLng) => ({ type: 'Point' as const, coordinates: toPos(p) })
const line = (...pts: LatLng[]) => ({ type: 'LineString' as const, coordinates: pts.map(toPos) })

// Sitz blickt nach Norden (Schussfeld 315°–45°, 150 m)
const stand = fac('sitz', 'hochsitz', point(STAND), { bearing: 0, fieldWidth: 90, fieldRange: 150 })
// Kirrung 250 m östlich und 100 m südlich vom Sitz – also 100 m südlich des Wegs von Osten
const kirrung = fac('kirrung', 'kirrung', point(destination(P(90, 250), 180, 100)))
// Weg A kommt von Süden gerade auf den Sitz zu
const wegSued = fac('sued', 'anmarsch', line(P(180, 400), P(180, 200), STAND), { standId: 'sitz', name: 'Von Süden' })
// Weg B kommt von Osten – an der Kirrung vorbei
const wegOst = fac('ost', 'anmarsch', line(P(90, 400), P(90, 150), STAND), { standId: 'sitz', name: 'Von Osten' })
const opts = { length: 300, width: 40 }

describe('Anmarschweg', () => {
  it('tastet den Weg in gleichen Abständen ab', () => {
    const s = samplePath([P(180, 100), STAND], 25)
    expect(s[0].atM).toBe(0)
    expect(s[s.length - 1].atM).toBeCloseTo(100, 0)
    expect(s.length).toBe(5)
  })

  it('warnt, wenn die Witterung vom Weg über die Kirrung zieht', () => {
    // Wind aus Norden → Witterung zieht nach Süden. Vom Weg von Osten aus genau über die Kirrung
    const c = checkRoute(wegOst, stand, 0, [stand, kirrung, wegOst, wegSued], opts)
    const hit = c.hits.find((h) => h.facilityId === 'kirrung')
    expect(hit?.severity).toBe('warn')
    // Die Kirrung liegt bei 250 m Ost → der Weg (Start 400 m Ost) ist dort nach ca. 150 m
    expect(hit!.atM).toBeGreaterThan(100)
    expect(hit!.atM).toBeLessThan(200)
  })

  it('warnt, wenn Witterung vom Weg ins Schussfeld zieht', () => {
    // Wind aus Süden, Weg von Süden: Witterung zieht genau nach Norden ins Schussfeld
    const c = checkRoute(wegSued, stand, 180, [stand, wegSued], opts)
    expect(c.hits.some((h) => h.text.includes('Schussfeld'))).toBe(true)
  })

  it('empfiehlt den Weg mit den wenigsten Warnungen', () => {
    // Wind aus Norden: Weg von Süden bleibt sauber (Witterung zieht vom Revier weg nach Süden),
    // Weg von Osten trägt die Witterung über die Kirrung
    const checks = checkRoutes(stand, 0, [stand, kirrung, wegOst, wegSued], opts)
    expect(checks.map((c) => c.route.id)).toEqual(['sued', 'ost'])
    expect(checks[0].hits).toHaveLength(0)
    expect(checks[0].score).toBeLessThan(checks[1].score)
  })

  it('erkennt das Kreuzen eines Wechsels unabhängig vom Wind', () => {
    const wechsel = fac('wechsel', 'wechsel', line(P(200, 300), P(160, 300)))
    const c = checkRoute(wegSued, stand, 0, [stand, wechsel, wegSued], opts)
    const hit = c.hits.find((h) => h.facilityId === 'wechsel' && h.text.includes('kreuzt'))
    expect(hit).toBeDefined()
    expect(hit!.atM).toBeGreaterThan(50)
    expect(hit!.atM).toBeLessThan(150)
  })

  it('erkennt einen Weg durch eine Dickung', () => {
    const dickung = fac('dickung', 'dickung', { type: 'Polygon', coordinates: [[P(170, 250), P(190, 250), P(190, 350), P(170, 350), P(170, 250)].map(toPos)] })
    const c = checkRoute(wegSued, stand, 0, [stand, dickung, wegSued], opts)
    expect(c.hits.some((h) => h.facilityId === 'dickung' && h.text.includes('durch'))).toBe(true)
  })

  it('hängt den Sitz als letzten Punkt an', () => {
    const pts = attachToStand([P(180, 300), P(180, 100)], STAND)
    expect(distance(pts[pts.length - 1], STAND)).toBeLessThan(1)
    expect(attachToStand([P(180, 300), P(180, 5)], STAND).length).toBe(2)
  })
})
