// Bedingungen für einen geplanten Ansitz: Wettervorhersage (Open-Meteo) + Sonne/Mond/Kalender.
// Ohne Internet: Sonne/Mond trotzdem, Wind kann von Hand gewählt werden.
import { useEffect, useState } from 'react'
import { computeLocalEnv, computeWeather, HUNT_WEATHER_VARS, weatherDateRange } from '../domain/environment'
import type { HuntEnv, WeatherEnv } from '../domain/hunt'
import { compass16, type LatLng } from '../lib/geo'
import { fetchHourlyWithSource } from '../services/openMeteo'

export type WeatherState = { status: 'loading' } | { status: 'ok'; weather: WeatherEnv } | { status: 'error'; message: string }

const cache = new Map<string, WeatherEnv>()

export function usePlanConditions(center: LatLng | null, start: number, end: number, manualWind: number | null) {
  const [weather, setWeather] = useState<WeatherState>({ status: 'loading' })

  useEffect(() => {
    if (!center) return
    const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)},${start},${end}`
    const hit = cache.get(key)
    if (hit) return setWeather({ status: 'ok', weather: hit })
    let cancelled = false
    setWeather({ status: 'loading' })
    const { startDate, endDate } = weatherDateRange(start, end)
    fetchHourlyWithSource(center.lat, center.lng, startDate, endDate, HUNT_WEATHER_VARS)
      .then(({ series, source }) => {
        const w = computeWeather(series, start, end, source)
        cache.set(key, w)
        if (!cancelled) setWeather({ status: 'ok', weather: w })
      })
      .catch((e) => !cancelled && setWeather({ status: 'error', message: (e as Error).message }))
    return () => {
      cancelled = true
    }
  }, [center?.lat, center?.lng, start, end])

  let env: HuntEnv | null = null
  if (center) {
    const local = computeLocalEnv(start, end, center.lat, center.lng)
    let w: WeatherEnv | null = weather.status === 'ok' ? weather.weather : null
    if (manualWind != null) {
      // Wind von Hand: Vorhersage-Wind ersetzen (übriges Wetter bleibt, falls vorhanden)
      w = {
        ...(w ?? EMPTY_WEATHER),
        windDirection: manualWind,
        windDirectionAvg: manualWind,
        windCompass: compass16(manualWind),
        ...(w ? {} : { windSpeed: null, windSpeedAvg: null, gustsMax: null }),
      }
    }
    env = { weather: w, ...local }
  }
  return { env, weather }
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
