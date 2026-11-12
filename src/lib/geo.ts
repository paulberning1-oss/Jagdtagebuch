// Einfache Geometrie-Helfer für Reviergrößen (wenige Kilometer).
// Wir rechnen um einen Bezugspunkt herum in einer ebenen Näherung in Metern.
// Das ist für Entfernungen bis ca. 10 km auf wenige Meter genau – mehr als
// genug für Witterungskegel und Schussfelder.

export type LatLng = { lat: number; lng: number }
/** Punkt in Metern relativ zu einem Bezugspunkt: x = Osten, y = Norden */
export type XY = { x: number; y: number }

const R = 6371008.8 // mittlerer Erdradius in m
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Winkel auf 0..360 normalisieren */
export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

/** Kleinster Winkelabstand zweier Richtungen (0..180) */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normDeg(a) - normDeg(b))
  return d > 180 ? 360 - d : d
}

/** Punkt in lokale Meter-Koordinaten umrechnen */
export function toXY(origin: LatLng, p: LatLng): XY {
  return {
    x: toRad(p.lng - origin.lng) * R * Math.cos(toRad(origin.lat)),
    y: toRad(p.lat - origin.lat) * R,
  }
}

/** Lokale Meter-Koordinaten zurück in Lat/Lng */
export function fromXY(origin: LatLng, p: XY): LatLng {
  return {
    lat: origin.lat + toDeg(p.y / R),
    lng: origin.lng + toDeg(p.x / (R * Math.cos(toRad(origin.lat)))),
  }
}

/** Entfernung in Metern */
export function distance(a: LatLng, b: LatLng): number {
  const { x, y } = toXY(a, b)
  return Math.hypot(x, y)
}

/** Peilung von a nach b in Grad (0 = Nord, 90 = Ost) */
export function bearing(a: LatLng, b: LatLng): number {
  const { x, y } = toXY(a, b)
  return normDeg(toDeg(Math.atan2(x, y)))
}

/** Zielpunkt bei Peilung (Grad) und Entfernung (m) */
export function destination(origin: LatLng, bearingDeg: number, meters: number): LatLng {
  const b = toRad(bearingDeg)
  return fromXY(origin, { x: Math.sin(b) * meters, y: Math.cos(b) * meters })
}

/**
 * Kreissektor (Kegel) als Polygon.
 * @param center Spitze des Kegels
 * @param dirDeg Mittelrichtung in Grad
 * @param widthDeg Gesamte Öffnung in Grad
 * @param meters Länge
 */
export function sector(center: LatLng, dirDeg: number, widthDeg: number, meters: number, steps = 16): LatLng[] {
  const pts: LatLng[] = [center]
  const start = dirDeg - widthDeg / 2
  for (let i = 0; i <= steps; i++) {
    pts.push(destination(center, start + (widthDeg * i) / steps, meters))
  }
  pts.push(center)
  return pts
}

// ---------- Schnitt-Tests in der Ebene ----------

export function pointInPolygonXY(p: XY, poly: XY[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function cross(o: XY, a: XY, b: XY) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

export function segmentsIntersectXY(p1: XY, p2: XY, q1: XY, q2: XY): boolean {
  const d1 = cross(q1, q2, p1)
  const d2 = cross(q1, q2, p2)
  const d3 = cross(p1, p2, q1)
  const d4 = cross(p1, p2, q2)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  const onSeg = (a: XY, b: XY, c: XY) =>
    Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)
  if (d1 === 0 && onSeg(q1, q2, p1)) return true
  if (d2 === 0 && onSeg(q1, q2, p2)) return true
  if (d3 === 0 && onSeg(p1, p2, q1)) return true
  if (d4 === 0 && onSeg(p1, p2, q2)) return true
  return false
}

/** Schneidet bzw. berührt eine Linie (Polyline) das Polygon? */
export function lineIntersectsPolygon(origin: LatLng, line: LatLng[], polygon: LatLng[]): boolean {
  const l = line.map((p) => toXY(origin, p))
  const poly = polygon.map((p) => toXY(origin, p))
  if (l.some((p) => pointInPolygonXY(p, poly))) return true
  for (let i = 0; i < l.length - 1; i++) {
    for (let j = 0; j < poly.length - 1; j++) {
      if (segmentsIntersectXY(l[i], l[i + 1], poly[j], poly[j + 1])) return true
    }
  }
  return false
}

/** Überlappen sich zwei Polygone (oder berühren sich)? */
export function polygonsIntersect(origin: LatLng, a: LatLng[], b: LatLng[]): boolean {
  const pa = a.map((p) => toXY(origin, p))
  const pb = b.map((p) => toXY(origin, p))
  if (pa.some((p) => pointInPolygonXY(p, pb))) return true
  if (pb.some((p) => pointInPolygonXY(p, pa))) return true
  const close = (r: XY[]) => (r.length && (r[0].x !== r[r.length - 1].x || r[0].y !== r[r.length - 1].y) ? [...r, r[0]] : r)
  const ca = close(pa)
  const cb = close(pb)
  for (let i = 0; i < ca.length - 1; i++) {
    for (let j = 0; j < cb.length - 1; j++) {
      if (segmentsIntersectXY(ca[i], ca[i + 1], cb[j], cb[j + 1])) return true
    }
  }
  return false
}

export function pointInPolygon(origin: LatLng, p: LatLng, polygon: LatLng[]): boolean {
  return pointInPolygonXY(toXY(origin, p), polygon.map((q) => toXY(origin, q)))
}

/** Kürzeste Entfernung von a zu einem Linienzug (m) */
export function distanceToLine(a: LatLng, line: LatLng[]): number {
  const pts = line.map((p) => toXY(a, p))
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]
    const q = pts[i + 1]
    const dx = q.x - p.x
    const dy = q.y - p.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(p.x * dx + p.y * dy) / len2))
    best = Math.min(best, Math.hypot(p.x + t * dx, p.y + t * dy))
  }
  if (pts.length === 1) best = Math.hypot(pts[0].x, pts[0].y)
  return best
}

// ---------- Himmelsrichtungen ----------

const COMPASS_16 = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const COMPASS_8 = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const

/** Grad → deutsche Himmelsrichtung (16 Sektoren), z. B. 225 → "SW" */
export function compass16(deg: number): string {
  return COMPASS_16[Math.round(normDeg(deg) / 22.5) % 16]
}

/** Grad → 8er-Sektor (N, NO, …) – praktisch für Statistik */
export function compass8(deg: number): (typeof COMPASS_8)[number] {
  return COMPASS_8[Math.round(normDeg(deg) / 45) % 8]
}

// ---------- GeoJSON-Hilfen ----------
// GeoJSON speichert [Länge, Breite], Leaflet erwartet [Breite, Länge].

export const fromPos = (p: number[]): LatLng => ({ lat: p[1], lng: p[0] })
export const toPos = (p: LatLng): [number, number] => [p.lng, p.lat]

/** Fläche eines Polygons (äußerer Ring) in m² */
export function polygonArea(ring: LatLng[]): number {
  if (ring.length < 3) return 0
  const o = ring[0]
  const p = ring.map((q) => toXY(o, q))
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** Länge eines Linienzugs in m */
export function lineLength(line: LatLng[]): number {
  let s = 0
  for (let i = 0; i < line.length - 1; i++) s += distance(line[i], line[i + 1])
  return s
}
