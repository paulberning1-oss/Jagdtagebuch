import { describe, expect, it } from 'vitest'
import type { Facility } from '../db/db'
import { destination, toPos, type LatLng } from '../lib/geo'
import { fromBerlinLocal } from '../lib/time'
import { huntStats, outcomeOf, rateStands, similarity } from './assistant'
import { computeLocalEnv } from './environment'
import type { Hunt, HuntEnv, Sighting, WeatherEnv } from './hunt'
import { evaluateRules, ruleScore, type RuleContext } from './rules'

const STAND: LatLng = { lat: 52.52, lng: 7.21 }

function facility(id: string, type: Facility['type'], p: LatLng, extra: Partial<Facility> = {}): Facility {
  return { id, type, name: id, geometry: { type: 'Point', coordinates: toPos(p) }, notes: '', photoIds: [], createdAt: 0, updatedAt: 0, ...extra }
}

function weather(windFrom: number, extra: Partial<WeatherEnv> = {}): WeatherEnv {
  return {
    temperature: 10,
    humidity: 70,
    cloudCover: 50,
    windDirection: windFrom,
    windCompass: null,
    windSpeed: 12,
    windDirectionAvg: windFrom,
    windSpeedAvg: 12,
    gustsMax: 20,
    pressure: 1012,
    pressureDelta3h: 0,
    pressureDelta12h: 0,
    pressureTrend: 'gleichbleibend',
    precipitation: 0,
    precipitation24h: 0,
    snowDepthCm: null,
    weatherCode: 2,
    source: 'demo',
    fetchedAt: 0,
    ...extra,
  }
}

/** Abendansitz am 10. Mai 2026 (19:30–21:30 Berliner Zeit) */
const START = fromBerlinLocal('2026-05-10T19:30').getTime()
const END = START + 2 * 3600000
function env(windFrom: number | null, extra: Partial<WeatherEnv> = {}, start = START, end = END): HuntEnv {
  return { weather: windFrom == null ? null : weather(windFrom, extra), ...computeLocalEnv(start, end, STAND.lat, STAND.lng) }
}

function ctx(e: HuntEnv, facilities: Facility[], extra: Partial<RuleContext> = {}): RuleContext {
  return {
    start: START,
    env: e,
    speciesId: 'rehwild',
    speciesName: 'Rehwild',
    facilities,
    sightings: [],
    hunts: [],
    scentLength: 300,
    scentWidth: 40,
    settings: {},
    ...extra,
  }
}

function hunt(id: string, standId: string, e: HuntEnv, extra: Partial<Hunt> = {}): Hunt {
  return {
    id,
    standId,
    standName: standId,
    lat: STAND.lat,
    lng: STAND.lng,
    start: START - 30 * 86400000,
    end: START - 30 * 86400000 + 7200000,
    status: 'done',
    huntType: 'ansitz',
    targetSpecies: [],
    success: false,
    kills: [],
    disturbances: [],
    notes: '',
    rating: null,
    env: e,
    weatherStatus: 'ok',
    weatherTries: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

function sighting(huntId: string | null, speciesId: string, extra: Partial<Sighting> = {}): Sighting {
  return {
    id: `${huntId}-${speciesId}-${Math.random()}`,
    huntId,
    time: START,
    speciesId,
    count: 1,
    sexAge: [],
    behavior: '',
    direction: null,
    lat: STAND.lat,
    lng: STAND.lng,
    source: 'eigen',
    notes: '',
    photoIds: [],
    createdAt: 0,
    ...extra,
  }
}

// Sitz blickt nach Osten (90°), Wildacker 120 m östlich, Kirrung 150 m südlich
const stand = facility('sitz', 'hochsitz', STAND, { bearing: 90, fieldWidth: 90 })
const aesung = facility('acker', 'aesung', destination(STAND, 90, 120))
const kirrung = facility('kirrung', 'kirrung', destination(STAND, 180, 150))
const all = [stand, aesung, kirrung]

describe('Regelwerk', () => {
  it('bestraft Wind, der die Witterung über die Kirrung trägt', () => {
    // Wind aus Nord → Witterung zieht nach Süden über die Kirrung
    const r = evaluateRules(stand, ctx(env(0), all))
    const wind = r.filter((x) => x.rule === 'wind')
    expect(wind.some((x) => x.points < 0 && x.text.includes('Kirrung'))).toBe(true)
  })

  it('belohnt Wind von vorn und bestraft Wind von hinten', () => {
    const front = ruleScore(evaluateRules(stand, ctx(env(90), all)))
    const back = ruleScore(evaluateRules(stand, ctx(env(270), all)))
    expect(front).toBeGreaterThan(back)
    expect(evaluateRules(stand, ctx(env(270), all)).some((x) => x.text.includes('von hinten'))).toBe(true)
  })

  it('erkennt Äsung im Schussfeld als passendes Umfeld für Rehwild', () => {
    const r = evaluateRules(stand, ctx(env(90), all))
    expect(r.find((x) => x.rule === 'umfeld')?.points).toBeGreaterThan(0)
  })

  it('Rehwild abends besser als mittags', () => {
    const noon = fromBerlinLocal('2026-05-10T12:30').getTime()
    const evening = ruleScore(evaluateRules(stand, ctx(env(90), all)))
    const midday = ruleScore(evaluateRules(stand, ctx(env(90, {}, noon, noon + 7200000), all, { start: noon })))
    expect(evening).toBeGreaterThan(midday)
  })

  it('heller Mond hilft beim Nachtansitz auf Sauen', () => {
    // 1. Mai 2026 ist Vollmond, 16. Mai Neumond
    const full = fromBerlinLocal('2026-05-01T23:00').getTime()
    const neu = fromBerlinLocal('2026-05-16T23:00').getTime()
    const sauen = (t: number) =>
      evaluateRules(stand, ctx(env(90, {}, t, t + 3 * 3600000), all, { start: t, speciesId: 'schwarzwild', speciesName: 'Schwarzwild' })).find(
        (x) => x.rule === 'mond',
      )
    expect(sauen(full)?.points).toBeGreaterThan(0)
    expect(sauen(neu)?.points).toBeLessThan(0)
  })

  it('Sitz, der gestern besetzt war, bekommt Abzug', () => {
    const yesterday = hunt('h1', 'sitz', env(90), { start: START - 86400000, end: START - 86400000 + 7200000 })
    const r = evaluateRules(stand, ctx(env(90), all, { hunts: [yesterday] }))
    expect(r.find((x) => x.rule === 'ruhe')?.points).toBeLessThan(0)
  })

  it('ausgeschaltete Regel zählt nicht, starke zählt mehr', () => {
    const normal = evaluateRules(stand, ctx(env(270), all)).find((x) => x.text.includes('von hinten'))!.points
    const strong = evaluateRules(stand, ctx(env(270), all, { settings: { wind: 1.5 } })).find((x) => x.text.includes('von hinten'))!.points
    expect(strong).toBeLessThan(normal)
    expect(evaluateRules(stand, ctx(env(270), all, { settings: { wind: 0 } })).some((x) => x.rule === 'wind')).toBe(false)
  })

  it('Regen während des Ansitzes zählt negativ, Regen davor positiv', () => {
    const rain = evaluateRules(stand, ctx(env(90, { precipitation: 2 }), all)).find((x) => x.rule === 'niederschlag')
    const after = evaluateRules(stand, ctx(env(90, { precipitation24h: 6 }), all)).find((x) => x.rule === 'niederschlag')
    expect(rain?.points).toBeLessThan(0)
    expect(after?.points).toBeGreaterThan(0)
  })

  it('Punkte bleiben zwischen 0 und 100', () => {
    const r = ruleScore([{ rule: 'wind', points: -500, text: '' }])
    expect(r).toBe(0)
    expect(ruleScore([{ rule: 'wind', points: 500, text: '' }])).toBe(100)
  })
})

describe('Erfolg eines Ansitzes', () => {
  const h = hunt('h', 'sitz', env(90))
  it('erlegt > Anblick > anderes Wild > nichts', () => {
    const killed = outcomeOf({ ...h, kills: [{ id: 'k', speciesId: 'rehwild', sexAge: 'Bock', time: 0, lat: 0, lng: 0, weightKg: null }] }, [], 'rehwild')
    const seen = outcomeOf(h, [sighting('h', 'rehwild')], 'rehwild')
    const other = outcomeOf(h, [sighting('h', 'fuchs')], 'rehwild')
    const none = outcomeOf(h, [], 'rehwild')
    expect([killed.kind, seen.kind, other.kind, none.kind]).toEqual(['erlegt', 'anblick', 'anderes', 'nichts'])
    expect(killed.score).toBeGreaterThan(seen.score)
    expect(seen.score).toBeGreaterThan(other.score)
    expect(other.score).toBeGreaterThan(none.score)
  })
  it('ohne Zielwildart zählt jeder Anblick', () => {
    expect(outcomeOf(h, [sighting('h', 'fuchs')], null).kind).toBe('anblick')
  })
})

describe('Eigene Daten', () => {
  it('ähnlicher Wind ist ähnlicher als Gegenwind', () => {
    expect(similarity(env(90), env(100))).toBeGreaterThan(similarity(env(90), env(270)))
  })

  it('mischt Regelwerk und eigene Daten mit a = n/(n+10)', () => {
    // 10 ähnliche Ansitze, alle mit Erlegung → eigene Daten 100, Anteil 50 %
    const hunts = Array.from({ length: 10 }, (_, i) =>
      hunt(`h${i}`, 'sitz', env(90), { kills: [{ id: 'k', speciesId: 'rehwild', sexAge: '', time: 0, lat: 0, lng: 0, weightKg: null }] }),
    )
    const c = ctx(env(90), all, { hunts })
    const [r] = rateStands([stand], c)
    expect(r.own.total).toBe(10)
    expect(r.own.score).toBe(100)
    expect(r.own.share).toBeCloseTo(r.own.n / (r.own.n + 10))
    expect(r.score).toBe(Math.round((1 - r.own.share) * r.rules + r.own.share * 100))
    expect(r.score).toBeGreaterThan(r.rules)
  })

  it('ohne eigene Ansitze zählt nur das Regelwerk', () => {
    const [r] = rateStands([stand], ctx(env(90), all))
    expect(r.own.score).toBeNull()
    expect(r.score).toBe(r.rules)
  })

  it('zukünftige Ansitze fließen nicht ein', () => {
    const later = hunt('x', 'sitz', env(90), { start: START + 86400000, end: START + 86400000 + 7200000 })
    const [r] = rateStands([stand], ctx(env(90), all, { hunts: [later] }))
    expect(r.own.total).toBe(0)
  })
})

describe('Statistik', () => {
  it('gruppiert nach Wind und zählt Anblick-Quote', () => {
    const hunts = [hunt('a', 'sitz', env(90)), hunt('b', 'sitz', env(95)), hunt('c', 'sitz', env(270))]
    const sightings = [sighting('a', 'rehwild')]
    const rows = huntStats(hunts, sightings, 'rehwild', 'wind')
    const o = rows.find((r) => r.key === 'O')!
    expect(o.hunts).toBe(2)
    expect(o.anblickQuote).toBe(50)
    expect(rows.find((r) => r.key === 'W')!.anblickQuote).toBe(0)
  })
})
