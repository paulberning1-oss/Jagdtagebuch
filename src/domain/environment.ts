// Bedingungen eines Ansitzes: Wetter (aus Open-Meteo-Stundenwerten),
// Sonne, Mond und Kalender (lokal mit SunCalc berechnet – auch offline).

import SunCalc from 'suncalc'
import { compass16, normDeg } from '../lib/geo'
import { sunTimes } from '../lib/sun'
import { berlinParts, fromBerlinLocal, toBerlinDate, TZ } from '../lib/time'
import type { HourlySeries } from '../services/openMeteo'
import type { CalendarEnv, DayPeriod, MoonEnv, PressureTrend, Season, SunEnv, WeatherEnv } from './hunt'

const H = 3600000
const MIN = 60000

/** Stündliche Wettervariablen, die für einen Ansitz geladen werden */
export const HUNT_WEATHER_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'snow_depth',
  'weather_code',
]

/** Druckänderung (hPa in 3 h), ab der wir von steigend/fallend sprechen */
export const PRESSURE_TREND_THRESHOLD = 1

/** Welche Kalendertage müssen geladen werden? (24 h vor Beginn bis Ende) */
export function weatherDateRange(start: number, end: number) {
  return { startDate: toBerlinDate(new Date(start - 24 * H)), endDate: toBerlinDate(new Date(end)) }
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Mittlere Richtung von Winkeln (Kreismittel), z. B. 350° und 10° → 0° */
export function circularMean(degs: number[]): number | null {
  if (!degs.length) return null
  let x = 0
  let y = 0
  for (const d of degs) {
    x += Math.cos((d * Math.PI) / 180)
    y += Math.sin((d * Math.PI) / 180)
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null
  return Math.round(normDeg((Math.atan2(y, x) * 180) / Math.PI))
}

export function pressureTrend(delta3h: number | null): PressureTrend | null {
  if (delta3h == null) return null
  if (delta3h >= PRESSURE_TREND_THRESHOLD) return 'steigend'
  if (delta3h <= -PRESSURE_TREND_THRESHOLD) return 'fallend'
  return 'gleichbleibend'
}

/**
 * Wetter aus den Stundenwerten berechnen.
 * Hinweis Open-Meteo: Temperatur, Wind usw. gelten zum Zeitpunkt der Stunde,
 * Niederschlag ist die Summe der VORANGEGANGENEN Stunde.
 */
export function computeWeather(
  s: HourlySeries,
  start: number,
  end: number,
  source: 'forecast' | 'archive',
  fetchedAt = Date.now(),
): WeatherEnv {
  const times = (s.time as string[]).map((t) => fromBerlinLocal(t).getTime())
  const num = (v: string) => (s[v] as (number | null)[] | undefined) ?? []
  const at = (v: string, i: number): number | null => (i >= 0 ? (num(v)[i] ?? null) : null)

  // Stunde, die dem Beginn am nächsten liegt
  let i0 = -1
  let best = Infinity
  times.forEach((t, i) => {
    const d = Math.abs(t - start)
    if (d < best) {
      best = d
      i0 = i
    }
  })
  if (best > H) i0 = -1

  // Stunden während des Ansitzes (mindestens die Startstunde)
  const during = times.map((t, i) => [t, i] as const).filter(([t]) => t >= start - 30 * MIN && t <= end + 30 * MIN).map(([, i]) => i)
  if (!during.length && i0 >= 0) during.push(i0)

  const vals = (v: string, idx: number[]) => idx.map((i) => num(v)[i]).filter((x): x is number => x != null)

  // Windrichtung über den Ansitz gemittelt
  const dirs = vals('wind_direction_10m', during)
  const speeds = vals('wind_speed_10m', during)
  const gusts = vals('wind_gusts_10m', during)

  // Druck: Differenz zu 3 h und 12 h vorher
  const p0 = at('pressure_msl', i0)
  const p3 = i0 >= 3 ? at('pressure_msl', i0 - 3) : null
  const p12 = i0 >= 12 ? at('pressure_msl', i0 - 12) : null
  const d3 = p0 != null && p3 != null ? round1(p0 - p3) : null
  const d12 = p0 != null && p12 != null ? round1(p0 - p12) : null

  // Niederschlag
  const sumPrecip = (from: number, to: number) => {
    const idx = times.map((t, i) => [t, i] as const).filter(([t]) => t > from && t - H < to).map(([, i]) => i)
    const v = vals('precipitation', idx)
    return v.length ? round1(v.reduce((a, b) => a + b, 0)) : null
  }
  const precip24 = (() => {
    const idx = times.map((t, i) => [t, i] as const).filter(([t]) => t > start - 24 * H && t <= start + 30 * MIN).map(([, i]) => i)
    const v = vals('precipitation', idx)
    return v.length ? round1(v.reduce((a, b) => a + b, 0)) : null
  })()

  const windDir = at('wind_direction_10m', i0)
  const snow = at('snow_depth', i0)

  return {
    temperature: at('temperature_2m', i0) != null ? round1(at('temperature_2m', i0)!) : null,
    humidity: at('relative_humidity_2m', i0),
    cloudCover: at('cloud_cover', i0),
    windDirection: windDir != null ? Math.round(windDir) : null,
    windCompass: windDir != null ? compass16(windDir) : null,
    windSpeed: at('wind_speed_10m', i0) != null ? round1(at('wind_speed_10m', i0)!) : null,
    windDirectionAvg: circularMean(dirs),
    windSpeedAvg: speeds.length ? round1(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
    gustsMax: gusts.length ? round1(Math.max(...gusts)) : null,
    pressure: p0 != null ? round1(p0) : null,
    pressureDelta3h: d3,
    pressureDelta12h: d12,
    pressureTrend: pressureTrend(d3),
    precipitation: sumPrecip(start, end),
    precipitation24h: precip24,
    snowDepthCm: snow != null && snow > 0 ? Math.round(snow * 100) : null,
    weatherCode: at('weather_code', i0),
    source,
    fetchedAt,
  }
}

// ---------- Sonne ----------

const valid = (d: Date | undefined) => (d && !isNaN(d.getTime()) ? d.getTime() : null)

export function computeSun(start: number, end: number, lat: number, lng: number): SunEnv {
  const t = sunTimes(new Date(start), lat, lng)
  const sunrise = valid(t.sunrise)
  const sunset = valid(t.sunset)
  const rel = (x: number, ref: number | null) => (ref == null ? null : Math.round((x - ref) / MIN))

  let period: DayPeriod = 'Tag'
  if (sunrise != null && sunset != null) {
    if (start >= sunrise - 2 * H && start < sunrise + 3 * H) period = 'Morgen'
    else if (start >= sunset - 3 * H && start < sunset + 2 * H) period = 'Abend'
    else if (start >= sunrise + 3 * H && start < sunset - 3 * H) period = 'Tag'
    else period = 'Nacht'
  }

  return {
    sunrise,
    sunset,
    civilDawn: valid(t.dawn),
    civilDusk: valid(t.dusk),
    nauticalDawn: valid(t.nauticalDawn),
    nauticalDusk: valid(t.nauticalDusk),
    startMinFromSunset: rel(start, sunset),
    endMinFromSunset: rel(end, sunset),
    startMinFromSunrise: rel(start, sunrise),
    endMinFromSunrise: rel(end, sunrise),
    period,
  }
}

// ---------- Mond ----------

export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1
  if (p < 0.03 || p >= 0.97) return 'Neumond'
  if (p < 0.22) return 'Zunehmende Sichel'
  if (p < 0.28) return 'Erstes Viertel'
  if (p < 0.47) return 'Zunehmender Mond'
  if (p < 0.53) return 'Vollmond'
  if (p < 0.72) return 'Abnehmender Mond'
  if (p < 0.78) return 'Letztes Viertel'
  return 'Abnehmende Sichel'
}

export function computeMoon(start: number, end: number, lat: number, lng: number): MoonEnv {
  const mid = new Date((start + end) / 2)
  const ill = SunCalc.getMoonIllumination(mid)
  // Mondzeiten des Berliner Kalendertags. SunCalc rechnet in UTC-Tagen; ein Berliner Tag
  // überlappt zwei UTC-Tage – daher beide abfragen und nur Zeiten des Berliner Tags nehmen.
  const day = toBerlinDate(new Date(start))
  const utcMidnight = Date.parse(`${day}T00:00:00Z`)
  const found = [-1, 0].map((off) => SunCalc.getMoonTimes(new Date(utcMidnight + off * 86400000), lat, lng, true) as { rise?: Date; set?: Date })
  const pick = (k: 'rise' | 'set') => {
    for (const r of found) {
      const d = r[k]
      if (d && !isNaN(d.getTime()) && toBerlinDate(d) === day) return d.getTime()
    }
    return null
  }

  // Mondhöhe alle 10 Minuten abtasten
  let up = 0
  let n = 0
  for (let t = start; t <= Math.max(end, start); t += 10 * MIN) {
    n++
    if (SunCalc.getMoonPosition(new Date(t), lat, lng).altitude > 0) up++
  }

  return {
    phase: Math.round(ill.phase * 1000) / 1000,
    phaseName: moonPhaseName(ill.phase),
    illumination: Math.round(ill.fraction * 100),
    moonrise: pick('rise'),
    moonset: pick('set'),
    upDuringHunt: up > 0,
    upPercent: n ? Math.round((up / n) * 100) : 0,
  }
}

// ---------- Kalender ----------

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long' })
const monthFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, month: 'long' })

export function seasonOfMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'Frühling'
  if (month >= 6 && month <= 8) return 'Sommer'
  if (month >= 9 && month <= 11) return 'Herbst'
  return 'Winter'
}

export function computeCalendar(start: number): CalendarEnv {
  const d = new Date(start)
  const month = berlinParts(d).month
  return { weekday: weekdayFmt.format(d), month, monthName: monthFmt.format(d), season: seasonOfMonth(month) }
}

/** Sonne, Mond, Kalender – sofort und offline berechenbar */
export function computeLocalEnv(start: number, end: number, lat: number, lng: number) {
  return {
    sun: computeSun(start, end, lat, lng),
    moon: computeMoon(start, end, lat, lng),
    calendar: computeCalendar(start),
  }
}

// ---------- Anzeige-Hilfen ----------

/** WMO-Wettercode → kurzer deutscher Text */
export function weatherCodeText(code: number | null): string {
  if (code == null) return ''
  if (code === 0) return 'klar'
  if (code === 1) return 'überwiegend klar'
  if (code === 2) return 'teils bewölkt'
  if (code === 3) return 'bedeckt'
  if (code === 45 || code === 48) return 'Nebel'
  if (code >= 51 && code <= 57) return 'Nieselregen'
  if (code >= 61 && code <= 67) return 'Regen'
  if (code >= 71 && code <= 77) return 'Schnee'
  if (code >= 80 && code <= 82) return 'Regenschauer'
  if (code >= 85 && code <= 86) return 'Schneeschauer'
  if (code >= 95) return 'Gewitter'
  return ''
}

/** z. B. -45 → "45 min vor Sonnenuntergang" */
export function relText(min: number | null, event: string): string {
  if (min == null) return ''
  const a = Math.abs(min)
  const t = a >= 90 ? `${Math.floor(a / 60)} h ${a % 60 ? `${a % 60} min` : ''}`.trim() : `${a} min`
  if (min === 0) return `genau bei ${event}`
  return `${t} ${min < 0 ? 'vor' : 'nach'} ${event}`
}
