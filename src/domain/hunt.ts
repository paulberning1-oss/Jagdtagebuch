// Typen für Ansitz-Tagebuch und Sichtungen.

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
  demo?: boolean
  createdAt: number
  updatedAt: number
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
