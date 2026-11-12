// Witterungskegel: Wohin zieht meine Witterung und wen erreicht sie?
//
// Windrichtung wird – wie im Wetterbericht – als Herkunft angegeben:
// "Wind aus SW (225°)" bedeutet, die Luft strömt nach NO (45°).
// Meine Witterung zieht also in Richtung (Windrichtung + 180°).

import type { Facility } from '../db/db'
import {
  angleDiff,
  compass16,
  distance,
  distanceToLine,
  fromPos,
  lineIntersectsPolygon,
  normDeg,
  pointInPolygon,
  polygonsIntersect,
  sector,
  type LatLng,
} from '../lib/geo'
import { typeInfo } from './facilityTypes'

export interface ScentInput {
  stand: LatLng
  /** Blickrichtung des Sitzes (optional) */
  standBearing?: number | null
  /** Windrichtung in Grad (woher der Wind kommt) */
  windFrom: number
  /** Windgeschwindigkeit in km/h (optional) */
  windSpeed?: number | null
  gusts?: number | null
  length: number
  width: number
}

export type Severity = 'warn' | 'hint' | 'good' | 'info'

export interface ScentMessage {
  severity: Severity
  text: string
  facilityId?: string
}

export interface ScentResult {
  cone: LatLng[]
  scentDir: number
  messages: ScentMessage[]
}

/** Windstärke unter der die Luft "steht" bzw. umläuft (km/h) */
export const CALM_WIND_KMH = 4

export function analyzeScent(input: ScentInput, facilities: Facility[], excludeId?: string): ScentResult {
  const scentDir = normDeg(input.windFrom + 180)
  const cone = sector(input.stand, scentDir, input.width, input.length)
  const messages: ScentMessage[] = []
  const windTxt = `Wind aus ${compass16(input.windFrom)}`

  for (const f of facilities) {
    if (f.id === excludeId) continue
    const info = typeInfo(f.type)
    if (!info.scent) continue
    let hit = false
    let dist = 0
    const g = f.geometry
    if (g.type === 'Point') {
      const p = fromPos(g.coordinates)
      hit = pointInPolygon(input.stand, p, cone)
      dist = distance(input.stand, p)
    } else if (g.type === 'LineString') {
      const line = g.coordinates.map(fromPos)
      hit = lineIntersectsPolygon(input.stand, line, cone)
      dist = distanceToLine(input.stand, line)
    } else if (g.type === 'Polygon') {
      const ring = g.coordinates[0].map(fromPos)
      hit = polygonsIntersect(input.stand, cone, ring)
      dist = pointInPolygon(input.stand, input.stand, ring) ? 0 : distanceToLine(input.stand, ring)
    }
    if (!hit) continue
    const name = f.name ? ` „${f.name}“` : ''
    const where = dist < 15 ? 'direkt' : `ca. ${Math.round(dist / 10) * 10} m entfernt`
    messages.push({
      severity: info.scent,
      facilityId: f.id,
      text:
        info.scent === 'warn'
          ? `${windTxt}: Deine Witterung zieht über ${info.phrase}${name} (${where}).`
          : `${windTxt}: Witterung erreicht ${info.phrase}${name} (${where}) – Wild kann dich beim Austreten wittern.`,
    })
  }

  // Wind im Verhältnis zur Blickrichtung des Sitzes
  if (input.standBearing != null) {
    const d = angleDiff(input.windFrom, input.standBearing)
    if (d <= 45) {
      messages.push({ severity: 'good', text: `${windTxt} kommt dir von vorn ins Gesicht – Witterung zieht vom Schussfeld weg.` })
    } else if (d >= 135) {
      messages.push({ severity: 'warn', text: `${windTxt} kommt von hinten – deine Witterung zieht genau ins Schussfeld.` })
    } else {
      messages.push({ severity: 'info', text: `${windTxt} steht seitlich zum Schussfeld.` })
    }
  }

  if (input.windSpeed != null && input.windSpeed < CALM_WIND_KMH) {
    messages.push({
      severity: 'hint',
      text: `Kaum Wind (${Math.round(input.windSpeed)} km/h): Die Luft kann umlaufen – der Kegel ist nur ein grober Anhaltspunkt.`,
    })
  }
  if (input.gusts != null && input.gusts >= 40) {
    messages.push({
      severity: 'info',
      text: `Starke Böen (${Math.round(input.gusts)} km/h): Wild ist bei viel Wind oft unruhig und hört schlecht.`,
    })
  }

  if (!messages.some((m) => m.severity === 'warn' && m.facilityId)) {
    messages.unshift({
      severity: 'good',
      text: `${windTxt}: Keine bekannten Wechsel, Kirrungen oder Einstände im Witterungskegel.`,
    })
  }

  const order: Record<Severity, number> = { warn: 0, hint: 1, good: 2, info: 3 }
  messages.sort((a, b) => order[a.severity] - order[b.severity])
  return { cone, scentDir, messages }
}
