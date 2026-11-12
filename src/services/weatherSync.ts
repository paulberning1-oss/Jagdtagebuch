// Warteschlange für Wetterdaten: Ansitze werden sofort gespeichert, das Wetter
// wird nachgeladen, sobald Internet da ist (App-Start, "online", alle 5 Minuten).

import { db } from '../db/db'
import { computeWeather, HUNT_WEATHER_VARS, weatherDateRange } from '../domain/environment'
import type { Hunt, Sighting } from '../domain/hunt'
import { fetchHourlyWithSource, type HourlySeries } from './openMeteo'

/** Zwischenspeicher während eines Durchlaufs: gleicher Ort + gleiche Tage = nur eine Anfrage */
type SeriesCache = Map<string, Promise<{ series: HourlySeries; source: 'forecast' | 'archive' }>>

function fetchCached(cache: SeriesCache | undefined, lat: number, lng: number, startDate: string, endDate: string) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${startDate},${endDate}`
  const hit = cache?.get(key)
  if (hit) return hit
  const p = fetchHourlyWithSource(lat, lng, startDate, endDate, HUNT_WEATHER_VARS)
  cache?.set(key, p)
  p.catch(() => cache?.delete(key))
  return p
}

const MAX_AUTO_TRIES = 5
let running: Promise<number> | null = null
/** Kam während eines Durchlaufs neue Arbeit dazu? Dann direkt danach noch einmal. */
let again = false

/** Wetter für einen beendeten Ansitz laden und speichern */
export async function loadHuntWeather(h: Hunt, cache?: SeriesCache): Promise<void> {
  if (h.end == null) return
  const { startDate, endDate } = weatherDateRange(h.start, h.end)
  try {
    const { series, source } = await fetchCached(cache, h.lat, h.lng, startDate, endDate)
    const weather = computeWeather(series, h.start, h.end, source)
    const fresh = await db.hunts.get(h.id)
    if (!fresh || fresh.start !== h.start || fresh.end !== h.end || fresh.lat !== h.lat) return // inzwischen geändert
    await db.hunts.update(h.id, {
      env: fresh.env ? { ...fresh.env, weather } : null,
      weatherStatus: 'ok',
      weatherError: undefined,
      weatherTries: (fresh.weatherTries ?? 0) + 1,
    })
  } catch (e) {
    await db.hunts.update(h.id, {
      weatherStatus: navigator.onLine ? 'error' : 'pending',
      weatherError: (e as Error).message,
      weatherTries: (h.weatherTries ?? 0) + (navigator.onLine ? 1 : 0),
    })
    throw e
  }
}

/** Wetter für eine einzelne Sichtung (außerhalb eines Ansitzes) laden */
export async function loadSightingWeather(s: Sighting, cache?: SeriesCache): Promise<void> {
  if (s.huntId) return
  const { startDate, endDate } = weatherDateRange(s.time, s.time)
  try {
    const { series, source } = await fetchCached(cache, s.lat, s.lng, startDate, endDate)
    const weather = computeWeather(series, s.time, s.time, source)
    const fresh = await db.sightings.get(s.id)
    if (!fresh || fresh.time !== s.time || fresh.lat !== s.lat || fresh.lng !== s.lng) return
    await db.sightings.update(s.id, {
      env: fresh.env ? { ...fresh.env, weather } : null,
      weatherStatus: 'ok',
      weatherError: undefined,
      weatherTries: (fresh.weatherTries ?? 0) + 1,
    })
  } catch (e) {
    await db.sightings.update(s.id, {
      weatherStatus: navigator.onLine ? 'error' : 'pending',
      weatherError: (e as Error).message,
      weatherTries: (s.weatherTries ?? 0) + (navigator.onLine ? 1 : 0),
    })
    throw e
  }
}

/** Alle offenen Ansitze und Sichtungen abarbeiten. Gibt die Zahl erfolgreich geladener zurück. */
export function syncPendingWeather(force = false): Promise<number> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    if (!navigator.onLine) return 0
    const open = await db.hunts
      .filter((h) => h.status === 'done' && h.weatherStatus !== 'ok' && (force || (h.weatherTries ?? 0) < MAX_AUTO_TRIES))
      .toArray()
    const openSightings = await db.sightings
      .filter((x) => !x.huntId && !!x.weatherStatus && x.weatherStatus !== 'ok' && (force || (x.weatherTries ?? 0) < MAX_AUTO_TRIES))
      .toArray()
    const cache: SeriesCache = new Map()
    let ok = 0
    for (const h of open) {
      try {
        await loadHuntWeather(h, cache)
        ok++
      } catch {
        /* Fehler steht am Eintrag */
      }
    }
    for (const x of openSightings) {
      try {
        await loadSightingWeather(x, cache)
        ok++
      } catch {
        /* Fehler steht am Eintrag */
      }
    }
    return ok
  })().finally(() => {
    running = null
    if (again) {
      again = false
      void syncPendingWeather()
    }
  })
  return running
}

/** Einmalig beim App-Start aufrufen */
export function startWeatherSync(): () => void {
  const run = () => void syncPendingWeather()
  run()
  window.addEventListener('online', run)
  const timer = setInterval(run, 5 * 60000)
  return () => {
    window.removeEventListener('online', run)
    clearInterval(timer)
  }
}
