// Regelwerk des Kombinations-Assistenten.
// „Erfolgreich wird nur, wer kombinieren kann“: Wind, Tageszeit, Mond, Luftdruck, Regen,
// Umfeld des Sitzes und letzte Anblicke werden je Sitz zu 0–100 Punkten verrechnet.
//
// ALLE Regeln sind Vorschläge aus allgemeiner Jagdpraxis – bitte prüfen und im Regelwerk
// (Assistent → Regelwerk) abschwächen, verstärken oder ausschalten.
import type { Facility } from '../db/db'
import { angleDiff, bearing, distance, fromPos, type LatLng } from '../lib/geo'
import type { FacilityType } from './facilityTypes'
import type { DayPeriod, Hunt, HuntEnv, Sighting } from './hunt'
import { analyzeScent, CALM_WIND_KMH } from './scent'
import { shootingField } from './shootingField'
import { periodOf } from './sightings'

// ---------- Wildarten-Profile ----------

export interface SpeciesProfile {
  /** Aktivität je Tageszeit, 0 (kaum) … 1 (Hauptaktivität) */
  activity: Record<DayPeriod, number>
  /** Überwiegend nachtaktiv → Mondlicht ist für den Ansitz wichtig */
  night: boolean
  /** Einrichtungen/Flächen, die diese Wildart anziehen */
  attractors: FacilityType[]
  /** Monate, in denen die Wildart besonders gut zu bejagen ist */
  peakMonths: number[]
  peakText: string
}

export const SPECIES_PROFILES: Record<string, SpeciesProfile> = {
  rehwild: {
    activity: { Morgen: 1, Abend: 1, Tag: 0.3, Nacht: 0.4 },
    night: false,
    attractors: ['aesung', 'feld', 'salzlecke', 'wechsel'],
    peakMonths: [5, 7, 8],
    peakText: 'Mai (Bockjagd) und Blattzeit im Juli/August',
  },
  schwarzwild: {
    activity: { Morgen: 0.4, Abend: 0.7, Tag: 0.1, Nacht: 1 },
    night: true,
    attractors: ['kirrung', 'suhle', 'feld', 'wechsel'],
    peakMonths: [7, 8, 9],
    peakText: 'Sommer – Sauen gehen ins Getreide und in den Mais',
  },
  rotwild: {
    activity: { Morgen: 0.8, Abend: 0.9, Tag: 0.2, Nacht: 0.7 },
    night: false,
    attractors: ['aesung', 'feld', 'wechsel', 'suhle', 'salzlecke'],
    peakMonths: [9, 10],
    peakText: 'Brunft im September/Oktober',
  },
  damwild: {
    activity: { Morgen: 0.8, Abend: 0.9, Tag: 0.3, Nacht: 0.6 },
    night: false,
    attractors: ['aesung', 'feld', 'wechsel', 'salzlecke'],
    peakMonths: [10, 11],
    peakText: 'Brunft im Oktober/November',
  },
  fuchs: {
    activity: { Morgen: 0.5, Abend: 0.7, Tag: 0.2, Nacht: 1 },
    night: true,
    attractors: ['feld', 'aesung', 'wechsel', 'kirrung'],
    peakMonths: [1, 2],
    peakText: 'Ranz im Januar/Februar',
  },
  dachs: {
    activity: { Morgen: 0.2, Abend: 0.6, Tag: 0, Nacht: 1 },
    night: true,
    attractors: ['feld', 'wechsel', 'kirrung'],
    peakMonths: [],
    peakText: '',
  },
  waschbaer: {
    activity: { Morgen: 0.2, Abend: 0.5, Tag: 0, Nacht: 1 },
    night: true,
    attractors: ['kirrung', 'suhle', 'wechsel'],
    peakMonths: [],
    peakText: '',
  },
  hase: {
    activity: { Morgen: 0.8, Abend: 0.9, Tag: 0.4, Nacht: 0.6 },
    night: false,
    attractors: ['feld', 'aesung'],
    peakMonths: [],
    peakText: '',
  },
  wildgaense: {
    activity: { Morgen: 1, Abend: 0.8, Tag: 0.5, Nacht: 0.1 },
    night: false,
    attractors: ['feld'],
    peakMonths: [10, 11, 12, 1],
    peakText: 'Herbst und Winter (Zugzeit)',
  },
  wildenten: {
    activity: { Morgen: 1, Abend: 1, Tag: 0.3, Nacht: 0.4 },
    night: false,
    attractors: ['suhle'],
    peakMonths: [9, 10, 11, 12],
    peakText: 'Herbst und Winter',
  },
}

/** Ohne Zielwildart: allgemeine Annahmen für Schalenwild */
const GENERIC: SpeciesProfile = {
  activity: { Morgen: 0.9, Abend: 1, Tag: 0.3, Nacht: 0.6 },
  night: false,
  attractors: ['aesung', 'feld', 'kirrung', 'salzlecke', 'wechsel', 'suhle'],
  peakMonths: [],
  peakText: '',
}

export const profileOf = (speciesId: string | null) => (speciesId && SPECIES_PROFILES[speciesId]) || GENERIC

// ---------- Regeln ----------

export type RuleId = 'wind' | 'tageszeit' | 'mond' | 'luftdruck' | 'niederschlag' | 'sturm' | 'umfeld' | 'jahreszeit' | 'anblicke' | 'ruhe'

export interface RuleDef {
  id: RuleId
  label: string
  description: string
}

export const RULES: RuleDef[] = [
  { id: 'wind', label: 'Wind & Witterung', description: 'Zieht deine Witterung über Wechsel, Kirrung oder Einstand? Wind von vorn ist gut, von hinten schlecht.' },
  { id: 'tageszeit', label: 'Tageszeit', description: 'Ist die Zielwildart zu dieser Tageszeit aktiv (z. B. Rehwild morgens und abends, Sauen nachts)?' },
  { id: 'mond', label: 'Mondlicht', description: 'Nachts: Heller Mond am Himmel gibt Büchsenlicht für Sauen & Fuchs. Bei Vollmond äst Rehwild nachts – morgens oft weniger Anblick.' },
  { id: 'luftdruck', label: 'Luftdruck', description: 'Steigender oder hoher Luftdruck: Wild bewegt sich ruhig. Stark fallender Luftdruck (Wetterumschwung): eher unruhig.' },
  { id: 'niederschlag', label: 'Regen', description: 'Bei Regen weniger Anblick. Nach Regen zieht Wild oft früh und gern aus.' },
  { id: 'sturm', label: 'Sturm & Böen', description: 'Bei viel Wind ist Wild unruhig, hört schlecht und bleibt oft in der Deckung.' },
  { id: 'umfeld', label: 'Umfeld des Sitzes', description: 'Liegen Äsung, Feld, Kirrung, Salzlecke oder Wechsel der Zielwildart im Schussfeld des Sitzes (ohne eingetragenes Schussfeld: rundum bis 250 m)?' },
  { id: 'jahreszeit', label: 'Jahreszeit', description: 'Besonders gute Zeiten der Wildart (z. B. Blattzeit, Brunft, Sauen im Mais).' },
  { id: 'anblicke', label: 'Letzte Anblicke', description: 'Wurde die Zielwildart in den letzten 6 Wochen nahe am Sitz (bis 300 m) zur gleichen Tageszeit gesehen?' },
  { id: 'ruhe', label: 'Ruhe am Sitz', description: 'Wurde der Sitz gerade erst besetzt? Häufiges Ansitzen beunruhigt das Wild.' },
]

/** Stärke einer Regel: 0 = aus, 0.5 = schwach, 1 = normal, 1.5 = stark */
export type RuleStrength = 0 | 0.5 | 1 | 1.5
export type RuleSettings = Partial<Record<RuleId, RuleStrength>>
export const STRENGTHS: { value: RuleStrength; label: string }[] = [
  { value: 0, label: 'Aus' },
  { value: 0.5, label: 'Schwach' },
  { value: 1, label: 'Normal' },
  { value: 1.5, label: 'Stark' },
]

export interface Reason {
  rule: RuleId
  /** Punkte (positiv = spricht dafür) – bereits mit der Regelstärke verrechnet */
  points: number
  text: string
}

export interface RuleContext {
  /** Geplanter Beginn */
  start: number
  env: HuntEnv
  /** Zielwildart (null = alle) */
  speciesId: string | null
  speciesName?: string
  facilities: Facility[]
  sightings: Sighting[]
  hunts: Hunt[]
  scentLength: number
  scentWidth: number
  settings: RuleSettings
}

/** Ausgangswert, von dem die Regeln aus nach oben oder unten gehen */
export const BASE_SCORE = 50

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
/** Zahl mit deutschem Komma */
const de = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const DAY = 86400000

/** Windrichtung (woher) – Mittel über den Ansitz, sonst bei Beginn */
export const windFromOf = (env: HuntEnv) => env.weather?.windDirectionAvg ?? env.weather?.windDirection ?? null
export const windSpeedOf = (env: HuntEnv) => env.weather?.windSpeedAvg ?? env.weather?.windSpeed ?? null

/**
 * Liegt ein Punkt im Schussfeld des Sitzes? Nutzt Winkel und Reichweite des Schussfelds
 * (mind. ±30° und 50 m Spielraum, weil Flächen oft knapp daneben beginnen).
 * Ohne Schussfeld: rundum bis 250 m.
 */
function inView(stand: Facility, from: LatLng, p: LatLng) {
  const field = shootingField(stand)
  if (!field) return distance(from, p) <= 250
  if (distance(from, p) > field.range + 50) return false
  if (field.round) return true
  return angleDiff(bearing(from, p), field.mid) <= Math.max(30, field.width / 2)
}

function samplePoints(f: Facility): LatLng[] {
  const g = f.geometry
  if (g.type === 'Point') return [fromPos(g.coordinates)]
  const pts = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates).map(fromPos)
  const c = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length }
  return [...pts, c]
}

/** Alle Regeln für einen Sitz – ergibt Begründungen mit Punkten */
export function evaluateRules(stand: Facility, ctx: RuleContext): Reason[] {
  const out: Reason[] = []
  const pos = stand.geometry.type === 'Point' ? fromPos(stand.geometry.coordinates) : null
  if (!pos) return out
  const { env } = ctx
  const prof = profileOf(ctx.speciesId)
  const who = ctx.speciesName ?? 'Wild'
  const period = env.sun.period
  const w = env.weather
  const strength = (id: RuleId) => ctx.settings[id] ?? 1
  const add = (rule: RuleId, points: number, text: string) => {
    const s = strength(rule)
    if (s === 0 || points === 0) return
    out.push({ rule, points: Math.round(points * s), text })
  }

  // --- Wind & Witterung ---
  const windFrom = windFromOf(env)
  const field = shootingField(stand)
  // Bei „Rundum“ gibt es kein vorn/hinten
  const facing = field && !field.round ? field.mid : null
  if (windFrom != null) {
    const scent = analyzeScent(
      {
        stand: pos,
        standBearing: facing,
        windFrom,
        windSpeed: windSpeedOf(env),
        gusts: w?.gustsMax ?? null,
        length: ctx.scentLength,
        width: ctx.scentWidth,
      },
      ctx.facilities,
      stand.id,
    )
    const hits = scent.messages.filter((m) => m.severity === 'warn' && m.facilityId)
    if (hits.length) {
      add('wind', -Math.min(30, 14 * hits.length), hits.map((m) => m.text).join(' '))
    } else {
      const aesung = scent.messages.filter((m) => m.severity === 'hint' && m.facilityId)
      if (aesung.length) add('wind', -5, aesung[0].text)
      else add('wind', 8, scent.messages.find((m) => m.severity === 'good' && !m.text.includes('von vorn'))?.text ?? 'Witterung zieht nicht über bekannte Wechsel oder Einstände.')
    }
    if (facing != null) {
      const d = angleDiff(windFrom, facing)
      if (d <= 45) add('wind', 8, 'Wind kommt von vorn – Witterung zieht vom Schussfeld weg.')
      else if (d >= 135) add('wind', -15, 'Wind kommt von hinten – Witterung zieht ins Schussfeld.')
    }
    const speed = windSpeedOf(env)
    if (speed != null && speed < CALM_WIND_KMH) add('wind', -5, 'Kaum Wind – die Luft kann umlaufen, Witterung ist schwer einzuschätzen.')
  }

  // --- Tageszeit ---
  const act = prof.activity[period]
  add('tageszeit', (act - 0.5) * 30, `${who} ist ${period === 'Tag' ? 'tagsüber' : period === 'Nacht' ? 'nachts' : period === 'Morgen' ? 'morgens' : 'abends'} ${act >= 0.8 ? 'sehr aktiv' : act >= 0.5 ? 'mäßig aktiv' : 'wenig aktiv'}.`)

  // --- Mondlicht ---
  const dark = period === 'Nacht' || (period === 'Abend' && (env.sun.endMinFromSunset ?? -999) > 30)
  if (dark && prof.night) {
    if (env.moon.illumination >= 60 && env.moon.upPercent >= 40) add('mond', 12, `Heller Mond (${env.moon.illumination} %) steht am Himmel – gutes Büchsenlicht.`)
    else if (env.moon.illumination < 25 || env.moon.upPercent < 20) add('mond', -10, 'Dunkle Nacht (wenig Mondlicht) – Ansprechen schwierig.')
  }
  if (!prof.night && period === 'Morgen' && env.moon.illumination >= 85) {
    add('mond', -5, 'Vollmondnacht davor: Wild hat nachts geäst, morgens oft weniger Anblick.')
  }

  // --- Luftdruck ---
  if (w) {
    if (w.pressureDelta12h != null && w.pressureDelta12h <= -5) add('luftdruck', -8, `Luftdruck fällt stark (${de(w.pressureDelta12h)} hPa in 12 h) – Wetterumschwung, Wild oft unruhig.`)
    else if (w.pressureTrend === 'steigend') add('luftdruck', 6, 'Luftdruck steigt – Wild bewegt sich meist ruhig und vertraut.')
    else if (w.pressureTrend === 'gleichbleibend' && (w.pressure ?? 0) >= 1018) add('luftdruck', 4, 'Stabiles Hochdruckwetter.')
  }

  // --- Regen ---
  if (w) {
    if ((w.precipitation ?? 0) >= 1) add('niederschlag', -12, `Regen während des Ansitzes (${de(w.precipitation!)} mm) – weniger Anblick, schlechte Sicht.`)
    else if ((w.precipitation24h ?? 0) >= 2) add('niederschlag', 8, `Nach Regen (${de(w.precipitation24h!)} mm in 24 h) zieht Wild oft früh aus.`)
  }

  // --- Sturm ---
  if (w) {
    const g = w.gustsMax ?? 0
    const s = windSpeedOf(env) ?? 0
    if (g >= 40) add('sturm', -12, `Starke Böen bis ${Math.round(g)} km/h – Wild ist unruhig und bleibt in der Deckung.`)
    else if (s >= 30) add('sturm', -8, `Kräftiger Wind (${Math.round(s)} km/h) – Wild ist unruhig.`)
  }

  // --- Umfeld ---
  const nearby = ctx.facilities.filter(
    (f) => f.id !== stand.id && prof.attractors.includes(f.type) && samplePoints(f).some((p) => inView(stand, pos, p)),
  )
  if (nearby.length) {
    const names = nearby.slice(0, 3).map((f) => f.name || f.type)
    add('umfeld', Math.min(15, 6 * nearby.length), `Im Schussfeld: ${names.join(', ')}${nearby.length > 3 ? ' …' : ''}.`)
  } else {
    add('umfeld', -5, `Keine passende Äsung, Kirrung oder Wechsel für ${who} im Schussfeld eingetragen.`)
  }

  // --- Jahreszeit ---
  if (prof.peakMonths.includes(env.calendar.month)) add('jahreszeit', 8, `Gute Zeit für ${who}: ${prof.peakText}.`)

  // --- Letzte Anblicke ---
  const since = ctx.start - 42 * DAY
  const seen = ctx.sightings.filter(
    (s) =>
      s.time >= since &&
      s.time <= ctx.start &&
      (!ctx.speciesId || s.speciesId === ctx.speciesId) &&
      distance(pos, { lat: s.lat, lng: s.lng }) <= 300 &&
      periodOf(s) === period,
  )
  const n = seen.length
  if (n >= 5) add('anblicke', 12, `${n} Anblicke von ${who} nahe dem Sitz in den letzten 6 Wochen zur gleichen Tageszeit.`)
  else if (n >= 2) add('anblicke', 7, `${n} Anblicke von ${who} nahe dem Sitz in den letzten 6 Wochen.`)
  else if (n === 1) add('anblicke', 3, `1 Anblick von ${who} nahe dem Sitz in den letzten 6 Wochen.`)

  // --- Ruhe am Sitz ---
  // Nur Ansitze, die vor dem geplanten Beginn zu Ende waren
  const before = ctx.hunts.filter((h) => h.standId === stand.id && h.status === 'done' && h.end != null && h.end <= ctx.start)
  const recent48 = before.filter((h) => ctx.start - h.end! < 2 * DAY)
  const recent7 = before.filter((h) => ctx.start - h.end! < 7 * DAY)
  if (recent48.length) add('ruhe', -10, 'Sitz wurde in den letzten 2 Tagen besetzt – Wild kann noch beunruhigt sein.')
  else if (recent7.length >= 3) add('ruhe', -6, `Sitz wurde diese Woche schon ${recent7.length}× besetzt.`)

  return out
}

/** Punkte aus dem Regelwerk (0–100) */
export function ruleScore(reasons: Reason[]): number {
  return Math.round(clamp(BASE_SCORE + reasons.reduce((a, r) => a + r.points, 0), 0, 100))
}
