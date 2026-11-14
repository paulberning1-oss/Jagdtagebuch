// Anmarschweg-Check: Wohin zieht meine Witterung, während ich zum Sitz gehe?
//
// Der Weg wird in kurzen Schritten abgelaufen. An jedem Punkt:
// - Witterungskegel (Wind + 180°) – trifft er Wechsel, Kirrung, Einstand, Äsung … oder das Schussfeld?
// Unabhängig vom Wind (Bodenwitterung, Lärm):
// - Kreuzt der Weg einen Wechsel? Führt er durch eine Dickung/einen Einstand? Läuft er durchs Schussfeld?
import type { Facility } from '../db/db'
import {
  bearing,
  destination,
  distance,
  distanceToLine,
  fromPos,
  lineIntersectsPolygon,
  pointInPolygon,
  polygonsIntersect,
  sector,
  segmentsIntersectXY,
  toXY,
  type LatLng,
} from '../lib/geo'
import { typeInfo } from './facilityTypes'
import { shootingField, shootingFieldPolygon } from './shootingField'
import { analyzeScent } from './scent'

/** Abstand der Prüfpunkte entlang des Wegs (m) */
export const ROUTE_STEP_M = 25
/** Die letzten Meter vor dem Sitz zählen nicht als „durchs Schussfeld“ */
const NEAR_STAND_M = 30

export interface RouteHit {
  severity: 'warn' | 'hint'
  facilityId?: string
  text: string
  /** Nach wie vielen Metern des Wegs (ab Start) */
  atM: number
}

export interface RouteCheck {
  route: Facility
  lengthM: number
  hits: RouteHit[]
  /** warn = 3, Hinweis = 1 – kleiner ist besser */
  score: number
  /** Witterungskegel entlang des Wegs (zum Zeichnen) */
  cones: LatLng[][]
}

export const routeLine = (f: Facility): LatLng[] => (f.geometry.type === 'LineString' ? f.geometry.coordinates.map(fromPos) : [])

/** Punkte im Abstand `step` entlang einer Linie, mit zurückgelegter Strecke */
export function samplePath(line: LatLng[], step = ROUTE_STEP_M): { p: LatLng; atM: number }[] {
  if (!line.length) return []
  const out = [{ p: line[0], atM: 0 }]
  let total = 0
  let next = step
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const len = distance(a, b)
    const dir = bearing(a, b)
    while (next <= total + len) {
      out.push({ p: destination(a, dir, next - total), atM: next })
      next += step
    }
    total += len
  }
  const last = line[line.length - 1]
  if (out[out.length - 1].atM < total) out.push({ p: last, atM: total })
  return out
}

function linesCross(origin: LatLng, a: LatLng[], b: LatLng[]) {
  const A = a.map((p) => toXY(origin, p))
  const B = b.map((p) => toXY(origin, p))
  for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < B.length - 1; j++) if (segmentsIntersectXY(A[i], A[i + 1], B[j], B[j + 1])) return true
  return false
}

const nameOf = (f: Facility) => (f.name ? ` „${f.name}“` : '')
const m = (x: number) => `${Math.round(x / 10) * 10} m`

/** Einen Anmarschweg bei gegebenem Wind prüfen */
export function checkRoute(
  route: Facility,
  stand: Facility,
  windFrom: number,
  facilities: Facility[],
  opts: { length: number; width: number },
): RouteCheck {
  const line = routeLine(route)
  const samples = samplePath(line)
  const lengthM = samples.length ? samples[samples.length - 1].atM : 0
  const standPos = stand.geometry.type === 'Point' ? fromPos(stand.geometry.coordinates) : line[line.length - 1]
  // Andere Wege und Sitze sind für die Witterung egal
  const others = facilities.filter((f) => f.id !== stand.id && f.type !== 'anmarsch' && !typeInfo(f.type).isStand)
  const field = shootingField(stand)
  const fieldPoly = field && standPos ? shootingFieldPolygon(field, standPos) : null

  const hits = new Map<string, RouteHit>()
  const put = (key: string, h: RouteHit) => {
    const old = hits.get(key)
    if (!old || h.atM < old.atM) hits.set(key, h)
  }

  for (const s of samples) {
    // Witterung über Wechsel, Kirrung, Einstand, Äsung …
    const scent = analyzeScent({ stand: s.p, windFrom, length: opts.length, width: opts.width }, others)
    for (const msg of scent.messages) {
      if (!msg.facilityId || (msg.severity !== 'warn' && msg.severity !== 'hint')) continue
      const f = others.find((x) => x.id === msg.facilityId)!
      put(`w:${f.id}`, {
        severity: msg.severity,
        facilityId: f.id,
        text: `Witterung zieht über ${typeInfo(f.type).phrase}${nameOf(f)}.`,
        atM: s.atM,
      })
    }
    // Witterung ins Schussfeld (die letzten Meter am Sitz ausgenommen)
    if (fieldPoly && standPos && distance(s.p, standPos) > NEAR_STAND_M) {
      const cone = sector(s.p, windFrom + 180, opts.width, opts.length)
      if (polygonsIntersect(s.p, cone, fieldPoly)) put('feld', { severity: 'warn', text: 'Witterung zieht ins Schussfeld des Sitzes.', atM: s.atM })
      if (pointInPolygon(standPos, s.p, fieldPoly)) put('durch', { severity: 'hint', text: 'Weg läuft durch das Schussfeld.', atM: s.atM })
    }
  }

  // Unabhängig vom Wind: Wechsel kreuzen, durch Einstände laufen
  const origin = line[0]
  if (origin) {
    for (const f of others) {
      const info = typeInfo(f.type)
      if (info.scent !== 'warn') continue
      if (f.geometry.type === 'LineString') {
        const other = f.geometry.coordinates.map(fromPos)
        if (linesCross(origin, line, other)) {
          // Stelle des Wegs, die dem Wechsel am nächsten ist
          let at = 0
          let best = Infinity
          for (const s of samples) {
            const d = distanceToLine(s.p, other)
            if (d < best) {
              best = d
              at = s.atM
            }
          }
          put(`x:${f.id}`, { severity: 'warn', facilityId: f.id, text: `Weg kreuzt ${info.phrase}${nameOf(f)} – Bodenwitterung bleibt liegen.`, atM: at })
        }
      } else if (f.geometry.type === 'Polygon') {
        const ring = f.geometry.coordinates[0].map(fromPos)
        if (lineIntersectsPolygon(origin, line, ring)) {
          const inside = samples.find((s) => pointInPolygon(origin, s.p, ring))
          put(`x:${f.id}`, { severity: 'warn', facilityId: f.id, text: `Weg führt durch ${info.phrase}${nameOf(f)}.`, atM: inside?.atM ?? 0 })
        }
      }
    }
  }

  const list = [...hits.values()].sort((a, b) => a.atM - b.atM)
  const score = list.reduce((a, h) => a + (h.severity === 'warn' ? 3 : 1), 0)
  // Kegel etwa alle 50 m (höchstens 12) zum Anzeigen
  const every = Math.max(1, Math.ceil(samples.length / 12), Math.round(50 / ROUTE_STEP_M))
  const cones = samples.filter((_, i) => i % every === 0).map((s) => sector(s.p, windFrom + 180, opts.width, opts.length, 8))
  return { route, lengthM, hits: list, score, cones }
}

/** Alle Wege eines Sitzes prüfen; bester zuerst (wenigste Warnungen, dann kürzester) */
export function checkRoutes(stand: Facility, windFrom: number, facilities: Facility[], opts: { length: number; width: number }): RouteCheck[] {
  return facilities
    .filter((f) => f.type === 'anmarsch' && f.standId === stand.id && f.geometry.type === 'LineString')
    .map((r) => checkRoute(r, stand, windFrom, facilities, opts))
    .sort((a, b) => a.score - b.score || a.lengthM - b.lengthM)
}

/** Hilfe beim Zeichnen: letzter Punkt = Sitz, falls der Weg nicht ohnehin dort endet */
export function attachToStand(points: LatLng[], stand: LatLng, toleranceM = 15): LatLng[] {
  if (!points.length) return points
  return distance(points[points.length - 1], stand) > toleranceM ? [...points, stand] : points
}

/** Text für die Entfernung, z. B. „nach 120 m“ */
export const atText = (atM: number) => (atM < 15 ? 'gleich am Start' : `nach ${m(atM)}`)
