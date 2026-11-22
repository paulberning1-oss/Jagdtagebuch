// Filter und Heatmap-Raster für Wildsichtungen – einfache, nachvollziehbare Zählungen.
import { fromXY, toXY, type LatLng } from '../lib/geo'
import { berlinParts } from '../lib/time'
import { computeSun } from './environment'
import type { DayPeriod, Sighting, SightingSource } from './hunt'

export type RangeFilter = 'alle' | '30' | '365' | 'jagdjahr'

export interface SightingFilter {
  speciesIds: string[]
  range: RangeFilter
  periods: DayPeriod[]
  months: number[]
  sources: SightingSource[]
}

export const EMPTY_FILTER: SightingFilter = { speciesIds: [], range: 'alle', periods: [], months: [], sources: [] }

export const RANGE_OPTIONS: { id: RangeFilter; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: '30', label: '30 Tage' },
  { id: '365', label: '12 Monate' },
  { id: 'jagdjahr', label: 'Jagdjahr' },
]

export const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Beginn des laufenden Jagdjahrs (1. April) */
export function huntingYearStart(now: number): number {
  const p = berlinParts(new Date(now))
  const year = p.month >= 4 ? p.year : p.year - 1
  return Date.UTC(year, 3, 1) - 2 * 3600000 // 1.4. 00:00 Berliner Sommerzeit
}

const periodCache = new Map<string, DayPeriod>()

/** Tageszeit einer Sichtung (Morgen/Tag/Abend/Nacht) – aus Sonnenstand am Ort */
export function periodOf(s: Pick<Sighting, 'id' | 'time' | 'lat' | 'lng'>): DayPeriod {
  const key = `${s.id}|${s.time}|${s.lat}|${s.lng}`
  let p = periodCache.get(key)
  if (!p) {
    p = computeSun(s.time, s.time, s.lat, s.lng).period
    periodCache.set(key, p)
  }
  return p
}

export function filterSightings(list: Sighting[], f: SightingFilter, now = Date.now()): Sighting[] {
  const from =
    f.range === '30' ? now - 30 * 86400000 : f.range === '365' ? now - 365 * 86400000 : f.range === 'jagdjahr' ? huntingYearStart(now) : -Infinity
  return list.filter((s) => {
    if (s.time < from) return false
    if (f.speciesIds.length && !f.speciesIds.includes(s.speciesId)) return false
    if (f.sources.length && !f.sources.includes(s.source)) return false
    if (f.months.length && !f.months.includes(berlinParts(new Date(s.time)).month)) return false
    if (f.periods.length && !f.periods.includes(periodOf(s))) return false
    return true
  })
}

export interface HeatCell {
  key: string
  polygon: LatLng[]
  /** Anzahl Stück in der Zelle */
  value: number
  sightings: number
}

/**
 * Teilt das Gebiet in Quadrate (Standard 50 m) und zählt die Stück je Quadrat.
 * Bewusst einfach: Jede Zelle zeigt genau, wie viel Wild dort gesehen wurde.
 */
export function heatGrid(list: Sighting[], cellM = 50, origin?: LatLng): HeatCell[] {
  if (!list.length) return []
  const o = origin ?? { lat: list[0].lat, lng: list[0].lng }
  const cells = new Map<string, HeatCell>()
  for (const s of list) {
    const p = toXY(o, s)
    const ix = Math.floor(p.x / cellM)
    const iy = Math.floor(p.y / cellM)
    const key = `${ix},${iy}`
    let c = cells.get(key)
    if (!c) {
      const x0 = ix * cellM
      const y0 = iy * cellM
      c = {
        key,
        value: 0,
        sightings: 0,
        polygon: [
          fromXY(o, { x: x0, y: y0 }),
          fromXY(o, { x: x0 + cellM, y: y0 }),
          fromXY(o, { x: x0 + cellM, y: y0 + cellM }),
          fromXY(o, { x: x0, y: y0 + cellM }),
        ],
      }
      cells.set(key, c)
    }
    c.value += s.count
    c.sightings++
  }
  return [...cells.values()]
}

/** Farbe für einen Wert relativ zum Maximum: gelb → orange → rot */
export function heatColor(value: number, max: number): string {
  const t = max <= 1 ? 1 : Math.min(1, Math.log(value + 1) / Math.log(max + 1))
  const stops = [
    [255, 235, 120],
    [255, 160, 60],
    [230, 60, 40],
  ]
  const seg = t < 0.5 ? 0 : 1
  const lt = t < 0.5 ? t * 2 : (t - 0.5) * 2
  const c = stops[seg].map((v, i) => Math.round(v + (stops[seg + 1][i] - v) * lt))
  return `rgb(${c.join(',')})`
}

// ---------- Wiedererkannte Stücke ----------

export interface KnownIndividual {
  name: string
  /** Wie oft gesehen (Sichtungen) */
  seen: number
  first: number
  last: number
  /** Klassen aus der jüngsten Sichtung (z. B. Bock) */
  sexAge: string[]
}

const normName = (s: string) => s.trim().toLowerCase().replace(/s+/g, ' ')

/** Bekannte Stücke einer Wildart (aus Sichtungen mit Namen), zuletzt gesehene zuerst */
export function knownIndividuals(list: Sighting[], speciesId: string, excludeId?: string): KnownIndividual[] {
  const m = new Map<string, KnownIndividual>()
  for (const s of list) {
    if (s.id === excludeId || s.speciesId !== speciesId || !s.individual?.trim() || !s.recognition) continue
    const key = normName(s.individual)
    const k = m.get(key)
    if (!k) m.set(key, { name: s.individual.trim(), seen: 1, first: s.time, last: s.time, sexAge: s.sexAge })
    else {
      k.seen++
      k.first = Math.min(k.first, s.time)
      if (s.time > k.last) {
        k.last = s.time
        k.sexAge = s.sexAge
      }
    }
  }
  return [...m.values()].sort((a, b) => b.last - a.last)
}

/** Kurztext für Listen: „„Knopfbock“ (wieder gesehen)“ */
export function individualText(s: Pick<Sighting, 'recognition' | 'individual'>): string {
  if (!s.recognition) return ''
  const name = s.individual?.trim()
  if (s.recognition === 'neu') return name ? `„${name}“ (neues Stück)` : 'neues Stück'
  return name ? `„${name}“ (wieder gesehen)` : 'schon gesehen'
}
