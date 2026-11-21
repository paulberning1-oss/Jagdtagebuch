// Jagdwissen, Jagdkalender und eigene Jagdzeiten (Teilschritt 5).
//
// Startwissen und Start-Kalender stehen im Code (`knowledgeDefaults.ts`, `phases.ts`) und sind
// „Vorschlag – ungeprüft“. Gespeichert werden nur Änderungen und eigene Einträge: Ein gespeicherter
// Eintrag mit derselben Kennung ersetzt den Vorschlag. „Auf Vorschlag zurücksetzen“ = gespeicherten
// Eintrag in „Zuletzt gelöscht“ verschieben (wiederherstellbar).
//
// Jagd- und Schonzeiten (`Season`) haben KEINE Vorgaben im Code – nur der Nutzer pflegt sie.
import { berlinParts } from '../lib/time'
import { DEFAULT_PHASES, inPhase, type PhaseDef } from './phases'

export type KnowStatus = 'ungeprueft' | 'geprueft'

export interface KnowledgeEntry {
  /** Vorschlag: „w:<wildart|allg>:<thema>“, eigener Abschnitt: zufällige Kennung */
  id: string
  /** Wildart oder null = allgemein */
  speciesId: string | null
  title: string
  text: string
  /** Eigene Ergänzung (z. B. Wissen des Opas) */
  addition?: string
  /** Quelle der Ergänzung bzw. des eigenen Abschnitts, z. B. „Opa“ */
  source?: string
  status: KnowStatus
  /** Selbst angelegter Abschnitt (kein Vorschlag) */
  own?: boolean
  order: number
  updatedAt?: number
}

export interface CalendarPhase extends PhaseDef {
  /** Vorschlag: „p:<wildart|allg>:<name>“, eigene Phase: zufällige Kennung */
  id: string
  status: KnowStatus
  /** Ausgeschaltete Phasen werden nicht vorgeschlagen */
  active: boolean
  own?: boolean
  note?: string
  updatedAt?: number
}

/** Eigene Jagdzeit: Zeitraum, in dem die Wildart (Klasse) bejagt werden darf – nur vom Nutzer gepflegt */
export interface Season {
  id: string
  speciesId: string
  /** z. B. „Böcke“, „Schmalrehe“, „Frischlinge“ */
  label: string
  from: string
  to: string
  /** z. B. Quelle/Stand („Landesjagdzeitenverordnung, Stand 2026“) */
  note?: string
  updatedAt?: number
}

export const STATUS_LABEL: Record<KnowStatus, string> = {
  ungeprueft: 'Vorschlag – ungeprüft',
  geprueft: 'geprüft',
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const phaseId = (p: PhaseDef) => `p:${p.speciesId ?? 'allg'}:${slug(p.label)}`

/** Start-Kalender als Einträge (ungeprüft, aktiv) */
export const DEFAULT_CALENDAR: CalendarPhase[] = DEFAULT_PHASES.map((p) => ({ ...p, id: phaseId(p), status: 'ungeprueft', active: true }))

/**
 * Vorschläge mit gespeicherten Änderungen zusammenführen: gespeicherte Einträge ersetzen den
 * Vorschlag gleicher Kennung, eigene kommen dazu. Reihenfolge: Vorschläge, dann eigene.
 */
export function mergeWithDefaults<T extends { id: string }>(defaults: T[], stored: T[]): T[] {
  const byId = new Map(stored.map((s) => [s.id, s]))
  const defIds = new Set(defaults.map((d) => d.id))
  return [...defaults.map((d) => byId.get(d.id) ?? d), ...stored.filter((s) => !defIds.has(s.id))]
}

/** Ist der Eintrag ein (veränderter) Vorschlag? */
export const isDefaultId = (id: string) => /^[wp]:/.test(id)

// ---------- Tag im Jahr (MM-TT) ----------

/** Liegt der Tag (Berliner Datum) im Zeitraum „MM-TT“ bis „MM-TT“? Über den Jahreswechsel möglich. */
export const inRange = (from: string, to: string, time: number) => inPhase({ speciesId: null, label: '', from, to }, time)

/** Heutiges Datum als „MM-TT“ (Berlin) */
export function todayMonthDay(time = Date.now()): string {
  const { month, day } = berlinParts(new Date(time))
  return mmdd(month, day)
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Tag im (Nicht-Schalt-)Jahr, 0 … 364 */
export function dayOfYear(mmdd: string): number {
  const [m, d] = mmdd.split('-').map(Number)
  return MONTH_DAYS.slice(0, m - 1).reduce((a, x) => a + x, 0) + Math.min(d, MONTH_DAYS[m - 1]) - 1
}

/** Abschnitte im Jahr als Anteile 0…1 (über den Jahreswechsel → zwei Stücke) */
export function yearSegments(from: string, to: string): [number, number][] {
  const a = dayOfYear(from) / 365
  const b = (dayOfYear(to) + 1) / 365
  return a <= b ? [[a, b]] : [[0, b], [a, 1]]
}

/** „TT.MM.“ */
export const fmtMonthDay = (mmdd: string) => {
  const [m, d] = mmdd.split('-')
  return `${d}.${m}.`
}

export const mmdd = (month: number, day: number) => `${String(month).padStart(2, '0')}-${String(Math.min(day, MONTH_DAYS[month - 1])).padStart(2, '0')}`

export const daysInMonth = (month: number) => MONTH_DAYS[month - 1]

// ---------- Jagdzeiten ----------

export interface SeasonState {
  season: Season
  open: boolean
}

/** Jagdzeiten einer Wildart zum Zeitpunkt – nur aus der eigenen Tabelle */
export function seasonsAt(seasons: Season[], speciesId: string, time: number): SeasonState[] {
  return seasons.filter((s) => s.speciesId === speciesId).map((season) => ({ season, open: inRange(season.from, season.to, time) }))
}
