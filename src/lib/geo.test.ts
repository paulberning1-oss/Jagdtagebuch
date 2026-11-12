import { describe, expect, it } from 'vitest'
import {
  angleDiff,
  bearing,
  compass16,
  destination,
  distance,
  distanceToLine,
  lineIntersectsPolygon,
  pointInPolygon,
  polygonsIntersect,
  sector,
} from './geo'

const c = { lat: 52.6, lng: 10.3 }

describe('geo', () => {
  it('destination/distance/bearing passen zusammen', () => {
    const p = destination(c, 90, 500)
    expect(distance(c, p)).toBeCloseTo(500, 0)
    expect(bearing(c, p)).toBeCloseTo(90, 1)
    const q = destination(c, 225, 300)
    expect(bearing(c, q)).toBeCloseTo(225, 1)
  })

  it('Himmelsrichtungen', () => {
    expect(compass16(0)).toBe('N')
    expect(compass16(225)).toBe('SW')
    expect(compass16(359)).toBe('N')
    expect(compass16(100)).toBe('O')
    expect(angleDiff(350, 10)).toBe(20)
  })

  it('Punkt im Sektor', () => {
    const cone = sector(c, 45, 40, 300)
    expect(pointInPolygon(c, destination(c, 45, 200), cone)).toBe(true)
    expect(pointInPolygon(c, destination(c, 90, 200), cone)).toBe(false)
    expect(pointInPolygon(c, destination(c, 45, 400), cone)).toBe(false)
  })

  it('Linie quert den Kegel', () => {
    const cone = sector(c, 0, 40, 300)
    const quer = [destination(c, 300, 200), destination(c, 60, 200)]
    expect(lineIntersectsPolygon(c, quer, cone)).toBe(true)
    const daneben = [destination(c, 180, 200), destination(c, 200, 300)]
    expect(lineIntersectsPolygon(c, daneben, cone)).toBe(false)
  })

  it('Fläche berührt den Kegel', () => {
    const cone = sector(c, 0, 40, 300)
    const m = destination(c, 0, 350)
    const flaeche = [destination(m, 0, 100), destination(m, 90, 100), destination(m, 180, 100), destination(m, 270, 100)]
    expect(polygonsIntersect(c, cone, flaeche)).toBe(true)
    const weit = destination(c, 180, 500)
    const f2 = [destination(weit, 0, 50), destination(weit, 90, 50), destination(weit, 180, 50)]
    expect(polygonsIntersect(c, cone, f2)).toBe(false)
  })

  it('Abstand zur Linie', () => {
    const line = [destination(c, 270, 100), destination(c, 90, 100)].map((p) => destination(p, 0, 50))
    expect(distanceToLine(c, line)).toBeCloseTo(50, 0)
  })
})
