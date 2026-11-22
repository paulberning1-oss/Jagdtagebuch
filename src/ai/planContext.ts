// Daten für die KI-Ansitzempfehlung als Text (Teilschritt 7).
//
// Zwei Teile – wegen des Prompt-Caches auf dem Server:
// - `context`: stabil (Revier, Jagdwissen, Jagdzeiten-Tabelle, Statistik) – ändert sich nur, wenn sich die Daten ändern.
//   Darf KEIN Datum/keine Uhrzeit der Anfrage enthalten.
// - `question`: alles, was vom geplanten Ansitz abhängt (Zeit, Wetter, Mond, Phasen, Punktbewertung, ähnliche Ansitze).
//
// Regeln: Testdaten (demo) nur, wenn ausdrücklich eingeschaltet. Jagdwissen nur geprüft/eigen – ungeprüftes nur auf Wunsch,
// gekennzeichnet. Jagdzeiten nur aus der eigenen Tabelle. Keine E-Mail, keine Fotos.
import type { Facility } from '../db/db'
import { checkRoutes, atText, routeLine, samplePath } from '../domain/approach'
import { groupByHunt, huntStats, outcomeOf, similarity, type StandRating, type StatGroup } from '../domain/assistant'
import { typeInfo } from '../domain/facilityTypes'
import { ACTIVITY_LEVELS, effectiveEnv, type Hunt, type HuntEnv, type Sighting } from '../domain/hunt'
import {
  allYear,
  classStateText,
  fmtMonthDay,
  inRange,
  noteWithoutSource,
  seasonOverview,
  type CalendarPhase,
  type KnowledgeEntry,
  type Season,
} from '../domain/knowledge'
import { phaseLabel } from '../domain/phases'
import { individualText } from '../domain/sightings'
import { windFromOf, windSpeedOf } from '../domain/rules'
import { inShootingField, shootingField } from '../domain/shootingField'
import { bearing, compass8, distance, fromPos, lineLength, pointInPolygon, polygonArea, type LatLng } from '../lib/geo'
import { fmtDate, fmtTime } from '../lib/time'

export interface PlanContextInput {
  start: number
  end: number
  speciesId: string | null
  speciesName: string
  env: HuntEnv
  ratings: StandRating[]
  facilities: Facility[]
  hunts: Hunt[]
  sightings: Sighting[]
  knowledge: KnowledgeEntry[]
  calendar: CalendarPhase[]
  seasons: Season[]
  speciesNames: Map<string, string>
  includeUnverified: boolean
  includeDemo: boolean
  scent: { length: number; width: number }
}

export interface PlanContext {
  context: string
  question: string
  /** Für die Anzeige „Was wird gesendet?“ */
  counts: { stands: number; objects: number; routes: number; hunts: number; similar: number; knowledge: number; seasons: number }
}

/** Objekte bis zu dieser Entfernung werden je Sitz beschrieben */
export const NEAR_M = 400
/** So viele ähnliche Ansitze gehen mit */
export const SIMILAR_MAX = 12

const r10 = (m: number) => Math.round(m / 10) * 10
const rel = (from: LatLng, to: LatLng) => {
  const d = distance(from, to)
  return d < 15 ? 'direkt dort' : `${r10(d)} m ${compass8(bearing(from, to))}`
}
const clip = (s: string | undefined | null, n = 400) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)} …` : t
}
const t = (ms: number | null | undefined) => (ms == null ? '–' : fmtTime(new Date(ms)))
const num = (x: number | null | undefined, unit: string, digits = 0) =>
  x == null ? null : `${x.toLocaleString('de-DE', { maximumFractionDigits: digits })} ${unit}`
const label = (f: Facility) => `${typeInfo(f.type).label}${f.name ? ` „${f.name}“` : ''}`

const ringOf = (f: Facility): LatLng[] => (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0].map(fromPos) : [])
const posOf = (f: Facility): LatLng | null => (f.geometry.type === 'Point' ? fromPos(f.geometry.coordinates) : null)

/** Punkte entlang eines Objekts (zum Messen von Entfernung/Richtung/Schussfeld) */
function samplesOf(f: Facility): LatLng[] {
  if (f.geometry.type === 'Point') return [fromPos(f.geometry.coordinates)]
  if (f.geometry.type === 'LineString') return samplePath(routeLine(f)).map((s) => s.p)
  const ring = ringOf(f)
  return ring.length ? samplePath([...ring, ring[0]]).map((s) => s.p) : []
}

function centroid(points: LatLng[]): LatLng {
  return { lat: points.reduce((a, p) => a + p.lat, 0) / points.length, lng: points.reduce((a, p) => a + p.lng, 0) / points.length }
}

/** Lage eines Objekts relativ zur Reviermitte */
function whereIs(f: Facility, center: LatLng): string {
  if (f.geometry.type === 'Point') return `${rel(center, fromPos(f.geometry.coordinates))} der Reviermitte`
  if (f.geometry.type === 'LineString') {
    const line = routeLine(f)
    return `Linie ${r10(lineLength(line))} m, von ${rel(center, line[0])} bis ${rel(center, line[line.length - 1])} der Reviermitte`
  }
  const ring = ringOf(f)
  const ha = polygonArea(ring) / 10000
  return `Fläche ${ha.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ha, Mitte ${rel(center, centroid(ring))} der Reviermitte`
}

function fieldText(stand: Facility): string {
  const field = shootingField(stand)
  if (!field) return 'Schussfeld nicht festgelegt'
  if (field.round) return `Schussfeld rundum, ${field.range} m`
  return `Blick nach ${compass8(field.mid)} (${Math.round(field.mid)}°), Schussfeld ${Math.round(field.width)}° breit (${Math.round(field.start)}°–${Math.round(field.end)}°), ${field.range} m weit`
}

// ---------- stabiler Teil ----------

function revierText(stands: Facility[], objects: Facility[], routes: Facility[], center: LatLng): string[] {
  const out: string[] = ['## Revier', 'Bezugspunkt ist die Reviermitte (Mittelpunkt der Sitze). Richtungen als Himmelsrichtung, Entfernungen Luftlinie. Das Revier ist flach.', '']
  for (const s of stands) {
    const p = posOf(s)!
    const field = shootingField(s)
    out.push(`### Sitz ${label(s)} [id: ${s.id}]`)
    out.push(`- Lage: ${rel(center, p)} der Reviermitte. ${fieldText(s)}.`)
    if (s.notes.trim()) out.push(`- Notiz: ${clip(s.notes, 300)}`)
    const near = objects
      .map((o) => {
        const ring = ringOf(o)
        const inside = ring.length > 2 && pointInPolygon(p, p, ring)
        const pts = samplesOf(o)
        if (!pts.length) return null
        let best = pts[0]
        for (const q of pts) if (distance(p, q) < distance(p, best)) best = q
        const d = inside ? 0 : distance(p, best)
        const inField = !!field && pts.some((q) => inShootingField(field, p, q))
        return { o, d, best, inside, inField }
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.d <= NEAR_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, 14)
    if (near.length) {
      out.push(`- In der Nähe (bis ${NEAR_M} m, nächster Punkt):`)
      for (const x of near) {
        const scent = typeInfo(x.o.type).scent
        out.push(
          `  - ${label(x.o)}: ${x.inside ? 'Sitz steht darin' : rel(p, x.best)}${x.inField ? ', im Schussfeld' : ''}${
            scent === 'warn' ? ' (witterungsempfindlich)' : ''
          }${x.o.crop ? `, Feldfrucht: ${x.o.crop}` : ''}`,
        )
      }
    } else out.push(`- Keine eingezeichneten Objekte bis ${NEAR_M} m.`)
    const rs = routes.filter((r) => r.standId === s.id)
    if (rs.length) {
      out.push('- Anmarschwege:')
      for (const r of rs) {
        const line = routeLine(r)
        out.push(`  - „${r.name || 'Anmarschweg'}“ [id: ${r.id}]: ${r10(lineLength(line))} m, Start ${rel(p, line[0])} vom Sitz${r.notes.trim() ? `. Notiz: ${clip(r.notes, 200)}` : ''}`)
      }
    } else out.push('- Kein Anmarschweg eingezeichnet.')
    out.push('')
  }
  if (objects.length) {
    out.push('### Alle weiteren Objekte')
    for (const o of objects) out.push(`- ${label(o)}: ${whereIs(o, center)}${o.crop ? `, Feldfrucht: ${o.crop}` : ''}${o.notes.trim() ? `. Notiz: ${clip(o.notes, 200)}` : ''}`)
    out.push('')
  }
  return out
}

function knowledgeText(list: KnowledgeEntry[], names: Map<string, string>, includeUnverified: boolean): string[] {
  const out = ['## Jagdwissen', includeUnverified ? 'Enthält auch UNGEPRÜFTES Wissen (markiert) – das nur vorsichtig und mit Hinweis verwenden.' : 'Nur geprüftes und eigenes Wissen des Jägers.', '']
  if (!list.length) return [...out, 'Kein passendes Wissen freigegeben.', '']
  for (const k of list) {
    const tag = k.own ? 'eigenes Wissen des Jägers' : k.status === 'geprueft' ? 'geprüft' : 'UNGEPRÜFT'
    out.push(`### ${k.title} (${k.speciesId ? (names.get(k.speciesId) ?? k.speciesId) : 'allgemein'}) [${tag}]`)
    if (k.text.trim()) out.push(clip(k.text, 1500))
    if (k.addition?.trim()) out.push(`Ergänzung${k.source ? ` (${k.source})` : ''}: ${clip(k.addition, 1500)}`)
    out.push('')
  }
  return out
}

function seasonsText(list: Season[], names: Map<string, string>, speciesName: string): string[] {
  const out = ['## Jagdzeiten-Tabelle des Jägers', 'Nur diese Angaben verwenden; maßgeblich ist das Landesjagdrecht.']
  if (!list.length) return [...out, `Für ${speciesName} nichts eingetragen.`, '']
  for (const s of list) {
    const range = s.closed ? 'keine Jagdzeit' : allYear(s.from, s.to) ? 'ganzjährig' : `${fmtMonthDay(s.from)}–${fmtMonthDay(s.to)}`
    const hint = noteWithoutSource(s.note)
    out.push(`- ${names.get(s.speciesId) ?? s.name ?? s.speciesId} – ${s.label}: ${range}${hint ? ` (${clip(hint, 200)})` : ''}`)
  }
  return [...out, '']
}

const STAT_GROUPS: [StatGroup, string][] = [
  ['sitz', 'nach Sitz'],
  ['tageszeit', 'nach Tageszeit'],
  ['wind', 'nach Windrichtung'],
  ['mond', 'nach Mondhelligkeit'],
  ['luftdruck', 'nach Luftdruck-Tendenz'],
]

function statsText(hunts: Hunt[], sightings: Sighting[], speciesId: string | null, speciesName: string, stands: Facility[]): string[] {
  const done = hunts.filter((h) => h.status === 'done')
  const out = [`## Statistik aus dem Tagebuch (Zielwildart: ${speciesName})`, `${done.length} abgeschlossene Ansitze.`]
  if (!done.length) return [...out, '']
  out.push('Anblick-Quote = Anteil der Ansitze mit Anblick oder Erlegung der Zielwildart; Ø = mittlerer Erfolg 0–100.')
  for (const [g, title] of STAT_GROUPS) {
    const rows = huntStats(done, sightings, speciesId, g, stands)
    if (!rows.length) continue
    out.push(`- ${title}: ${rows.map((r) => `${r.label} ${r.hunts}× (Anblick ${r.anblickQuote} %, erlegt ${r.erlegt}, Ø ${r.avg})`).join('; ')}`)
  }
  return [...out, '']
}

// ---------- veränderlicher Teil ----------

function conditionsText(env: HuntEnv): string[] {
  const out: string[] = []
  const s = env.sun
  out.push(
    `- Sonne: Aufgang ${t(s.sunrise)}, Untergang ${t(s.sunset)}${
      s.startMinFromSunset != null && Math.abs(s.startMinFromSunset) < 300
        ? ` (Beginn ${Math.abs(s.startMinFromSunset)} min ${s.startMinFromSunset < 0 ? 'vor' : 'nach'} Sonnenuntergang)`
        : s.startMinFromSunrise != null && Math.abs(s.startMinFromSunrise) < 300
          ? ` (Beginn ${Math.abs(s.startMinFromSunrise)} min ${s.startMinFromSunrise < 0 ? 'vor' : 'nach'} Sonnenaufgang)`
          : ''
    }. Tageszeit: ${s.period}.`,
  )
  const m = env.moon
  out.push(`- Mond: ${m.phaseName}, ${Math.round(m.illumination)} % beleuchtet, während des Ansitzes zu ${Math.round(m.upPercent)} % der Zeit am Himmel.`)
  const w = env.weather
  if (!w) out.push('- Wetter: keine Vorhersage verfügbar.')
  else {
    const from = windFromOf(env)
    const parts = [
      from != null ? `Wind aus ${compass8(from)} (${Math.round(from)}°)` : 'Wind unbekannt',
      num(windSpeedOf(env), 'km/h'),
      w.gustsMax != null ? `Böen bis ${Math.round(w.gustsMax)} km/h` : null,
      num(w.temperature, '°C', 1),
      w.humidity != null ? `Luftfeuchte ${Math.round(w.humidity)} %` : null,
      w.cloudCover != null ? `Bewölkung ${Math.round(w.cloudCover)} %` : null,
      w.pressure != null ? `Luftdruck ${Math.round(w.pressure)} hPa${w.pressureTrend ? ` ${w.pressureTrend}` : ''}${w.pressureDelta3h != null ? ` (${w.pressureDelta3h > 0 ? '+' : ''}${w.pressureDelta3h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} hPa in 3 h)` : ''}` : null,
      w.precipitation != null ? `Niederschlag ${w.precipitation.toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm/h` : null,
    ].filter(Boolean)
    out.push(`- Wetter (${w.source === 'forecast' ? 'Vorhersage' : w.source}): ${parts.join(', ')}.`)
  }
  return out
}

function huntLine(h: Hunt, sightings: Sighting[], names: Map<string, string>, facilities: Map<string, Facility>, speciesId: string | null, sim: number): string {
  const env = effectiveEnv(h)!
  const from = windFromOf(env)
  const o = outcomeOf(h, sightings, speciesId)
  const route = h.routeId ? facilities.get(h.routeId) : null
  const seen = sightings
    .map((s) => `${s.count} ${names.get(s.speciesId) ?? s.speciesId}${s.sexAge.length ? ` (${s.sexAge.join(', ')})` : ''} ${fmtTime(new Date(s.time))}${s.behavior ? ` ${s.behavior}` : ''}${s.recognition ? ` [${individualText(s)}]` : ''}`)
    .join('; ')
  const kills = h.kills.map((k) => `${names.get(k.speciesId) ?? k.speciesId}${k.sexAge ? ` (${k.sexAge})` : ''}`).join(', ')
  const parts = [
    `${fmtDate(new Date(h.start))} ${t(h.start)}–${t(h.end)} (${env.sun.period}), ${h.standName}${route ? `, Weg „${route.name || 'Anmarschweg'}“` : ''}`,
    `Wind ${from != null ? `aus ${compass8(from)}` : 'unbekannt'}${windSpeedOf(env) != null ? ` ${Math.round(windSpeedOf(env)!)} km/h` : ''}`,
    env.weather?.temperature != null ? `${Math.round(env.weather.temperature)} °C` : null,
    `Mond ${Math.round(env.moon.illumination)} %`,
    env.weather?.pressureTrend ? `Druck ${env.weather.pressureTrend}` : null,
    `Ergebnis: ${o.kind}`,
    seen ? `Anblick: ${seen}` : 'kein Anblick',
    kills ? `erlegt: ${kills}` : null,
    h.activity != null ? `Wildaktivität: ${ACTIVITY_LEVELS.find((a) => a.value === h.activity)?.label}` : null,
    h.rating != null ? `Sterne ${h.rating}/5` : null,
    h.phases?.length ? `Phase: ${h.phases.join(', ')}` : null,
    h.disturbances.length ? `Störungen: ${h.disturbances.join(', ')}` : null,
    h.conclusion?.trim() ? `Fazit: „${clip(h.conclusion)}“` : null,
    h.mistakes?.trim() ? `Fehler/nächstes Mal anders: „${clip(h.mistakes)}“` : null,
    h.notes.trim() ? `Notiz: „${clip(h.notes, 250)}“` : null,
    `Ähnlichkeit ${sim.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`,
  ]
  return `- ${parts.filter(Boolean).join(' · ')}`
}

// ---------- zusammensetzen ----------

export function buildPlanContext(i: PlanContextInput): PlanContext {
  const keep = <T extends { demo?: boolean }>(x: T) => i.includeDemo || !x.demo
  const facilities = i.facilities.filter(keep)
  const stands = facilities.filter((f) => typeInfo(f.type).isStand && f.geometry.type === 'Point')
  const routes = facilities.filter((f) => f.type === 'anmarsch' && f.geometry.type === 'LineString')
  const objects = facilities.filter((f) => !typeInfo(f.type).isStand && f.type !== 'anmarsch')
  const hunts = i.hunts.filter(keep)
  const sightings = i.sightings.filter(keep)
  const byId = new Map(facilities.map((f) => [f.id, f]))
  const center = stands.length ? centroid(stands.map((s) => posOf(s)!)) : { lat: 0, lng: 0 }
  const forTarget = <T extends { speciesId: string | null }>(x: T) => !i.speciesId || x.speciesId == null || x.speciesId === i.speciesId

  const knowledge = i.knowledge.filter((k) => forTarget(k) && (k.own || k.status === 'geprueft' || i.includeUnverified))
  const seasons = i.seasons.filter((s) => !i.speciesId || s.speciesId === i.speciesId)

  const context = [
    '# Daten des Jägers',
    i.includeDemo ? 'ACHTUNG: Enthält Testdaten (erfundenes Beispielrevier/Beispiel-Ansitze) – auf Wunsch des Jägers.' : '',
    '',
    ...revierText(stands, objects, routes, center),
    ...knowledgeText(knowledge, i.speciesNames, i.includeUnverified),
    ...seasonsText(seasons, i.speciesNames, i.speciesName),
    ...statsText(hunts, sightings, i.speciesId, i.speciesName, stands),
  ].join('\n')

  // ---- Frage ----
  const q: string[] = ['# Geplanter Ansitz']
  q.push(`- Zeit: ${fmtDate(new Date(i.start))}, ${t(i.start)}–${t(i.end)} Uhr. Zielwildart: ${i.speciesName}.`)
  q.push(...conditionsText(i.env))
  const phases = i.calendar.filter((p) => p.active !== false && forTarget(p) && inRange(p.from, p.to, i.start))
  q.push(
    phases.length
      ? `- Jagdliche Phase laut Kalender des Jägers: ${phases.map((p) => `${phaseLabel(p, i.speciesNames)} [${p.own ? 'eigen' : p.status === 'geprueft' ? 'geprüft' : 'ungeprüft'}]`).join(', ')}.`
      : '- Keine jagdliche Phase im Kalender.',
  )
  if (i.speciesId) {
    const ov = seasonOverview(seasons, i.start, i.speciesNames)[0]
    q.push(
      ov
        ? `- Jagdzeit am Tag laut Tabelle: ${ov.classes.map((c) => `${c.label}: ${classStateText(c)}`).join('; ')}.`
        : `- Jagdzeit: für ${i.speciesName} nicht in der Tabelle.`,
    )
  }

  const windFrom = windFromOf(i.env)
  q.push('', '# Punktbewertung der App (Regelwerk + eigene Statistik, 0–100)')
  const kept = i.ratings.filter((r) => keep(r.stand))
  kept.forEach((r, n) => {
    const own = r.own.total
      ? `, eigene Daten fließen zu ${Math.round(r.own.share * 100)} % ein (${r.own.n.toLocaleString('de-DE')} ähnliche von ${r.own.total} Ansitzen${r.own.score != null ? `, Ø ${r.own.score}` : ''}; ${r.own.erlegt}× erlegt, ${r.own.anblick}× Anblick)`
      : ', noch keine Ansitze hier'
    q.push(`${n + 1}. ${r.stand.name || typeInfo(r.stand.type).label} [id: ${r.stand.id}]: ${r.score} Punkte (Regelwerk ${r.rules}${own}).`)
    if (r.reasons.length) q.push(`   Gründe: ${r.reasons.map((x) => `${x.points > 0 ? '+' : '−'}${Math.abs(x.points)} ${x.text.replace(/.$/, '')}`).join('; ')}`)
    if (windFrom != null) {
      for (const c of checkRoutes(r.stand, windFrom, facilities, i.scent)) {
        q.push(
          `   Anmarschweg „${c.route.name || 'Anmarschweg'}“ [id: ${c.route.id}], ${r10(c.lengthM)} m: ${
            c.hits.length ? c.hits.map((h) => `${h.severity === 'warn' ? 'Warnung' : 'Hinweis'}: ${h.text.replace(/.$/, '')} (${atText(h.atM)})`).join('; ') : 'bei diesem Wind ohne Befund'
          }`,
        )
      }
    }
  })
  if (windFrom == null) q.push('Wind unbekannt – Anmarschwege nicht geprüft.')

  // ähnlichste Ansitze
  const byHunt = groupByHunt(sightings)
  const names = i.speciesNames
  const similar = hunts
    .filter((h) => h.status === 'done' && h.start < i.start && effectiveEnv(h))
    .map((h) => ({ h, sim: similarity(i.env, effectiveEnv(h)!) }))
    .sort((a, b) => b.sim - a.sim || b.h.start - a.h.start)
    .slice(0, SIMILAR_MAX)
  q.push('', `# Ähnlichste Ansitze aus dem Tagebuch (${similar.length} von ${hunts.filter((h) => h.status === 'done').length}, ähnlichste zuerst)`)
  if (similar.length) for (const { h, sim } of similar) q.push(huntLine(h, byHunt.get(h.id) ?? [], names, byId, i.speciesId, sim))
  else q.push('Noch keine Ansitze im Tagebuch.')
  q.push('', 'Bitte gib jetzt deine Empfehlung für diesen Ansitz.')

  return {
    context,
    question: q.join('\n'),
    counts: {
      stands: stands.length,
      objects: objects.length,
      routes: routes.length,
      hunts: hunts.filter((h) => h.status === 'done').length,
      similar: similar.length,
      knowledge: knowledge.length,
      seasons: seasons.length,
    },
  }
}
