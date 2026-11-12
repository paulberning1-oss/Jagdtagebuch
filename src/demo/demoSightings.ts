// Erfundene Sichtungen für das Beispielrevier (Testdaten).
// Wetter wird hier simuliert (source: 'demo'), damit keine Wetterabfragen nötig sind.
import type { Facility } from '../db/db'
import { computeLocalEnv, pressureTrend } from '../domain/environment'
import type { Sighting, WeatherEnv } from '../domain/hunt'
import { compass16, destination, fromPos, type LatLng } from '../lib/geo'
import { newId } from '../lib/id'
import { fromBerlinLocal, toBerlinDate } from '../lib/time'

/** Kleiner, reproduzierbarer Zufallsgenerator */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MONTH_TEMP = [1, 2, 5, 9, 13, 16, 18, 18, 14, 10, 5, 2]

/** Plausibles, erfundenes Wetter für einen Zeitpunkt */
export function demoWeather(r: () => number, time: number, month: number): WeatherEnv {
  // Westwind überwiegt in Norddeutschland
  const dirs = [225, 250, 270, 290, 200, 180, 315, 90, 45, 135, 0]
  const dir = (dirs[Math.floor(r() * dirs.length)] + Math.round((r() - 0.5) * 30) + 360) % 360
  const speed = Math.round((3 + r() * 20) * 10) / 10
  const d3 = Math.round((r() - 0.5) * 6 * 10) / 10
  const rain24 = r() < 0.35 ? Math.round(r() * 12 * 10) / 10 : 0
  return {
    temperature: Math.round((MONTH_TEMP[month - 1] + (r() - 0.5) * 8) * 10) / 10,
    humidity: Math.round(60 + r() * 35),
    cloudCover: Math.round(r() * 100),
    windDirection: dir,
    windCompass: compass16(dir),
    windSpeed: speed,
    windDirectionAvg: dir,
    windSpeedAvg: speed,
    gustsMax: Math.round(speed * (1.5 + r()) * 10) / 10,
    pressure: Math.round((1013 + (r() - 0.5) * 30) * 10) / 10,
    pressureDelta3h: d3,
    pressureDelta12h: Math.round(d3 * (2 + r() * 2) * 10) / 10,
    pressureTrend: pressureTrend(d3),
    precipitation: r() < 0.15 ? Math.round(r() * 3 * 10) / 10 : 0,
    precipitation24h: rain24,
    snowDepthCm: month <= 2 && r() < 0.2 ? Math.round(r() * 10) : null,
    weatherCode: rain24 > 0 ? 61 : 2,
    source: 'demo',
    fetchedAt: time,
  }
}

interface Pattern {
  speciesId: string
  around: LatLng
  spreadM: number
  /** erlaubte Monate */
  months: number[]
  /** Stunde (Berlin) als Bereich, kann über Mitternacht gehen */
  hours: [number, number]
  count: [number, number]
  sexAge: string[][]
  behavior: string[]
  n: number
  camera?: Facility
}

export function buildDemoSightings(facs: Facility[], now = Date.now()): Sighting[] {
  const r = rng(4711)
  const pos = (name: string) => {
    const f = facs.find((x) => x.name === name)!
    if (f.geometry.type === 'Point') return fromPos(f.geometry.coordinates)
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates
    const pts = ring.map(fromPos)
    return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length }
  }
  const camera = facs.find((x) => x.type === 'wildkamera')
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  const patterns: Pattern[] = [
    // Kirrung: Sauen nachts, von der Kamera erfasst
    { speciesId: 'schwarzwild', around: pos('Buchenecke'), spreadM: 15, months: all, hours: [21, 3], count: [1, 9], sexAge: [['Bache', 'Frischling'], ['Überläufer'], ['Keiler'], ['Bache', 'Überläufer', 'Frischling']], behavior: ['wühlend', 'ziehend'], n: 34, camera },
    { speciesId: 'fuchs', around: pos('Buchenecke'), spreadM: 20, months: all, hours: [20, 5], count: [1, 1], sexAge: [['Rüde'], ['Fähe'], []], behavior: ['ziehend'], n: 8, camera },
    { speciesId: 'waschbaer', around: pos('Buchenecke'), spreadM: 20, months: [4, 5, 6, 7, 8, 9, 10], hours: [22, 4], count: [1, 3], sexAge: [[]], behavior: ['wühlend'], n: 5, camera },
    // Wildacker: Rehwild in der Dämmerung
    { speciesId: 'rehwild', around: pos('Wildacker Eichenecke'), spreadM: 60, months: all, hours: [17, 21], count: [1, 3], sexAge: [['Ricke', 'Kitz'], ['Bock'], ['Ricke'], ['Schmalreh']], behavior: ['äsend', 'sichernd'], n: 30 },
    { speciesId: 'rehwild', around: pos('Wildacker Eichenecke'), spreadM: 70, months: all, hours: [5, 8], count: [1, 2], sexAge: [['Ricke'], ['Bock']], behavior: ['äsend', 'ziehend'], n: 14 },
    // Mais: Sauen im Sommer
    { speciesId: 'schwarzwild', around: pos('Maisschlag'), spreadM: 120, months: [7, 8, 9], hours: [22, 2], count: [3, 12], sexAge: [['Bache', 'Frischling'], ['Überläufer']], behavior: ['wühlend', 'ziehend'], n: 12 },
    // Hauptwechsel: Rotwild selten
    { speciesId: 'rotwild', around: pos('Fichtendickung'), spreadM: 150, months: [9, 10, 11, 12, 1], hours: [18, 23], count: [1, 6], sexAge: [['Alttier', 'Kalb'], ['Hirsch']], behavior: ['ziehend', 'flüchtig'], n: 6 },
    // Hase auf dem Raps
    { speciesId: 'hase', around: pos('Rapsfeld Süd'), spreadM: 120, months: [3, 4, 5, 6, 9, 10], hours: [6, 20], count: [1, 3], sexAge: [[]], behavior: ['äsend'], n: 8 },
  ]

  const out: Sighting[] = []
  for (const p of patterns) {
    for (let i = 0; i < p.n; i++) {
      // Datum in den letzten 12 Monaten mit passendem Monat
      let t = 0
      for (let tries = 0; tries < 40; tries++) {
        const daysAgo = 1 + Math.floor(r() * 360)
        const day = toBerlinDate(new Date(now - daysAgo * 86400000))
        const month = Number(day.slice(5, 7))
        if (!p.months.includes(month)) continue
        const [h0, h1] = p.hours
        const span = h1 >= h0 ? h1 - h0 : 24 - h0 + h1
        const h = (h0 + Math.floor(r() * (span + 1))) % 24
        const m = Math.floor(r() * 60)
        t = fromBerlinLocal(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`).getTime()
        if (t < now) break
      }
      if (!t || t > now) continue
      const where = destination(p.around, r() * 360, r() * p.spreadM)
      const month = Number(toBerlinDate(new Date(t)).slice(5, 7))
      const count = p.count[0] + Math.floor(r() * (p.count[1] - p.count[0] + 1))
      out.push({
        id: newId(),
        huntId: null,
        time: t,
        speciesId: p.speciesId,
        count,
        sexAge: p.sexAge[Math.floor(r() * p.sexAge.length)],
        behavior: p.behavior[Math.floor(r() * p.behavior.length)],
        direction: r() < 0.4 ? Math.floor(r() * 8) * 45 : null,
        lat: p.camera ? fromPos((p.camera.geometry as { coordinates: number[] }).coordinates).lat : where.lat,
        lng: p.camera ? fromPos((p.camera.geometry as { coordinates: number[] }).coordinates).lng : where.lng,
        source: p.camera ? 'wildkamera' : 'eigen',
        cameraId: p.camera?.id ?? null,
        notes: '',
        photoIds: [],
        env: { weather: demoWeather(r, t, month), ...computeLocalEnv(t, t, where.lat, where.lng) },
        weatherStatus: 'ok',
        weatherTries: 0,
        demo: true,
        createdAt: t,
      })
    }
  }
  return out
}
