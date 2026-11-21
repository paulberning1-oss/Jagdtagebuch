import { describe, expect, it } from 'vitest'
import { parseEmpfehlung } from '../../supabase/functions/ki/schemas'
import type { Facility } from '../db/db'
import { rateStands } from '../domain/assistant'
import { computeLocalEnv } from '../domain/environment'
import type { Hunt, HuntEnv } from '../domain/hunt'
import { DEFAULT_KNOWLEDGE } from '../domain/knowledgeDefaults'
import { destination, toPos, type LatLng } from '../lib/geo'
import { fromBerlinLocal } from '../lib/time'
import { buildPlanContext, type PlanContextInput } from './planContext'

const STAND: LatLng = { lat: 52.52, lng: 7.21 }
const P = (b: number, m: number) => destination(STAND, b, m)
const fac = (id: string, type: string, geometry: Facility['geometry'], extra: Partial<Facility> = {}): Facility => ({
  id,
  type,
  name: id,
  geometry,
  notes: '',
  photoIds: [],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
})
const point = (p: LatLng) => ({ type: 'Point' as const, coordinates: toPos(p) })
const line = (...pts: LatLng[]) => ({ type: 'LineString' as const, coordinates: pts.map(toPos) })

const sitz = fac('s1', 'kanzel', point(STAND), { name: 'Eichenkanzel', bearing: 0, fieldWidth: 90, fieldRange: 150 })
const wechsel = fac('w1', 'wechsel', line(P(300, 100), P(60, 100)), { name: 'Bruchwechsel' })
const kirrung = fac('k1', 'kirrung', point(P(90, 200)), { name: 'Kirrung Ost' })
const fern = fac('f1', 'salzlecke', point(P(180, 900)), { name: 'Weit weg' })
const weg = fac('r1', 'anmarsch', line(P(180, 300), STAND), { name: 'Von Süden', standId: 's1' })
const demoSitz = fac('d1', 'hochsitz', point(P(270, 500)), { name: 'Beispielsitz', demo: true })

const start = fromBerlinLocal('2026-11-22T15:30').getTime()
const end = start + 2 * 3600000
const env: HuntEnv = {
  ...computeLocalEnv(start, end, STAND.lat, STAND.lng),
  weather: {
    temperature: 6, humidity: 85, cloudCover: 80, windDirection: 0, windCompass: 'N', windSpeed: 12, windDirectionAvg: 0, windSpeedAvg: 12,
    gustsMax: 30, pressure: 1012, pressureDelta3h: -2, pressureDelta12h: -4, pressureTrend: 'fallend', precipitation: 0,
    precipitation24h: 0, snowDepthCm: 0, weatherCode: 3, source: 'forecast', fetchedAt: 0,
  },
}
const hunt = (id: string, extra: Partial<Hunt> = {}): Hunt => ({
  id, standId: 's1', standName: 'Eichenkanzel', lat: STAND.lat, lng: STAND.lng, start: start - 30 * 86400000, end: start - 30 * 86400000 + 7200000,
  status: 'done', huntType: 'ansitz', targetSpecies: ['rehwild'], success: false, kills: [], disturbances: [], notes: '', rating: 4,
  env, weatherStatus: 'ok', weatherTries: 0, conclusion: 'Bock kam 17:05 aus der Dickung', mistakes: 'Zu spät angesessen', createdAt: 0, updatedAt: 0,
  ...extra,
})

function input(extra: Partial<PlanContextInput> = {}): PlanContextInput {
  const facilities = [sitz, wechsel, kirrung, fern, weg, demoSitz]
  const hunts = [hunt('h1'), hunt('h2', { demo: true, standId: 'd1', standName: 'Beispielsitz', conclusion: 'DEMO-FAZIT' })]
  const stands = [sitz, demoSitz]
  const base = { start, env, speciesId: 'rehwild', speciesName: 'Rehwild', facilities, sightings: [], hunts, scentLength: 300, scentWidth: 40, settings: {} }
  return {
    start, end, speciesId: 'rehwild', speciesName: 'Rehwild', env,
    ratings: rateStands(stands, base),
    facilities, hunts, sightings: [],
    knowledge: DEFAULT_KNOWLEDGE.map((k) => (k.id === DEFAULT_KNOWLEDGE.find((x) => x.speciesId === 'rehwild')!.id ? { ...k, status: 'geprueft' as const } : k)),
    calendar: [], seasons: [{ id: 'x', speciesId: 'rehwild', label: 'Böcke', from: '04-01', to: '01-31' }],
    speciesNames: new Map([['rehwild', 'Rehwild']]), includeUnverified: false, includeDemo: false, scent: { length: 300, width: 40 },
    ...extra,
  }
}

describe('KI-Kontext für die Ansitzempfehlung', () => {
  it('beschreibt Sitz, Schussfeld, Objekte in der Nähe mit Richtung/Entfernung und Anmarschweg', () => {
    const c = buildPlanContext(input())
    expect(c.context).toContain('Sitz Kanzel „Eichenkanzel“ [id: s1]')
    expect(c.context).toMatch(/Blick nach N \(0°\), Schussfeld 90° breit/)
    expect(c.context).toMatch(/Wechsel „Bruchwechsel“: 50 m N, im Schussfeld \(witterungsempfindlich\)/)
    expect(c.context).toMatch(/Kirrung „Kirrung Ost“: 200 m O/)
    const sitzTeil = c.context.slice(c.context.indexOf('### Sitz'), c.context.indexOf('### Alle weiteren'))
    expect(sitzTeil).not.toContain('Weit weg') // > 400 m nicht in „In der Nähe“
    expect(c.context).toContain('Salzlecke „Weit weg“: 900 m S der Reviermitte')
    expect(c.context).toContain('„Von Süden“ [id: r1]: 300 m, Start 300 m S vom Sitz')
  })

  it('Testdaten nur auf Wunsch', () => {
    const off = buildPlanContext(input())
    expect(off.context + off.question).not.toContain('Beispielsitz')
    expect(off.question).not.toContain('DEMO-FAZIT')
    const on = buildPlanContext(input({ includeDemo: true }))
    expect(on.context).toContain('Beispielsitz')
    expect(on.context).toContain('ACHTUNG: Enthält Testdaten')
  })

  it('Jagdwissen nur geprüft – ungeprüftes nur auf Wunsch und markiert', () => {
    const off = buildPlanContext(input())
    expect(off.counts.knowledge).toBe(1)
    expect(off.context).toContain('[geprüft]')
    expect(off.context).not.toContain('UNGEPRÜFT')
    const on = buildPlanContext(input({ includeUnverified: true }))
    expect(on.counts.knowledge).toBeGreaterThan(5)
    expect(on.context).toContain('[UNGEPRÜFT]')
    expect(on.context).not.toContain('(Schwarzwild)') // nur Zielwildart + allgemein
  })

  it('stabiler Teil ohne Plan-Zeit, Frage mit Wetter, Tagebuch (Fazit/Fehler), Jagdzeit und Wegprüfung', () => {
    const c = buildPlanContext(input())
    expect(c.context).not.toContain('22.11.2026')
    expect(buildPlanContext(input({ start: start + 86400000, end: end + 86400000 })).context).toBe(c.context)
    expect(c.question).toContain('22.11.2026')
    expect(c.question).toContain('Wind aus N (0°)')
    expect(c.question).toContain('fallend')
    expect(c.question).toContain('Fazit: „Bock kam 17:05 aus der Dickung“')
    expect(c.question).toContain('Fehler/nächstes Mal anders: „Zu spät angesessen“')
    expect(c.question).toContain('Böcke: Jagdzeit bis 31.01.')
    expect(c.question).toMatch(/Anmarschweg „Von Süden“ \[id: r1\], 300 m:/)
    expect(c.question).toMatch(/1\. Eichenkanzel \[id: s1\]: \d+ Punkte/)
  })
})

describe('KI-Antwort lesen', () => {
  it('liest gültiges JSON und lehnt Unbrauchbares ab', () => {
    const r = parseEmpfehlung(
      JSON.stringify({
        sitz: { id: 's1', name: 'Eichenkanzel', kurz: 'Wind von vorn' },
        alternative: { id: '', name: '', kurz: '' },
        anmarschweg: { id: 'r1', name: 'Von Süden', hinweis: 'leise' },
        erwartung: [{ wildart: 'Rehwild', uhrzeit: '16:30', einschaetzung: 'gut', herkunft: 'aus deinem Tagebuch (1 Ansitz)' }],
        achten: [{ text: 'Wechsel im Blick', art: 'tagebuch', herkunft: 'aus deinem Tagebuch (1 Ansitz)' }],
        warum: [{ text: "x", art: "quatsch", herkunft: "" }],
        datenlage: "wenig Daten",
        jagdzeit: "",
      }),
    )
    expect(r?.sitz.id).toBe("s1")
    expect(r?.warum[0].art).toBe("vermutung") // unbekannte Art → Vermutung
    expect(parseEmpfehlung("kein json")).toBeNull()
    expect(parseEmpfehlung('{"foo":1}')).toBeNull()
  })
})
