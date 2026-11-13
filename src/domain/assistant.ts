// Kombinations-Assistent: Regelwerk + eigene Erfahrung aus dem Tagebuch.
//
//   Punkte = (1 − a) · Regelwerk + a · eigene Daten,   a = n / (n + 10)
//
// n = Zahl ähnlicher Ansitze an diesem Sitz (gewichtet nach Ähnlichkeit).
// Mit wenigen eigenen Ansitzen zählt vor allem das Regelwerk, mit vielen vor allem die eigene Erfahrung.
// Keine „künstliche Intelligenz“, sondern nachvollziehbare Statistik.
import type { Facility } from '../db/db'
import { angleDiff, COMPASS_8, compass8 } from '../lib/geo'
import type { DayPeriod, Hunt, HuntEnv, PressureTrend, Sighting } from './hunt'
import { evaluateRules, ruleScore, windFromOf, type Reason, type RuleContext } from './rules'

/** Ab wie vielen ähnlichen Ansitzen die eigenen Daten die Hälfte ausmachen */
export const OWN_DATA_HALF = 10

// ---------- Ergebnis eines Ansitzes ----------

export type OutcomeKind = 'erlegt' | 'anblick' | 'anderes' | 'nichts'

export interface Outcome {
  kind: OutcomeKind
  /** 0–100 */
  score: number
}

/**
 * Wie erfolgreich war ein Ansitz für die Zielwildart?
 * erlegt 100 · Anblick 70 (ab 3 Stück 80) · nur anderes Wild 35 · nichts 10.
 * Eine eigene Sterne-Bewertung fließt zu 30 % mit ein.
 */
export function outcomeOf(h: Hunt, huntSightings: Sighting[], speciesId: string | null): Outcome {
  const match = (id: string) => !speciesId || id === speciesId
  let kind: OutcomeKind = 'nichts'
  let score = 10
  if (h.kills.some((k) => match(k.speciesId))) {
    kind = 'erlegt'
    score = 100
  } else {
    const seen = huntSightings.filter((s) => match(s.speciesId))
    if (seen.length) {
      kind = 'anblick'
      score = seen.reduce((a, s) => a + s.count, 0) >= 3 ? 80 : 70
    } else if (huntSightings.length || h.kills.length) {
      kind = 'anderes'
      score = 35
    }
  }
  if (h.rating != null) score = Math.round(0.7 * score + 0.3 * ((h.rating - 1) / 4) * 100)
  return { kind, score }
}

// ---------- Ähnlichkeit ----------

function periodSim(a: DayPeriod, b: DayPeriod) {
  if (a === b) return 1
  const dawnDusk = new Set<DayPeriod>(['Morgen', 'Abend'])
  return dawnDusk.has(a) && dawnDusk.has(b) ? 0.5 : 0.25
}

/** Wie ähnlich sind die Bedingungen zweier Ansitze? 0 … 1 */
export function similarity(plan: HuntEnv, past: HuntEnv): number {
  let w = periodSim(plan.sun.period, past.sun.period)
  const a = windFromOf(plan)
  const b = windFromOf(past)
  if (a != null && b != null) {
    const d = angleDiff(a, b)
    w *= d <= 45 ? 1 : d <= 90 ? 0.6 : 0.2
  } else w *= 0.6
  w *= plan.calendar.season === past.calendar.season ? 1 : 0.6
  if (plan.sun.period === 'Nacht' || plan.sun.period === 'Abend') {
    w *= Math.abs(plan.moon.illumination - past.moon.illumination) <= 30 ? 1 : 0.7
  }
  const pa = plan.weather?.pressureTrend
  const pb = past.weather?.pressureTrend
  if (pa && pb) w *= pa === pb ? 1 : 0.85
  return w
}

// ---------- Bewertung eines Sitzes ----------

export interface OwnData {
  /** Zahl aller Ansitze an diesem Sitz */
  total: number
  /** Gewichtete Zahl ähnlicher Ansitze */
  n: number
  /** Mittlerer Erfolg der ähnlichen Ansitze (0–100) oder null */
  score: number | null
  /** Anteil der eigenen Daten an der Gesamtpunktzahl (0–1) */
  share: number
  erlegt: number
  anblick: number
}

export interface StandRating {
  stand: Facility
  score: number
  rules: number
  reasons: Reason[]
  own: OwnData
}

export function ownDataFor(stand: Facility, env: HuntEnv, hunts: Hunt[], byHunt: Map<string, Sighting[]>, speciesId: string | null, before: number): OwnData {
  let n = 0
  let sum = 0
  let total = 0
  let erlegt = 0
  let anblick = 0
  for (const h of hunts) {
    if (h.standId !== stand.id || h.status !== 'done' || !h.env || h.start >= before) continue
    total++
    const o = outcomeOf(h, byHunt.get(h.id) ?? [], speciesId)
    if (o.kind === 'erlegt') erlegt++
    if (o.kind === 'anblick') anblick++
    const w = similarity(env, h.env)
    n += w
    sum += w * o.score
  }
  const share = n / (n + OWN_DATA_HALF)
  return { total, n: Math.round(n * 10) / 10, score: n > 0 ? Math.round(sum / n) : null, share, erlegt, anblick }
}

export function groupByHunt(sightings: Sighting[]) {
  const m = new Map<string, Sighting[]>()
  for (const s of sightings) if (s.huntId) m.set(s.huntId, [...(m.get(s.huntId) ?? []), s])
  return m
}

/** Alle Sitze bewerten und nach Punkten sortieren */
export function rateStands(stands: Facility[], ctx: RuleContext): StandRating[] {
  const byHunt = groupByHunt(ctx.sightings)
  return stands
    .map((stand) => {
      const reasons = evaluateRules(stand, ctx)
      const rules = ruleScore(reasons)
      const own = ownDataFor(stand, ctx.env, ctx.hunts, byHunt, ctx.speciesId, ctx.start)
      const score = own.score == null ? rules : Math.round((1 - own.share) * rules + own.share * own.score)
      reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      return { stand, score, rules, reasons, own }
    })
    .sort((a, b) => b.score - a.score)
}

// ---------- Statistik ----------

export interface StatRow {
  key: string
  label: string
  hunts: number
  /** Anteil Ansitze mit Anblick der Zielwildart (oder Erlegung), 0–100 */
  anblickQuote: number
  erlegt: number
  /** Mittlerer Erfolg 0–100 */
  avg: number
}

function row(key: string, label: string, list: { o: Outcome }[]): StatRow {
  const hunts = list.length
  const hit = list.filter((x) => x.o.kind === 'erlegt' || x.o.kind === 'anblick').length
  return {
    key,
    label,
    hunts,
    anblickQuote: hunts ? Math.round((hit / hunts) * 100) : 0,
    erlegt: list.filter((x) => x.o.kind === 'erlegt').length,
    avg: hunts ? Math.round(list.reduce((a, x) => a + x.o.score, 0) / hunts) : 0,
  }
}

export type StatGroup = 'sitz' | 'tageszeit' | 'wind' | 'mond' | 'luftdruck' | 'monat'

const MOON_GROUPS = [
  { key: 'dunkel', label: 'Dunkel (< 25 %)', test: (i: number) => i < 25 },
  { key: 'halb', label: 'Halbmond (25–74 %)', test: (i: number) => i >= 25 && i < 75 },
  { key: 'hell', label: 'Hell (≥ 75 %)', test: (i: number) => i >= 75 },
]
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const PERIODS: DayPeriod[] = ['Morgen', 'Tag', 'Abend', 'Nacht']
const TRENDS: PressureTrend[] = ['steigend', 'gleichbleibend', 'fallend']

/** Statistik der eigenen Ansitze, gruppiert nach Sitz, Tageszeit, Wind, Mond, Luftdruck oder Monat */
export function huntStats(hunts: Hunt[], sightings: Sighting[], speciesId: string | null, group: StatGroup, stands: Facility[] = []): StatRow[] {
  const byHunt = groupByHunt(sightings)
  const done = hunts.filter((h) => h.status === 'done').map((h) => ({ h, o: outcomeOf(h, byHunt.get(h.id) ?? [], speciesId) }))
  const groups = new Map<string, { label: string; list: typeof done }>()
  const put = (key: string, label: string, x: (typeof done)[number]) => {
    const g = groups.get(key) ?? { label, list: [] }
    g.list.push(x)
    groups.set(key, g)
  }
  for (const x of done) {
    const env = x.h.env
    if (group === 'sitz') put(x.h.standId ?? `frei:${x.h.standName}`, stands.find((s) => s.id === x.h.standId)?.name ?? x.h.standName, x)
    else if (!env) continue
    else if (group === 'tageszeit') put(env.sun.period, env.sun.period, x)
    else if (group === 'wind') {
      const d = windFromOf(env)
      if (d != null) put(compass8(d), `aus ${compass8(d)}`, x)
    } else if (group === 'mond') {
      const g = MOON_GROUPS.find((m) => m.test(env.moon.illumination))!
      put(g.key, g.label, x)
    } else if (group === 'luftdruck') {
      if (env.weather?.pressureTrend) put(env.weather.pressureTrend, env.weather.pressureTrend, x)
    } else if (group === 'monat') put(String(env.calendar.month), MONTHS[env.calendar.month - 1], x)
  }
  const rows = [...groups.entries()].map(([k, g]) => row(k, g.label, g.list))
  const order =
    group === 'tageszeit'
      ? (r: StatRow) => PERIODS.indexOf(r.key as DayPeriod)
      : group === 'wind'
        ? (r: StatRow) => COMPASS_8.indexOf(r.key as (typeof COMPASS_8)[number])
        : group === 'mond'
          ? (r: StatRow) => MOON_GROUPS.findIndex((m) => m.key === r.key)
          : group === 'luftdruck'
            ? (r: StatRow) => TRENDS.indexOf(r.key as PressureTrend)
            : group === 'monat'
              ? (r: StatRow) => Number(r.key)
              : (r: StatRow) => -r.avg
  return rows.sort((a, b) => order(a) - order(b))
}

/**
 * Bester Wind je Sitz aus den eigenen Ansitzen: höchste Anblick-Quote (bei Gleichstand höherer Ø-Erfolg),
 * mind. 2 Ansitze je Richtung. Ohne einen einzigen Anblick gibt es keinen „besten“ Wind.
 */
export function bestWindFor(standId: string, hunts: Hunt[], sightings: Sighting[], speciesId: string | null) {
  const rows = huntStats(
    hunts.filter((h) => h.standId === standId),
    sightings,
    speciesId,
    'wind',
  ).filter((r) => r.hunts >= 2 && r.anblickQuote > 0)
  if (!rows.length) return null
  return rows.reduce((a, b) => (b.anblickQuote > a.anblickQuote || (b.anblickQuote === a.anblickQuote && b.avg > a.avg) ? b : a))
}
