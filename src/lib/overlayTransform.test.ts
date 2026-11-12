import { describe, expect, it } from 'vitest'
import { distance, fromXY, type LatLng } from './geo'
import { centerOf, dragCorner, rectifyCorners } from './overlayTransform'

const o = { lat: 52.64, lng: 10.3 }
/** Rechteck 400 × 300 m (oben links, oben rechts, unten rechts, unten links) */
const rect: LatLng[] = [
  fromXY(o, { x: -200, y: 150 }),
  fromXY(o, { x: 200, y: 150 }),
  fromXY(o, { x: 200, y: -150 }),
  fromXY(o, { x: -200, y: -150 }),
]
const w = (c: LatLng[]) => distance(c[0], c[1])
const h = (c: LatLng[]) => distance(c[1], c[2])
const diag = (c: LatLng[]) => distance(c[0], c[2])

describe('Foto ohne Verzerrung ändern', () => {
  it('Größe: doppelt so groß, Seitenverhältnis bleibt', () => {
    const c = dragCorner(rect, 2, fromXY(o, { x: 400, y: -300 }), 'scale')
    expect(w(c)).toBeCloseTo(800, 0)
    expect(h(c)).toBeCloseTo(600, 0)
    expect(distance(centerOf(c), o)).toBeLessThan(0.5)
  })
  it('Größe: schräges Ziehen verzerrt nicht', () => {
    const c = dragCorner(rect, 1, fromXY(o, { x: 300, y: 400 }), 'scale')
    expect(w(c) / h(c)).toBeCloseTo(4 / 3, 3)
    // rechtwinklig geblieben (Diagonale passt zu Pythagoras)
    expect(diag(c)).toBeCloseTo(Math.hypot(w(c), h(c)), 0)
  })
  it('Größe + Drehen: Form bleibt, Bild dreht sich', () => {
    const c = dragCorner(rect, 1, fromXY(o, { x: -150, y: 200 }), 'rotate')
    expect(w(c) / h(c)).toBeCloseTo(4 / 3, 3)
    expect(diag(c)).toBeCloseTo(Math.hypot(w(c), h(c)), 0)
    expect(distance(c[1], fromXY(o, { x: -150, y: 200 }))).toBeLessThan(0.5)
  })
  it('Frei: nur die gezogene Ecke bewegt sich', () => {
    const t = fromXY(o, { x: 250, y: -100 })
    const c = dragCorner(rect, 2, t, 'free')
    expect(c[2]).toEqual(t)
    expect(c[0]).toEqual(rect[0])
  })
  it('Form zurücksetzen: verzerrtes Bild wird wieder ein Rechteck im Bild-Seitenverhältnis', () => {
    const verzerrt = [rect[0], fromXY(o, { x: 260, y: 190 }), fromXY(o, { x: 150, y: -120 }), rect[3]]
    const c = rectifyCorners(verzerrt, 1600, 1200)
    expect(w(c) / h(c)).toBeCloseTo(4 / 3, 3)
    expect(diag(c)).toBeCloseTo(Math.hypot(w(c), h(c)), 0)
    // Ecke 1 bleibt oben links
    expect(c[0].lat).toBeGreaterThan(c[3].lat)
    expect(c[0].lng).toBeLessThan(c[1].lng)
  })
})
