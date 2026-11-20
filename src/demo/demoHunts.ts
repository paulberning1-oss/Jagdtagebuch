// Erfundene Ansitze für das Beispielrevier (Testdaten, demo: true) – damit der
// Kombinations-Assistent und die Statistik ohne eigene Einträge etwas zeigen.
//
// Die Ergebnisse folgen bewusst erkennbaren Mustern, z. B.:
// - Eichenkanzel: Rehwild abends, am besten mit Wind von vorn (aus NO/O)
// - Kirrungssitz Buche: Sauen nachts bei hellem Mond; bei Wind aus NW zieht die
//   Witterung über die Kirrung → kaum Anblick
// - Feldkanzel Nord: Sauen im Sommer (Mais)
import type { Facility } from '../db/db'
import { computeLocalEnv } from '../domain/environment'
import type { Hunt, Kill, Sighting } from '../domain/hunt'
import { DEFAULT_SPECIES } from '../domain/species'
import { angleDiff, destination, fromPos } from '../lib/geo'
import { newId } from '../lib/id'
import { sunTimes } from '../lib/sun'
import { fromBerlinLocal, toBerlinDate } from '../lib/time'
import { demoWeather, rng } from './demoSightings'

const DAY = 86400000
const MIN = 60000

interface StandPlan {
  name: string
  weight: number
  /** Zielwildart je nach Monat */
  species: (month: number, r: () => number) => string
  /** Grund-Wahrscheinlichkeit für Anblick der Zielwildart */
  base: (speciesId: string) => number
  /** Erlaubte Monate je Wildart (sonst alle) */
  months?: Record<string, number[]>
}

const STANDS: StandPlan[] = [
  { name: 'Eichenkanzel', weight: 12, species: () => 'rehwild', base: () => 0.55 },
  { name: 'Kirrungssitz Buche', weight: 10, species: () => 'schwarzwild', base: () => 0.8 },
  {
    name: 'Feldkanzel Nord',
    weight: 8,
    species: (m) => ([7, 8, 9].includes(m) ? 'schwarzwild' : 'rehwild'),
    base: (s) => (s === 'schwarzwild' ? 0.7 : 0.35),
  },
  {
    name: 'Birkenleiter',
    weight: 7,
    species: (m, r) => ([9, 10, 11, 12].includes(m) && r() < 0.5 ? 'rotwild' : 'rehwild'),
    base: (s) => (s === 'rotwild' ? 0.25 : 0.35),
  },
  { name: 'Bruchsitz', weight: 5, species: (_m, r) => (r() < 0.6 ? 'rehwild' : 'schwarzwild'), base: () => 0.25 },
]

const OTHER = ['fuchs', 'hase', 'rehwild', 'dachs']
const COUNT: Record<string, [number, number]> = { rehwild: [1, 3], schwarzwild: [1, 7], rotwild: [1, 5], fuchs: [1, 1], hase: [1, 2], dachs: [1, 1] }
const WEIGHT: Record<string, [number, number]> = { rehwild: [11, 19], schwarzwild: [22, 65], rotwild: [45, 110] }

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]
const between = (r: () => number, [a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1))
const clamp = (x: number) => Math.max(0.05, Math.min(0.9, x))

export function buildDemoHunts(facs: Facility[], now = Date.now(), n = 42): { hunts: Hunt[]; sightings: Sighting[] } {
  const r = rng(815)
  // Eigener Zufallsstrang für Texte/Aktivität – ändert die Muster von r nicht
  const t = rng(4242)
  const hunts: Hunt[] = []
  const sightings: Sighting[] = []
  const totalWeight = STANDS.reduce((a, s) => a + s.weight, 0)

  for (let i = 0; i < n; i++) {
    // Sitz nach Gewicht wählen
    let x = r() * totalWeight
    const plan = STANDS.find((s) => (x -= s.weight) < 0) ?? STANDS[0]
    const stand = facs.find((f) => f.name === plan.name && f.geometry.type === 'Point')
    if (!stand || stand.geometry.type !== 'Point') continue
    const pos = fromPos(stand.geometry.coordinates)

    // Tag in den letzten 12 Monaten
    const day = new Date(now - (2 + Math.floor(r() * 360)) * DAY)
    const month = Number(toBerlinDate(day).slice(5, 7))
    const speciesId = plan.species(month, r)
    const sun = sunTimes(day, pos.lat, pos.lng)

    // Beginn: Rehwild/Rotwild abends oder morgens, Sauen abends bis in die Nacht oder nachts
    let start: number
    let durMin: number
    if (speciesId === 'schwarzwild') {
      if (r() < 0.5) {
        start = sun.sunset.getTime() - 30 * MIN
        durMin = 180
      } else {
        start = fromBerlinLocal(`${toBerlinDate(day)}T${pick(r, ['22', '22', '23'])}:${pick(r, ['00', '15', '30'])}`).getTime()
        durMin = 150
      }
    } else if (r() < 0.7) {
      start = sun.sunset.getTime() - (60 + Math.floor(r() * 45)) * MIN
      durMin = 120 + Math.floor(r() * 30)
    } else {
      start = sun.sunrise.getTime() - (45 + Math.floor(r() * 30)) * MIN
      durMin = 120
    }
    start = Math.round(start / (5 * MIN)) * 5 * MIN
    const end = start + durMin * MIN
    if (end > now) continue

    const weather = demoWeather(r, start, month)
    const env = { weather, ...computeLocalEnv(start, end, pos.lat, pos.lng) }

    // Wahrscheinlichkeit für Anblick der Zielwildart
    let p = plan.base(speciesId)
    const wind = weather.windDirection ?? 0
    if (stand.bearing != null) {
      const d = angleDiff(wind, stand.bearing)
      if (d <= 45) p += 0.15
      else if (d >= 135) p -= 0.25
    }
    if (plan.name === 'Kirrungssitz Buche' && angleDiff(wind, 315) <= 45) p -= 0.3 // Witterung über der Kirrung
    if (speciesId === 'schwarzwild' && env.sun.period !== 'Morgen') {
      if (env.moon.illumination >= 60 && env.moon.upPercent >= 40) p += 0.2
      else if (env.moon.illumination < 25) p -= 0.15
    }
    if ((weather.precipitation ?? 0) >= 1) p -= 0.2
    else if ((weather.precipitation24h ?? 0) >= 2) p += 0.1
    if ((weather.gustsMax ?? 0) >= 40) p -= 0.15
    const disturbed = r() < 0.15
    if (disturbed) p -= 0.15

    const id = newId()
    const kills: Kill[] = []
    const seen = r() < clamp(p)
    const sp = DEFAULT_SPECIES.find((s) => s.id === speciesId)!
    const spot = () => destination(pos, (stand.bearing ?? 0) + (r() - 0.5) * 60, 60 + r() * 140)
    const timeIn = () => start + Math.floor(r() * durMin) * MIN

    const addSighting = (sid: string, count: number) => {
      const where = spot()
      const spec = DEFAULT_SPECIES.find((s) => s.id === sid)
      sightings.push({
        id: newId(),
        huntId: id,
        time: timeIn(),
        speciesId: sid,
        count,
        sexAge: spec?.sexAge.length ? [pick(r, spec.sexAge)] : [],
        behavior: pick(r, ['äsend', 'ziehend', 'sichernd']),
        direction: null,
        lat: where.lat,
        lng: where.lng,
        source: 'eigen',
        notes: '',
        photoIds: [],
        demo: true,
        createdAt: start,
      })
    }

    if (seen) {
      addSighting(speciesId, between(r, COUNT[speciesId] ?? [1, 2]))
      if (r() < (speciesId === 'schwarzwild' ? 0.25 : 0.3)) {
        const where = spot()
        const w = WEIGHT[speciesId]
        kills.push({
          id: newId(),
          speciesId,
          sexAge: sp.sexAge.length ? pick(r, sp.sexAge.slice(1)) || sp.sexAge[0] : '',
          time: timeIn(),
          lat: where.lat,
          lng: where.lng,
          weightKg: w ? between(r, w) : null,
        })
      }
    }
    if (r() < 0.35) {
      const other = pick(r, OTHER.filter((o) => o !== speciesId))
      addSighting(other, between(r, COUNT[other] ?? [1, 1]))
    }

    const rating = kills.length ? 5 : seen ? 3 + Math.floor(r() * 2) : sightings.some((s) => s.huntId === id) ? 2 : 1 + Math.floor(r() * 2)
    hunts.push({
      id,
      standId: stand.id,
      standName: stand.name,
      lat: pos.lat,
      lng: pos.lng,
      start,
      end,
      status: 'done',
      huntType: 'ansitz',
      targetSpecies: [speciesId],
      success: kills.length > 0,
      kills,
      disturbances: disturbed ? [pick(r, ['Spaziergänger', 'Hunde', 'Fahrzeuge', 'Jogger/Radfahrer'])] : [],
      notes: '',
      rating,
      ...demoNotes(t, kills.length > 0, seen, sightings.some((s) => s.huntId === id), disturbed),
      env,
      weatherStatus: 'ok',
      weatherTries: 0,
      demo: true,
      createdAt: end,
      updatedAt: end,
    })
  }
  return { hunts, sightings }
}

const GOOD = [
  'Ruhiger Abend, Wild zog früh aus.',
  'Rehwild kam wie erwartet auf den Wildacker.',
  'Sauen kamen erst, als der Mond über den Wald stieg.',
  'Gute Sicht, Wind stand die ganze Zeit sauber.',
]
const BAD = [
  'Kaum Bewegung, nur Vögel.',
  'Wind drehte nach einer Stunde, danach nichts mehr.',
  'Zu dunkel zum sicheren Ansprechen.',
  'Wild stand im Einstand, kam nicht heraus.',
]
const MISTAKES = [
  'Zu spät am Sitz – Wild stand schon draußen.',
  'Über den Wechsel angegangen.',
  'Wind vorher nicht geprüft, kam von hinten.',
  'Zu früh abgebaumt.',
  'Beim Aufbaumen zu laut gewesen.',
]

/** Wildaktivität, Fazit und Fehler für Test-Ansitze */
function demoNotes(t: () => number, killed: boolean, seen: boolean, other: boolean, disturbed: boolean) {
  const activity = killed ? 5 : seen ? 3 + Math.floor(t() * 2) : other ? 2 : 1 + Math.floor(t() * 2)
  const good = killed || seen
  const conclusion = t() < 0.75 ? (disturbed ? 'Störung durch Spaziergänger, danach lange Ruhe.' : pick(t, good ? GOOD : BAD)) : ''
  const mistakes = !good && t() < 0.5 ? pick(t, MISTAKES) : ''
  return { activity, conclusion, mistakes }
}
