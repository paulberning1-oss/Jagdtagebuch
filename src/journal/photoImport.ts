// Handschriftliche Tagebuchseiten → Ansitze (Foto-Import). Die KI liest die Seiten (Aufgabe „foto“),
// hier wird daraus ein prüfbarer Entwurf und danach ein normaler Tagebucheintrag mit Sichtungen und Erlegungen.
// Was die KI nicht zuordnen konnte, landet wörtlich in den Notizen – es geht nichts verloren.
import type { FotoEintrag, FotoTagebuch } from '../../supabase/functions/ki/schemas'
import type { Facility } from '../db/db'
import { typeInfo } from '../domain/facilityTypes'
import { DISTURBANCES, type Hunt, type HuntOverrides, type Kill, type Sighting } from '../domain/hunt'
import { BEHAVIORS, type Species } from '../domain/species'
import { fromPos, type LatLng } from '../lib/geo'
import { newId } from '../lib/id'
import { fromBerlinLocal, toBerlinDate } from '../lib/time'
import { baseHunt } from './huntActions'

export interface ImportContext {
  stands: Facility[]
  species: Species[]
  /** Ort für Einträge ohne Sitz (z. B. Mitte der eigenen Sitze) */
  fallbackPos: LatLng | null
  now: number
}

export interface DraftHunt {
  key: string
  entry: FotoEintrag
  /** änderbar in der Vorschau */
  date: string
  from: string
  to: string
  standId: string
  /** Hinweise für den Nutzer (Annahmen, Unklarheiten) */
  notes: string[]
  /** Hinderungsgrund – dann nicht speicherbar */
  blocker: string | null
  selected: boolean
}

const WIND_DEG: Record<string, number> = { N: 0, NO: 45, O: 90, SO: 135, S: 180, SW: 225, W: 270, NW: 315 }
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const isTime = (s: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s)
const pad = (s: string) => (s.length === 4 ? `0${s}` : s)
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Sitz zu einem Eintrag finden: Kennung, sonst Name (gleich bzw. enthalten) */
export function matchStand(e: Pick<FotoEintrag, 'sitz_id' | 'sitz_text'>, stands: Facility[]): Facility | undefined {
  const byId = stands.find((s) => s.id === e.sitz_id)
  if (byId) return byId
  const t = norm(e.sitz_text)
  if (!t) return undefined
  return stands.find((s) => norm(s.name) === t) ?? stands.find((s) => s.name && (norm(s.name).includes(t) || t.includes(norm(s.name))))
}

/** Beginn/Ende als Zeitstempel (Ende vor Beginn = über Mitternacht) */
export function timesOf(date: string, from: string, to: string): { start: number; end: number } {
  const start = fromBerlinLocal(`${date}T${pad(from)}`).getTime()
  let end = fromBerlinLocal(`${date}T${pad(to)}`).getTime()
  if (end <= start) end += 86400000
  return { start, end }
}

/** Einträge der KI → Entwürfe mit Annahmen und Hinweisen */
export function toDrafts(t: FotoTagebuch, ctx: ImportContext, existing: Pick<Hunt, 'start' | 'standId' | 'standName'>[] = []): DraftHunt[] {
  return t.eintraege.map((e, i) => {
    const notes: string[] = []
    let blocker: string | null = null
    let from = isTime(e.beginn) ? pad(e.beginn) : ''
    let to = isTime(e.ende) ? pad(e.ende) : ''
    if (!from && !to) {
      from = '17:00'
      to = '19:00'
      notes.push('Uhrzeit nicht notiert – 17:00–19:00 angenommen, bitte anpassen.')
    } else if (!to) {
      to = shift(from, 120)
      notes.push('Ende nicht notiert – 2 Stunden angenommen.')
    } else if (!from) {
      from = shift(to, -120)
      notes.push('Beginn nicht notiert – 2 Stunden vor dem Ende angenommen.')
    }
    const stand = matchStand(e, ctx.stands)
    if (!stand) {
      if (e.sitz_text) notes.push(`Sitz „${e.sitz_text}“ nicht zugeordnet – bitte wählen.`)
      if (!ctx.fallbackPos) blocker = 'Bitte einen Sitz wählen.'
    }
    if (!isDate(e.datum)) blocker = `Datum nicht lesbar („${e.datum || '–'}“) – bitte eintragen.`
    else {
      const { start, end } = timesOf(e.datum, from, to)
      if (end > ctx.now + 5 * 60000) blocker = 'Liegt in der Zukunft – Datum prüfen.'
      const day = e.datum
      const dup = existing.find(
        (h) => toBerlinDate(new Date(h.start)) === day && Math.abs(h.start - start) < 3 * 3600000 && (!stand || h.standId === stand.id),
      )
      if (dup) notes.push(`Ähnlicher Eintrag schon im Tagebuch (${dup.standName}) – doppelt?`)
    }
    if (e.unsicher) notes.push(`Schwer lesbar: ${e.unsicher}`)
    const dupFound = notes.some((n) => n.startsWith('Ähnlicher Eintrag'))
    return { key: String(i), entry: e, date: e.datum, from, to, standId: stand?.id ?? '', notes, blocker, selected: !blocker && !dupFound }
  })
}

function shift(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Prüft einen (ggf. geänderten) Entwurf erneut: Datum, Zeit, Ort */
export function draftBlocker(d: DraftHunt, ctx: ImportContext): string | null {
  if (!isDate(d.date)) return 'Datum fehlt oder ist ungültig.'
  if (!isTime(d.from) || !isTime(d.to)) return 'Uhrzeit fehlt oder ist ungültig.'
  if (!d.standId && !ctx.fallbackPos) return 'Bitte einen Sitz wählen.'
  if (timesOf(d.date, d.from, d.to).end > ctx.now + 5 * 60000) return 'Liegt in der Zukunft – Datum prüfen.'
  return null
}

/** Entwurf → Ansitz + Sichtungen (noch nicht gespeichert) */
export function draftToRecords(d: DraftHunt, ctx: ImportContext): { hunt: Hunt; sightings: Sighting[] } {
  const e = d.entry
  const stand = ctx.stands.find((s) => s.id === d.standId)
  const { start, end } = timesOf(d.date, d.from, d.to)
  const h = baseHunt(stand ? { stand } : { pos: ctx.fallbackPos!, name: e.sitz_text || 'Ohne festen Sitz' }, start, end)
  const pos = stand && stand.geometry.type === 'Point' ? fromPos(stand.geometry.coordinates) : ctx.fallbackPos!
  const speciesIds = new Set(ctx.species.map((s) => s.id))
  const speciesByName = new Map(ctx.species.map((s) => [norm(s.name), s.id]))
  const sid = (id: string, text: string) => (speciesIds.has(id) ? id : (speciesByName.get(norm(text)) ?? null))
  const at = (hhmm: string, fallback: number) => {
    if (!isTime(hhmm)) return fallback
    let t = fromBerlinLocal(`${d.date}T${pad(hhmm)}`).getTime()
    if (t < start - 3600000) t += 86400000 // nach Mitternacht
    return t
  }
  const mid = start + Math.round((end - start) / 2)
  const extra: string[] = []

  // Erlegungen
  const kills: Kill[] = []
  for (const k of e.erlegt) {
    const speciesId = sid(k.wildart_id, k.wildart_text)
    if (!speciesId) {
      extra.push(`Erlegt (Wildart nicht in deiner Liste): ${[k.wildart_text, k.geschlecht_alter, k.uhrzeit].filter(Boolean).join(', ')}`)
      continue
    }
    kills.push({ id: newId(), speciesId, sexAge: k.geschlecht_alter, time: at(k.uhrzeit, end), lat: pos.lat, lng: pos.lng, weightKg: k.gewicht_kg > 0 ? k.gewicht_kg : null })
  }

  // Sichtungen
  const sightings: Sighting[] = []
  for (const a of e.anblick) {
    const speciesId = sid(a.wildart_id, a.wildart_text)
    if (!speciesId) {
      extra.push(`Anblick (Wildart nicht in deiner Liste): ${a.anzahl} ${a.wildart_text}${a.uhrzeit ? ` ${a.uhrzeit}` : ''}${a.verhalten ? `, ${a.verhalten}` : ''}`)
      continue
    }
    const behavior = (BEHAVIORS as readonly string[]).find((b) => norm(b) === norm(a.verhalten)) ?? ''
    sightings.push({
      id: newId(),
      huntId: h.id,
      time: at(a.uhrzeit, mid),
      speciesId,
      count: a.anzahl,
      sexAge: a.geschlecht_alter,
      behavior,
      direction: null,
      lat: pos.lat,
      lng: pos.lng,
      source: 'eigen',
      notes: !behavior && a.verhalten ? a.verhalten : '',
      photoIds: [],
      createdAt: Date.now(),
    })
  }

  // Störungen: bekannte Begriffe übernehmen, Rest als „Sonstiges“ + Notiz
  const known = e.stoerungen.map((x) => DISTURBANCES.find((k) => norm(k) === norm(x)) ?? null)
  const disturbances = [...new Set(known.filter((x): x is (typeof DISTURBANCES)[number] => !!x))] as string[]
  const unknown = e.stoerungen.filter((_, i) => !known[i])
  if (unknown.length) {
    if (!disturbances.includes('Sonstiges')) disturbances.push('Sonstiges')
    extra.push(`Störungen: ${unknown.join(', ')}`)
  }

  const overrides: HuntOverrides = {}
  if (e.wind_richtung) overrides.windDirection = WIND_DEG[e.wind_richtung]
  if (e.wind_kmh >= 0) overrides.windSpeed = e.wind_kmh
  if (e.temperatur_c > -99) overrides.temperature = e.temperatur_c

  const hunt: Hunt = {
    ...h,
    huntType: e.jagdart,
    targetSpecies: e.zielwildarten.filter((x) => speciesIds.has(x)),
    kills,
    success: kills.length > 0,
    disturbances,
    rating: e.sterne >= 1 && e.sterne <= 5 ? e.sterne : null,
    activity: e.aktivitaet >= 1 && e.aktivitaet <= 5 ? e.aktivitaet : null,
    conclusion: e.fazit || undefined,
    mistakes: e.fehler || undefined,
    notes: [e.wetter_text && `Wetter laut Notiz: ${e.wetter_text}`, e.notizen, ...extra, '(Aus Foto übernommen)'].filter(Boolean).join('\n'),
    ...(Object.keys(overrides).length ? { overrides } : {}),
    demo: stand?.demo,
  }
  for (const s of sightings) s.demo = hunt.demo
  return { hunt, sightings }
}

/** Sitze zum Zuordnen (Testsitze nur, wenn es keine eigenen gibt) */
export function importStands(facilities: Facility[]): Facility[] {
  const stands = facilities.filter((f) => typeInfo(f.type).isStand && f.geometry.type === 'Point')
  const own = stands.filter((s) => !s.demo)
  return own.length ? own : stands
}

/** Text an die KI: Jahr, Listen zum Zuordnen */
export function importPrompt(ctx: ImportContext): string {
  const year = new Date(ctx.now).getFullYear()
  return [
    `Heute ist der ${new Date(ctx.now).toLocaleDateString('de-DE')}. Fehlt das Jahr auf der Seite, nimm das jüngste passende Jahr bis heute (${year} oder früher).`,
    '',
    'Sitze im Revier (Kennung – Name):',
    ...ctx.stands.map((s) => `- ${s.id} – ${s.name || typeInfo(s.type).label} (${typeInfo(s.type).label})`),
    '',
    'Wildarten (Kennung – Name: Klassen):',
    ...ctx.species.map((s) => `- ${s.id} – ${s.name}${s.sexAge.length ? `: ${s.sexAge.join(', ')}` : ''}`),
    '',
    `Verhalten: ${BEHAVIORS.join(', ')}`,
    `Störungen: ${DISTURBANCES.join(', ')}`,
    '',
    'Bitte übertrage alle Einträge auf den Fotos.',
  ].join('\n')
}
