// Jagdwissen, Jagdkalender und eigene Jagdzeiten (Teilschritt 5).
//
// Startwissen und Start-Kalender stehen im Code (`knowledgeDefaults.ts`, `phases.ts`) und sind
// „Vorschlag – ungeprüft“. Gespeichert werden nur Änderungen und eigene Einträge: Ein gespeicherter
// Eintrag mit derselben Kennung ersetzt den Vorschlag. „Auf Vorschlag zurücksetzen“ = gespeicherten
// Eintrag in „Zuletzt gelöscht“ verschieben (wiederherstellbar).
//
// Jagd- und Schonzeiten (`Season`) haben KEINE Vorgaben im Code, die automatisch gelten – nur der Nutzer
// pflegt sie. Ausnahme auf ausdrücklichen Wunsch: Vorlage Niedersachsen (`seasonsNiedersachsen.ts`), die der
// Nutzer per Knopf in seine Tabelle übernimmt.
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
  /** Name der Wildart, wenn sie nicht in der Wildarten-Liste steht (z. B. „Steinmarder“, Kennung „nds:…“/„x:…“) */
  name?: string
  /** Keine Jagdzeit – ganzjährig geschont (from/to ohne Bedeutung) */
  closed?: boolean
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

/** Darf laut eigener Tabelle zum Zeitpunkt bejagt werden? */
export const seasonOpen = (s: Season, time: number) => !s.closed && inRange(s.from, s.to, time)

/** Jagdzeiten einer Wildart zum Zeitpunkt – nur aus der eigenen Tabelle */
export function seasonsAt(seasons: Season[], speciesId: string, time: number): SeasonState[] {
  return seasons.filter((s) => s.speciesId === speciesId).map((season) => ({ season, open: seasonOpen(season, time) }))
}

/** Tage vom (Berliner) Datum bis zum nächsten „MM-TT“ (0 = heute) */
export function daysUntil(target: string, time: number): number {
  const d = dayOfYear(target) - dayOfYear(todayMonthDay(time))
  return d < 0 ? d + 365 : d
}

/** Nimmt die Zeile den ganzen Jahreskreis ein? */
export const allYear = (from: string, to: string) => dayOfYear(from) === 0 && dayOfYear(to) === 364

// ---------- Übersicht „Aktuell“ ----------

export interface ClassState {
  label: string
  /** Alle Zeilen dieser Klasse (mehrere Zeiträume möglich, z. B. Schmalrehe Frühjahr + Herbst) */
  seasons: Season[]
  open: boolean
  closed: boolean
  allYear: boolean
  /** Bei Jagdzeit: Tage bis zum letzten Jagdtag (inkl. Tag 0 = heute letzter Tag) */
  endsIn?: number
  /** Letzter Jagdtag „MM-TT“ */
  endDay?: string
  /** Bei Schonzeit: Tage bis zum nächsten Jagdbeginn */
  opensIn?: number
  openDay?: string
}

export interface SpeciesSeasonState {
  speciesId: string
  name: string
  classes: ClassState[]
  anyOpen: boolean
}

/**
 * Jagdzeiten aller Wildarten zum Zeitpunkt, je Wildart und Klasse zusammengefasst.
 * Reihenfolge: `order` (Kennungen der Wildarten-Liste), danach weitere Arten in Tabellen-Reihenfolge.
 */
export function seasonOverview(seasons: Season[], time: number, names: Map<string, string>, order: string[] = []): SpeciesSeasonState[] {
  const bySpecies = new Map<string, Season[]>()
  for (const s of seasons) bySpecies.set(s.speciesId, [...(bySpecies.get(s.speciesId) ?? []), s])
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i < 0 ? order.length : i
  }
  const ids = [...bySpecies.keys()].sort((a, b) => rank(a) - rank(b))
  return ids.map((speciesId) => {
    const list = bySpecies.get(speciesId)!
    const byLabel = new Map<string, Season[]>()
    for (const s of list) byLabel.set(s.label, [...(byLabel.get(s.label) ?? []), s])
    const classes = [...byLabel.entries()].map(([label, ss]): ClassState => {
      const closed = ss.every((s) => s.closed)
      const ranges = ss.filter((s) => !s.closed)
      const openNow = ranges.filter((s) => inRange(s.from, s.to, time))
      const whole = ranges.some((s) => allYear(s.from, s.to))
      const c: ClassState = { label, seasons: ss, open: openNow.length > 0, closed, allYear: whole }
      if (c.open && !whole) {
        const end = openNow.map((s) => ({ day: s.to, n: daysUntil(s.to, time) })).sort((a, b) => b.n - a.n)[0]
        c.endsIn = end.n
        c.endDay = end.day
      } else if (!c.open && ranges.length) {
        const next = ranges.map((s) => ({ day: s.from, n: daysUntil(s.from, time) })).sort((a, b) => a.n - b.n)[0]
        c.opensIn = next.n
        c.openDay = next.day
      }
      return c
    })
    const name = names.get(speciesId) ?? list.find((s) => s.name)?.name ?? speciesId
    return { speciesId, name, classes, anyOpen: classes.some((c) => c.open) }
  })
}

/** Kurztext zum Stand einer Klasse, z. B. „Jagdzeit bis 31.01. · noch 72 Tage“ */
export function classStateText(c: ClassState): string {
  if (c.closed) return 'keine Jagdzeit – ganzjährig geschont'
  if (c.open && c.allYear) return 'Jagdzeit ganzjährig'
  if (c.open && c.endDay != null && c.endsIn != null)
    return `Jagdzeit bis ${fmtMonthDay(c.endDay)} · ${c.endsIn === 0 ? 'heute letzter Tag' : `noch ${c.endsIn + 1} Tage`}`
  if (c.openDay != null && c.opensIn != null) return `Schonzeit · Jagdzeit ab ${fmtMonthDay(c.openDay)} (in ${c.opensIn} ${c.opensIn === 1 ? 'Tag' : 'Tagen'})`
  return 'Schonzeit'
}

/** Notiz ohne den angehängten Quellen-Hinweis („… · Quelle: …“) */
export const noteWithoutSource = (note?: string) => (note ?? '').replace(/(^|\s·\s)Quelle:.*$/, '').trim()
