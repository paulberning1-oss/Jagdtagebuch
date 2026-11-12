// Wetterdaten von Open-Meteo (kostenlos, ohne API-Schlüssel).
// An Open-Meteo gehen NUR die Koordinaten und das Datum – keine Revierdaten.
//
// - Forecast-API: ca. 3 Monate zurück bis 16 Tage voraus
// - Archiv-API (historisch): alles Ältere

import { toBerlinDate, toBerlinLocal } from '../lib/time'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const DAY = 86400000

/** Bis wie viele Tage zurück die Forecast-API genutzt wird */
const FORECAST_PAST_DAYS = 85
const FORECAST_FUTURE_DAYS = 15

export interface HourlySeries {
  time: string[]
  [variable: string]: (number | null)[] | string[]
}

export class WeatherError extends Error {}

/**
 * Lädt stündliche Werte für einen Tageszeitraum (Berliner Datum, inklusive).
 * Wählt automatisch Forecast- oder Archiv-API.
 */
export async function fetchHourly(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
  variables: string[],
): Promise<HourlySeries> {
  const now = Date.now()
  const start = new Date(startDate + 'T12:00:00Z').getTime()
  const end = new Date(endDate + 'T12:00:00Z').getTime()
  if (end > now + FORECAST_FUTURE_DAYS * DAY) {
    throw new WeatherError('Für diesen Zeitpunkt gibt es noch keine Vorhersage (max. 15 Tage voraus).')
  }
  const useArchive = start < now - FORECAST_PAST_DAYS * DAY
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: variables.join(','),
    timezone: 'Europe/Berlin',
    start_date: startDate,
    end_date: endDate,
    wind_speed_unit: 'kmh',
  })
  if (!navigator.onLine) throw new WeatherError('Kein Internet – Wetter kann gerade nicht geladen werden.')
  let res: Response
  try {
    res = await fetch(`${useArchive ? ARCHIVE_URL : FORECAST_URL}?${params}`)
  } catch {
    throw new WeatherError('Wetterdienst nicht erreichbar.')
  }
  if (!res.ok) {
    let reason = ''
    try {
      reason = (await res.json()).reason ?? ''
    } catch {
      /* egal */
    }
    throw new WeatherError(`Wetterdienst meldet einen Fehler (${res.status}) ${reason}`.trim())
  }
  const json = await res.json()
  if (!json.hourly?.time) throw new WeatherError('Unerwartete Antwort vom Wetterdienst.')
  return json.hourly as HourlySeries
}

/** Index der Stunde, in die der Zeitpunkt fällt */
export function hourIndex(series: HourlySeries, at: Date): number {
  const key = toBerlinLocal(at).slice(0, 13) + ':00'
  return series.time.indexOf(key)
}

export interface WindAt {
  time: string
  direction: number
  speed: number
  gusts: number | null
}

const windCache = new Map<string, WindAt>()

/** Wind zu einem Zeitpunkt (stündlich gerundet) */
export async function fetchWindAt(lat: number, lng: number, at: Date): Promise<WindAt> {
  const day = toBerlinDate(at)
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${toBerlinLocal(at).slice(0, 13)}`
  const cached = windCache.get(key)
  if (cached) return cached
  const s = await fetchHourly(lat, lng, day, day, ['wind_direction_10m', 'wind_speed_10m', 'wind_gusts_10m'])
  const i = hourIndex(s, at)
  const dir = (s.wind_direction_10m as (number | null)[])[i]
  const spd = (s.wind_speed_10m as (number | null)[])[i]
  if (i < 0 || dir == null || spd == null) throw new WeatherError('Für diese Stunde liegen keine Winddaten vor.')
  const result: WindAt = {
    time: s.time[i] as string,
    direction: dir,
    speed: spd,
    gusts: (s.wind_gusts_10m as (number | null)[])[i] ?? null,
  }
  windCache.set(key, result)
  return result
}
