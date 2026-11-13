// Schussfeld eines Sitzes: Sektor von Start- bis Endwinkel mit Reichweite – oder rundum (360°).
//
// Gespeichert wird wie bisher Blickrichtung (Mitte) + Breite in `bearing` / `fieldWidth`,
// dazu neu die Reichweite `fieldRange`. Breite 360 = „Rundum“.
// Start- und Endwinkel sind nur eine andere Darstellung davon – alte Sitze bleiben gültig.
import type { Facility } from '../db/db'
import { angleDiff, bearing as bearingTo, destination, distance, normDeg, sector, type LatLng } from '../lib/geo'
import { typeInfo } from './facilityTypes'

/** Reichweite, wenn keine eingetragen ist (m) */
export const DEFAULT_RANGE = 150
/** Breite bei neuen Sitzen (Grad) */
export const DEFAULT_WIDTH = 90
export const ROUND = 360

export interface ShootingField {
  round: boolean
  /** Startwinkel (im Uhrzeigersinn von hier bis `end`) */
  start: number
  end: number
  /** Mitte = Blickrichtung */
  mid: number
  width: number
  range: number
}

/** Schussfeld eines Sitzes – oder null, wenn (noch) keins festgelegt ist */
export function shootingField(f: Pick<Facility, 'type' | 'bearing' | 'fieldWidth' | 'fieldRange'>): ShootingField | null {
  if (!typeInfo(f.type).isStand) return null
  const range = f.fieldRange ?? DEFAULT_RANGE
  const width = f.fieldWidth ?? DEFAULT_WIDTH
  if (width >= ROUND) return { round: true, start: 0, end: 360, mid: f.bearing ?? 0, width: ROUND, range }
  if (f.bearing == null) return null
  return { round: false, start: normDeg(f.bearing - width / 2), end: normDeg(f.bearing + width / 2), mid: normDeg(f.bearing), width, range }
}

/** Blickrichtung für Wind „von vorn/hinten“ – bei Rundum oder ohne Schussfeld keine */
export function standFacing(f: Pick<Facility, 'type' | 'bearing' | 'fieldWidth' | 'fieldRange'>): number | null {
  const field = shootingField(f)
  return field && !field.round ? field.mid : null
}

/** Start-/Endwinkel → gespeicherte Werte (Blickrichtung + Breite). Gleicher Winkel = rundum. */
export function fromStartEnd(start: number, end: number): { bearing: number; fieldWidth: number } {
  const width = normDeg(end - start)
  if (width === 0) return { bearing: normDeg(start), fieldWidth: ROUND }
  return { bearing: normDeg(start + width / 2), fieldWidth: width }
}

/** Liegt ein Punkt im Schussfeld? (Entfernung bis Reichweite + Winkel) */
export function inShootingField(field: ShootingField, stand: LatLng, p: LatLng, extraM = 0): boolean {
  if (distance(stand, p) > field.range + extraM) return false
  return field.round || angleDiff(bearingTo(stand, p), field.mid) <= field.width / 2
}

/** Fläche zum Zeichnen auf der Karte */
export function shootingFieldPolygon(field: ShootingField, stand: LatLng): LatLng[] {
  if (!field.round) return sector(stand, field.mid, field.width, field.range, Math.max(8, Math.round(field.width / 6)))
  const ring: LatLng[] = []
  for (let i = 0; i <= 48; i++) ring.push(destination(stand, (i * 360) / 48, field.range))
  return ring
}
