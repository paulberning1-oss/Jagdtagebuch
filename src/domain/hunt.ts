// Typen für Ansitz-Tagebuch und Sichtungen.
import { compass16 } from '../lib/geo'

export type HuntType = 'ansitz' | 'pirsch' | 'drueckjagd' | 'sonstige'

export const HUNT_TYPES: { id: HuntType; label: string }[] = [
  { id: 'ansitz', label: 'Ansitz' },
  { id: 'pirsch', label: 'Pirsch' },
  { id: 'drueckjagd', label: 'Drückjagd' },
  { id: 'sonstige', label: 'Sonstige' },
]

export const DISTURBANCES = [
  'Spaziergänger',
  'Hunde',
  'Landmaschinen',
  'Jogger/Radfahrer',
  'Reiter',
  'Fahrzeuge',
  'Schüsse',
  'Sonstiges',
] as const

export interface Kill {
  id: string
  speciesId: string
  sexAge: string
  time: number
  lat: number
  lng: number
  /** Gewicht aufgebrochen in kg */
  weightKg: number | null
}

export type WeatherStatus = 'pending' | 'ok' | 'error'

export interface Hunt {
  id: string
  standId: string | null
  /** Name des Sitzes zum Zeitpunkt des Ansitzes (falls er später umbenannt/gelöscht wird) */
  standName: string
  lat: number
  lng: number
  start: number
  end: number | null
  status: 'running' | 'done'
  huntType: HuntType
  targetSpecies: string[]
  success: boolean
  kills: Kill[]
  disturbances: string[]
  notes: string
  rating: number | null
  env: HuntEnv | null
  weatherStatus: WeatherStatus
  weatherError?: string
  weatherTries: number
  // ----- Erweiterung Tagebuch (alle optional – ältere Einträge haben sie nicht) -----
  /** Gewählter Anmarschweg (Objekt der Kategorie „anmarsch“) */
  routeId?: string | null
  /** Von Hand geänderte Bedingungen – überschreiben die automatisch geholten Werte (die bleiben in `env` erhalten) */
  overrides?: HuntOverrides
  /** Jagdliche Phase / Besonderheit, z. B. „Blattzeit (Rehwild)“ */
  phases?: string[]
  /** Eingeschätzte Wildaktivität 1 (sehr ruhig) … 5 (sehr rege) */
  activity?: number | null
  /** Erfolg: Details (Schussentfernung, Treffersitz, Nachsuche …) */
  successDetails?: string
  /** Fazit: Wie habe ich den Ansitz wahrgenommen? */
  conclusion?: string
  /** Fehler / Was mache ich nächstes Mal anders? */
  mistakes?: string
  demo?: boolean
  createdAt: number
  updatedAt: number
}

/** Von Hand geänderte Bedingungen eines Ansitzes */
export interface HuntOverrides {
  temperature?: number | null
  windDirection?: number | null
  windSpeed?: number | null
  humidity?: number | null
  pressure?: number | null
  pressureTrend?: PressureTrend | null
  precipitation?: number | null
  sunrise?: number | null
  sunset?: number | null
  moonIllumination?: number | null
  moonUp?: boolean | null
}

/** Vorschläge für die Altersschätzung je Wildart (frei änderbar) */
export const AGE_SUGGESTIONS: Record<string, string[]> = {
  rehwild: ['Kitz', 'Jährling', '2–3 Jahre', '4–6 Jahre', 'alt (7+)'],
  schwarzwild: ['Frischling', 'Überläufer', '2–4 Jahre', '5+ Jahre', 'alt'],
  rotwild: ['Kalb', 'Schmaltier / Spießer', '2–4 Jahre', '5–9 Jahre', 'alt (10+)'],
  damwild: ['Kalb', 'Schmaltier / Spießer', '2–4 Jahre', '5–8 Jahre', 'alt'],
  fuchs: ['Jungfuchs', 'adult', 'alt'],
}
export const AGE_DEFAULT = ['jung', 'mittelalt', 'alt']

export const ACTIVITY_LEVELS: { value: number; label: string }[] = [
  { value: 1, label: 'sehr ruhig' },
  { value: 2, label: 'ruhig' },
  { value: 3, label: 'normal' },
  { value: 4, label: 'rege' },
  { value: 5, label: 'sehr rege' },
]

/** Bedingungen eines Ansitzes inkl. Handkorrekturen – das, was Anzeige, Statistik und Assistent verwenden */
export function effectiveEnv(h: Pick<Hunt, 'env' | 'overrides'>): HuntEnv | null {
  const env = h.env
  const o = h.overrides
  if (!env || !o) return env
  const pick = <T,>(v: T | null | undefined, fallback: T): T => (v === undefined || v === null ? fallback : v)
  const w = env.weather
  const weather: WeatherEnv | null =
    w || Object.values(o).some((v) => v != null)
      ? {
          ...(w ?? EMPTY_WEATHER),
          temperature: pick(o.temperature, w?.temperature ?? null),
          windDirection: pick(o.windDirection, w?.windDirection ?? null),
          windCompass: o.windDirection != null ? compass16(o.windDirection) : (w?.windCompass ?? null),
          // Handkorrektur der Windrichtung gilt auch für das Mittel über den Ansitz
          windDirectionAvg: o.windDirection != null ? o.windDirection : (w?.windDirectionAvg ?? null),
          windSpeed: pick(o.windSpeed, w?.windSpeed ?? null),
          windSpeedAvg: o.windSpeed != null ? o.windSpeed : (w?.windSpeedAvg ?? null),
          humidity: pick(o.humidity, w?.humidity ?? null),
          pressure: pick(o.pressure, w?.pressure ?? null),
          pressureTrend: pick(o.pressureTrend, w?.pressureTrend ?? null),
          precipitation: pick(o.precipitation, w?.precipitation ?? null),
        }
      : null
  return {
    ...env,
    weather,
    sun: { ...env.sun, sunrise: pick(o.sunrise, env.sun.sunrise), sunset: pick(o.sunset, env.sun.sunset) },
    moon: {
      ...env.moon,
      illumination: pick(o.moonIllumination, env.moon.illumination),
      upDuringHunt: pick(o.moonUp, env.moon.upDuringHunt),
      upPercent: o.moonUp === false ? 0 : o.moonUp === true && env.moon.upPercent === 0 ? 100 : env.moon.upPercent,
    },
  }
}

const EMPTY_WEATHER: WeatherEnv = {
  temperature: null,
  humidity: null,
  cloudCover: null,
  windDirection: null,
  windCompass: null,
  windSpeed: null,
  windDirectionAvg: null,
  windSpeedAvg: null,
  gustsMax: null,
  pressure: null,
  pressureDelta3h: null,
  pressureDelta12h: null,
  pressureTrend: null,
  precipitation: null,
  precipitation24h: null,
  snowDepthCm: null,
  weatherCode: null,
  source: 'forecast',
  fetchedAt: 0,
}

export type SightingSource = 'eigen' | 'wildkamera' | 'mitjaeger'

export const SIGHTING_SOURCES: { id: SightingSource; label: string }[] = [
  { id: 'eigen', label: 'Eigener Anblick' },
  { id: 'wildkamera', label: 'Wildkamera' },
  { id: 'mitjaeger', label: 'Mitjäger' },
]

export interface Sighting {
  id: string
  huntId: string | null
  time: number
  speciesId: string
  count: number
  sexAge: string[]
  behavior: string
  /** Zugrichtung in Grad (wohin das Wild zieht) */
  direction: number | null
  /** Altersschätzung (optional), z. B. „Jährling“ oder „4–6 Jahre“ */
  ageEstimate?: string
  lat: number
  lng: number
  source: SightingSource
  cameraId?: string | null
  notes: string
  photoIds: string[]
  /** Bedingungen – nur bei Sichtungen außerhalb eines Ansitzes (sonst gelten die des Ansitzes) */
  env?: HuntEnv | null
  weatherStatus?: WeatherStatus
  weatherError?: string
  weatherTries?: number
  demo?: boolean
  createdAt: number
}

// ---------- Automatisch ermittelte Bedingungen ----------

export type PressureTrend = 'steigend' | 'fallend' | 'gleichbleibend'
export type DayPeriod = 'Morgen' | 'Tag' | 'Abend' | 'Nacht'
export type Season = 'Frühling' | 'Sommer' | 'Herbst' | 'Winter'

export interface WeatherEnv {
  temperature: number | null
  humidity: number | null
  cloudCover: number | null
  /** Windrichtung (woher) bei Beginn, Grad */
  windDirection: number | null
  windCompass: string | null
  /** Windgeschwindigkeit bei Beginn, km/h */
  windSpeed: number | null
  /** Mittlere Windrichtung über den Ansitz */
  windDirectionAvg: number | null
  windSpeedAvg: number | null
  /** Stärkste Böe während des Ansitzes */
  gustsMax: number | null
  pressure: number | null
  /** Druckänderung in den 3 bzw. 12 Stunden vor Beginn (hPa) */
  pressureDelta3h: number | null
  pressureDelta12h: number | null
  pressureTrend: PressureTrend | null
  /** Niederschlag während des Ansitzes (mm) */
  precipitation: number | null
  /** Niederschlag in den 24 h vor Beginn (mm) */
  precipitation24h: number | null
  /** Schneehöhe in cm (nur > 0) */
  snowDepthCm: number | null
  weatherCode: number | null
  /** 'demo' = erfundene Werte der Testdaten */
  source: 'forecast' | 'archive' | 'demo'
  fetchedAt: number
}

export interface SunEnv {
  sunrise: number | null
  sunset: number | null
  civilDawn: number | null
  civilDusk: number | null
  nauticalDawn: number | null
  nauticalDusk: number | null
  /** Minuten des Beginns relativ zum Sonnenuntergang (negativ = vorher) */
  startMinFromSunset: number | null
  endMinFromSunset: number | null
  startMinFromSunrise: number | null
  endMinFromSunrise: number | null
  period: DayPeriod
}

export interface MoonEnv {
  /** 0 = Neumond, 0.25 = erstes Viertel, 0.5 = Vollmond, 0.75 = letztes Viertel */
  phase: number
  phaseName: string
  illumination: number
  moonrise: number | null
  moonset: number | null
  upDuringHunt: boolean
  /** Anteil der Ansitzzeit, in der der Mond über dem Horizont stand (0–100) */
  upPercent: number
}

export interface CalendarEnv {
  weekday: string
  month: number
  monthName: string
  season: Season
}

export interface HuntEnv {
  weather: WeatherEnv | null
  sun: SunEnv
  moon: MoonEnv
  calendar: CalendarEnv
}
