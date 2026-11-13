// Hilfen rund um die EIGENEN Daten (ohne Testdaten des Beispielreviers).
import type { Geometry } from 'geojson'
import { db } from './db'

export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}

function extend(b: Bounds | null, g: Geometry): Bounds | null {
  const pts: number[][] = []
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') pts.push(c as number[])
    else if (Array.isArray(c)) c.forEach(walk)
  }
  if ('coordinates' in g) walk(g.coordinates)
  for (const [lng, lat] of pts) {
    if (!b) b = { south: lat, north: lat, west: lng, east: lng }
    else {
      b.south = Math.min(b.south, lat)
      b.north = Math.max(b.north, lat)
      b.west = Math.min(b.west, lng)
      b.east = Math.max(b.east, lng)
    }
  }
  return b
}

/** Umriss aller eigenen Grenzen und Einrichtungen – oder (falls keine) aller Daten */
export async function revierBounds(): Promise<{ bounds: Bounds; own: boolean } | null> {
  const [boundaries, facilities] = await Promise.all([db.boundaries.toArray(), db.facilities.toArray()])
  const calc = (onlyOwn: boolean) => {
    let b: Bounds | null = null
    for (const x of boundaries) if (!onlyOwn || !x.demo) b = extend(b, x.geometry)
    for (const x of facilities) if (!onlyOwn || !x.demo) b = extend(b, x.geometry)
    return b
  }
  const own = calc(true)
  if (own) return { bounds: own, own: true }
  const all = calc(false)
  return all ? { bounds: all, own: false } : null
}

/** Wie viele eigene Einträge liegen auf diesem Gerät? */
export async function ownDataCounts() {
  const [facilities, boundaries, hunts, sightings, overlays] = await Promise.all([
    db.facilities.filter((x) => !x.demo).count(),
    db.boundaries.filter((x) => !x.demo).count(),
    db.hunts.filter((x) => !x.demo).count(),
    db.sightings.filter((x) => !x.demo).count(),
    db.overlays.count(),
  ])
  return { facilities, boundaries, hunts, sightings, overlays }
}
