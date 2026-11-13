// Kategorien der Reviereinrichtungen und eigenen Objekte.
//
// - Feste Kategorien (hier im Code): Sitze, Kirrung, Wechsel, Dickung … plus die Startliste
//   für eigene Objekte (Fluss/Bach, Graben, Neuanpflanzung, Zaun, Weg, Störquelle).
// - Eigene Kategorien legt der Nutzer in der App an (Tabelle `categories`). Sie werden zur Laufzeit
//   mit `registerCustomCategories` eingehängt – `typeInfo` kennt danach beide Sorten.

export type GeometryKind = 'point' | 'line' | 'area'

/** Kennung einer Kategorie: feste Kennung (z. B. 'hochsitz') oder 'k_…' für eigene Kategorien */
export type FacilityType = string

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
  /** Erlaubte Geometrien – die erste ist die übliche */
  kinds: GeometryKind[]
  /** = kinds[0] (für ältere Stellen im Code) */
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
  /** Feld „Feldfrucht“ anbieten (Agrarflächen) */
  hasCrop?: boolean
  /** Linienmuster auf der Karte (Leaflet dashArray), sonst durchgezogen */
  dash?: string
  /** Eigene, in der App angelegte Kategorie */
  custom?: boolean
}

type Def = Omit<FacilityTypeInfo, 'kind' | 'kinds'> & { kinds: GeometryKind[] }
const def = (d: Def): FacilityTypeInfo => ({ ...d, kind: d.kinds[0] })

export const FACILITY_TYPES: FacilityTypeInfo[] = [
  // Sitze
  def({ type: 'hochsitz', label: 'Hochsitz', kinds: ['point'], glyph: 'H', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'den Hochsitz' }),
  def({ type: 'kanzel', label: 'Kanzel', kinds: ['point'], glyph: 'K', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'die Kanzel' }),
  def({ type: 'leiter', label: 'Leiter', kinds: ['point'], glyph: 'L', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'die Leiter' }),
  def({ type: 'drueckjagdbock', label: 'Drückjagdbock', kinds: ['point'], glyph: 'DB', color: '#d4a72c', isStand: true, hasBearing: true, scent: null, phrase: 'den Drückjagdbock' }),
  // Punkte
  def({ type: 'kirrung', label: 'Kirrung', kinds: ['point'], glyph: 'Ki', color: '#e07a3f', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Kirrung' }),
  def({ type: 'salzlecke', label: 'Salzlecke', kinds: ['point'], glyph: 'Sa', color: '#cfd8dc', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Salzlecke' }),
  def({ type: 'suhle', label: 'Suhle', kinds: ['point'], glyph: 'Su', color: '#8d6e63', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Suhle' }),
  def({ type: 'wildkamera', label: 'Wildkamera', kinds: ['point'], glyph: 'WK', color: '#7e9cd8', isStand: false, hasBearing: true, scent: null, phrase: 'die Wildkamera' }),
  def({ type: 'parkplatz', label: 'Parkplatz', kinds: ['point'], glyph: 'P', color: '#90a4ae', isStand: false, hasBearing: false, scent: null, phrase: 'den Parkplatz' }),
  def({ type: 'stoerquelle', label: 'Störquelle', kinds: ['point', 'line', 'area'], glyph: '!', color: '#ef6b4a', isStand: false, hasBearing: false, scent: null, phrase: 'die Störquelle' }),
  // Linien
  def({ type: 'wechsel', label: 'Wechsel', kinds: ['line'], glyph: '', color: '#ff8a50', isStand: false, hasBearing: false, scent: 'warn', phrase: 'den Wechsel', dash: '10 8' }),
  def({ type: 'gewaesser', label: 'Fluss / Bach', kinds: ['line'], glyph: '', color: '#4fa3e0', isStand: false, hasBearing: false, scent: null, phrase: 'den Bach' }),
  def({ type: 'graben', label: 'Graben', kinds: ['line'], glyph: '', color: '#7fc4e8', isStand: false, hasBearing: false, scent: null, phrase: 'den Graben', dash: '6 4' }),
  def({ type: 'weg', label: 'Weg', kinds: ['line'], glyph: '', color: '#e8dcc0', isStand: false, hasBearing: false, scent: null, phrase: 'den Weg' }),
  def({ type: 'zaun', label: 'Zaun / eingezäunte Fläche', kinds: ['line', 'area'], glyph: '', color: '#b0bec5', isStand: false, hasBearing: false, scent: null, phrase: 'den Zaun', dash: '2 6' }),
  // Flächen
  def({ type: 'aesung', label: 'Äsungsfläche / Wildacker', kinds: ['area'], glyph: '', color: '#9ccc65', isStand: false, hasBearing: false, scent: 'hint', phrase: 'die Äsungsfläche' }),
  def({ type: 'feld', label: 'Feld / Agrarfläche', kinds: ['area'], glyph: '', color: '#e6c86e', isStand: false, hasBearing: false, scent: null, phrase: 'das Feld', hasCrop: true }),
  def({ type: 'neuanpflanzung', label: 'Neuanpflanzung', kinds: ['area'], glyph: '', color: '#aed581', isStand: false, hasBearing: false, scent: null, phrase: 'die Neuanpflanzung' }),
  def({ type: 'dickung', label: 'Dickung', kinds: ['area'], glyph: '', color: '#2e7d32', isStand: false, hasBearing: false, scent: 'warn', phrase: 'die Dickung' }),
  def({ type: 'einstand', label: 'Einstand (sonstiger)', kinds: ['area'], glyph: '', color: '#558b2f', isStand: false, hasBearing: false, scent: 'warn', phrase: 'den Einstand' }),
]

/** Häufige Feldfrüchte als Vorschläge */
export const CROPS = ['Mais', 'Weizen', 'Gerste', 'Roggen', 'Triticale', 'Hafer', 'Raps', 'Zuckerrüben', 'Kartoffeln', 'Erbsen', 'Ackerbohnen', 'Sonnenblumen', 'Grünland / Wiese', 'Kleegras', 'Brache', 'Stoppel']

// ---------- eigene Kategorien ----------

/** Eigene Kategorie (Tabelle `categories`) */
export interface Category {
  id: string
  label: string
  kinds: GeometryKind[]
  color: string
  scent: ScentSensitivity
  hasCrop: boolean
  order: number
  createdAt: number
}

/** Farben zur Auswahl für Kategorien und Objekte */
export const OBJECT_COLORS = ['#ef6b4a', '#e07a3f', '#d4a72c', '#e6c86e', '#9ccc65', '#2e7d32', '#4fa3e0', '#7e9cd8', '#c27ba0', '#8d6e63', '#b0bec5', '#e7e5dc']

/** Kurzzeichen für eigene Punkt-Kategorien: Anfangsbuchstaben */
const glyphOf = (label: string) => {
  const w = label.trim().split(/[\s/–-]+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : label.slice(0, 2)).toUpperCase() || '?'
}

export function categoryInfo(c: Category): FacilityTypeInfo {
  return def({
    type: c.id,
    label: c.label,
    kinds: c.kinds.length ? c.kinds : ['point'],
    glyph: glyphOf(c.label),
    color: c.color,
    isStand: false,
    hasBearing: false,
    scent: c.scent,
    phrase: `„${c.label}“`,
    hasCrop: c.hasCrop,
    custom: true,
  })
}

let all: FacilityTypeInfo[] = FACILITY_TYPES
let byType = new Map(all.map((t) => [t.type, t]))

/** Eigene Kategorien einhängen (wird von der App bei jeder Änderung aufgerufen) */
export function registerCustomCategories(list: Category[]) {
  all = [...FACILITY_TYPES, ...[...list].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'de')).map(categoryInfo)]
  byType = new Map(all.map((t) => [t.type, t]))
}

/** Alle Kategorien: feste + eigene */
export const allTypes = () => all

/** Unbekannte Kategorie (z. B. gelöscht) – nie ein Sitz */
const unknown = (t: string): FacilityTypeInfo =>
  def({ type: t, label: 'Unbekannte Kategorie', kinds: ['point', 'line', 'area'], glyph: '?', color: '#9e9e9e', isStand: false, hasBearing: false, scent: null, phrase: 'das Objekt' })

export function typeInfo(t: FacilityType): FacilityTypeInfo {
  return byType.get(t) ?? unknown(t)
}

export const typesOfKind = (k: GeometryKind) => all.filter((t) => t.kinds.includes(k))

/** Geometrie-Art eines Objekts */
export const kindOfGeometry = (g: { type: string }): GeometryKind => (g.type === 'Point' ? 'point' : g.type === 'LineString' ? 'line' : 'area')

/** Farbe eines Objekts: eigene Farbe, sonst die der Kategorie */
export const facilityColor = (f: { type: FacilityType; color?: string | null }) => f.color || typeInfo(f.type).color
