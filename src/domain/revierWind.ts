// Wind über dem ganzen Revier: Pfeil-Raster, Position des Richtungs-Kürzels und Prüfung aller Sitze.
import type { Facility } from '../db/db'
import type { Bounds } from '../db/ownData'
import { angleDiff, compass8, destination, distance, fromPos, fromXY, pointInPolygon, toXY, type LatLng } from '../lib/geo'
import { typeInfo } from './facilityTypes'
import { analyzeScent } from './scent'
import { standFacing } from './shootingField'

export const centerOf = (b: Bounds): LatLng => ({ lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 })

/** Halbe Diagonale des Reviers in Metern */
export const radiusOf = (b: Bounds) => distance({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east }) / 2

/**
 * Gleichmäßiges Raster von Pfeil-Positionen über dem Revier.
 * Liegt eine Reviergrenze vor, nur Punkte innerhalb davon.
 */
export function windArrowGrid(b: Bounds, rings: LatLng[][] = [], perSide = 7): LatLng[] {
  const c = centerOf(b)
  const sw = toXY(c, { lat: b.south, lng: b.west })
  const ne = toXY(c, { lat: b.north, lng: b.east })
  const w = ne.x - sw.x
  const h = ne.y - sw.y
  const step = Math.max(w, h, 1) / perSide
  const out: LatLng[] = []
  for (let y = sw.y + step / 2; y < ne.y; y += step) {
    for (let x = sw.x + step / 2; x < ne.x; x += step) {
      const p = fromXY(c, { x, y })
      if (!rings.length || rings.some((r) => pointInPolygon(c, p, r))) out.push(p)
    }
  }
  return out
}

/** Wo das rote Kürzel steht: auf der Seite, aus der der Wind kommt – knapp außerhalb des Reviers */
export function upwindLabelPos(b: Bounds, windFrom: number): LatLng {
  return destination(centerOf(b), windFrom, radiusOf(b) * 0.92 + 60)
}

/** Kürzel der Windrichtung (8 Richtungen), z. B. „W“ oder „SW“ */
export const windLetter = (windFrom: number) => compass8(windFrom)

export interface StandWind {
  stand: Facility
  /** 'ok' = passt, 'warn' = Witterung über empfindliche Stellen oder Wind von hinten, 'hint' = Hinweis */
  status: 'ok' | 'hint' | 'warn'
  /** Kurze Begründung */
  reason: string
  warnCount: number
}

/** Alle Sitze bei einem Wind prüfen – geeignete zuerst */
export function checkAllStands(facilities: Facility[], windFrom: number, opts: { length: number; width: number }): StandWind[] {
  const stands = facilities.filter((f) => typeInfo(f.type).isStand && f.geometry.type === 'Point')
  const rows = stands.map((stand): StandWind => {
    const facing = standFacing(stand)
    const res = analyzeScent(
      { stand: fromPos((stand.geometry as { coordinates: number[] }).coordinates), standBearing: facing, windFrom, length: opts.length, width: opts.width },
      facilities.filter((f) => f.type !== 'anmarsch'),
      stand.id,
    )
    const hits = res.messages.filter((m) => m.severity === 'warn' && m.facilityId)
    const hints = res.messages.filter((m) => m.severity === 'hint' && m.facilityId)
    const back = facing != null && angleDiff(windFrom, facing) >= 135
    const front = facing != null && angleDiff(windFrom, facing) <= 45
    const names = hits.map((m) => facilities.find((f) => f.id === m.facilityId)).filter(Boolean) as Facility[]
    if (hits.length || back) {
      const parts = [
        ...names.slice(0, 2).map((f) => `über ${typeInfo(f.type).label}${f.name ? ` „${f.name}“` : ''}`),
        ...(back ? ['Wind von hinten'] : []),
      ]
      return { stand, status: 'warn', reason: hits.length ? `Witterung ${parts.join(', ')}` : parts.join(', '), warnCount: hits.length + (back ? 1 : 0) }
    }
    if (hints.length) {
      const f = facilities.find((x) => x.id === hints[0].facilityId)
      return { stand, status: 'hint', reason: `Witterung erreicht ${f ? typeInfo(f.type).label : 'Äsung'}${f?.name ? ` „${f.name}“` : ''}`, warnCount: 0 }
    }
    return { stand, status: 'ok', reason: front ? 'Wind von vorn – passt' : 'Witterung zieht über nichts Bekanntes', warnCount: 0 }
  })
  const rank = { ok: 0, hint: 1, warn: 2 }
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || a.warnCount - b.warnCount || a.stand.name.localeCompare(b.stand.name, 'de'))
}
