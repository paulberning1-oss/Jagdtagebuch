// Katalog der Reviereinrichtungen. Neue Typen einfach hier ergänzen.

export type GeometryKind = 'point' | 'line' | 'area'

export type FacilityType =
  | 'hochsitz'
  | 'kanzel'
  | 'leiter'
  | 'drueckjagdbock'
  | 'kirrung'
  | 'salzlecke'
  | 'suhle'
  | 'wildkamera'
  | 'parkplatz'
  | 'wechsel'
  | 'aesung'
  | 'feld'
  | 'dickung'
  | 'einstand'

/**
 * Wie empfindlich reagiert das Wild, wenn meine Witterung hierher zieht?
 * - 'warn': klare Warnung (Wechsel, Kirrung, Einstand …)
 * - 'hint': Hinweis (z. B. Äsungsfläche)
 * - null: egal (Parkplatz, andere Sitze …)
 */
export type ScentSensitivity = 'warn' | 'hint' | null

export interface FacilityTypeInfo {
  type: FacilityType
  label: string
  kind: GeometryKind
  /** Kurzzeichen im Kartensymbol */
  glyph: string
  color: string
  /** Ist es ein Sitz (Ansitz möglich, Schussfeld sinnvoll)? */
  isStand: boolean
  /** Hat eine Blickrichtung (Sitze, Wildkamera) */
  hasBearing: boolean
  scent: ScentSensitivity
  /** Wie im Satz "… zieht über den/die/das …" */
  phrase: string
}

export const FACILITY_TYPES: FacilityTypeInfo[] = [
  { type: 'hochsitz', label: 'Hochsitz', kind: 'point', glyph: 'H', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'den Hochsitz' },
  { type: 'kanzel', label: 'Kanzel', kind: 'point', glyph: 'K', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'die Kanzel' },
  { type: 'leiter', label: 'Leiter', kind: 'point', glyph: 'L', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'die Leiter' },
  { type: 'drueckjagdbock', label: 'Drückjagdbock', kind: 'point', glyph: 'DB', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'den Drückjagdbock' },
  { type: 'kirrung', label: 'Kirrung', kind: 'point', glyph: 'Ki', color: '#e07a3f', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Kirrung' },
  { type: 'salzlecke', label: 'Salzlecke', kind: 'point', glyph: 'Sa', color: '#cfd8dc', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Salzlecke' },
  { type: 'suhle', label: 'Suhle', kind: 'point', glyph: 'Su', color: '#8d6e63', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Suhle' },
  { type: 'wildkamera', label: 'Wildkamera', kind: 'point', glyph: 'WK', color: '#7e9cd8', isStand: false, hasBearing: true, scent: null, phrase: 'die Wildkamera' },
  { type: 'parkplatz', label: 'Parkplatz', kind: 'point', glyph: 'P', color: '#90a4ae', isStand: false, hasBearing: false, scent: null, phrase: 'den Parkplatz' },
  { type: 'wechsel', label: 'Wechsel', kind: 'line', glyph: '', color: '#ff8a50', isStand: false, hasBearing: false, scent: 'warn', phrase: 'den Wechsel' },
  { type: 'aesung', label: 'Äsungsfläche / Wildacker', kind: 'area', glyph: '', color: '#9ccc65', isStand: false, hasBearing: false, scent: 'hint', phrase: 'die Äsungsfläche' },
  { type: 'feld', label: 'Feld', kind: 'area', glyph: '', color: '#e6c86e', isStand: false, hasBearing: false, scent: null, phrase: 'das Feld' },
  { type: 'dickung', label: 'Dickung', kind: 'area', glyph: '', color: '#2e7d32', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Dickung' },
  { type: 'einstand', label: 'Einstand (sonstiger)', kind: 'area', glyph: '', color: '#558b2f', isStand: false, hasBearing: false, scent: 'warn', phrase: 'den Einstand' },
]

const BY_TYPE = new Map(FACILITY_TYPES.map((t) => [t.type, t]))

export function typeInfo(t: FacilityType): FacilityTypeInfo {
  return BY_TYPE.get(t) ?? FACILITY_TYPES[0]
}

export const typesOfKind = (k: GeometryKind) => FACILITY_TYPES.filter((t) => t.kind === k)
