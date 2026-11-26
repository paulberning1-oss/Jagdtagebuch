// Kachel-Rechnung (Web-Mercator, wie Leaflet/OSM): welche Kacheln decken ein Gebiet ab?
// Ohne Leaflet, damit es in Vitest testbar ist.
import type { Bounds } from '../db/ownData'

export interface TileXYZ {
  z: number
  x: number
  y: number
}

const R = 20037508.342789244 // halber Erdumfang in Web-Mercator-Metern

export function lngToX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}

export function latToY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Kachelbereich (einschließlich) eines Gebiets auf einer Zoomstufe */
export function tileRange(b: Bounds, z: number) {
  const max = 2 ** z - 1
  const clamp = (v: number) => Math.min(max, Math.max(0, v))
  return {
    x0: clamp(lngToX(b.west, z)),
    x1: clamp(lngToX(b.east, z)),
    y0: clamp(latToY(b.north, z)),
    y1: clamp(latToY(b.south, z)),
  }
}

/** Anzahl Kacheln je Zoomstufe von minZ bis maxZ */
export function tileCount(b: Bounds, minZ: number, maxZ: number): number {
  let n = 0
  for (let z = minZ; z <= maxZ; z++) {
    const r = tileRange(b, z)
    n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)
  }
  return n
}

/** Alle Kacheln eines Gebiets, grobe Stufen zuerst (dann ist bei Abbruch wenigstens die Übersicht da) */
export function* tilesIn(b: Bounds, minZ: number, maxZ: number): Generator<TileXYZ> {
  for (let z = minZ; z <= maxZ; z++) {
    const r = tileRange(b, z)
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) yield { z, x, y }
  }
}

/** Gebiet um `m` Meter in alle Richtungen vergrößern */
export function padBounds(b: Bounds, m: number): Bounds {
  const dLat = m / 111_320
  const dLng = m / (111_320 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180))
  return { south: b.south - dLat, north: b.north + dLat, west: b.west - dLng, east: b.east + dLng }
}

/** Ausdehnung einer Kachel in EPSG:3857 (für WMS-Abfragen): minx, miny, maxx, maxy */
export function tileBbox3857({ z, x, y }: TileXYZ): [number, number, number, number] {
  const size = (2 * R) / 2 ** z
  return [-R + x * size, R - (y + 1) * size, -R + (x + 1) * size, R - y * size]
}

export const tileKey = (provider: string, t: TileXYZ) => `${provider}/${t.z}/${t.x}/${t.y}`

/** Grobe Fläche eines Gebiets in km² */
export function areaKm2(b: Bounds): number {
  const h = (b.north - b.south) * 111.32
  const w = (b.east - b.west) * 111.32 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180)
  return Math.max(0, h * w)
}
