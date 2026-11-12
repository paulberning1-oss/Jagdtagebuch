// Warteschlange für Wetterdaten: Ansitze werden sofort gespeichert, das Wetter
// wird nachgeladen, sobald Internet da ist (App-Start, "online", alle 5 Minuten).

import { db } from '../db/db'
import { computeWeather, HUNT_WEATHER_VARS, weatherDateRange } from '../domain/environment'
import type { Hunt } from '../domain/hunt'
import { fetchHourlyWithSource } from './openMeteo'

const MAX_AUTO_TRIES = 5
let running: Promise<number> | null = null

/** Wetter für einen beendeten Ansitz laden und speichern */
export async function loadHuntWeather(h: Hunt): Promise<void> {
  if (h.end == null) return
  const { startDate, endDate } = weatherDateRange(h.start, h.end)
  try {
    const { series, source } = await fetchHourlyWithSource(h.lat, h.lng, startDate, endDate, HUNT_WEATHER_VARS)
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

/** Alle offenen Ansitze abarbeiten. Gibt die Zahl erfolgreich geladener zurück. */
export function syncPendingWeather(force = false): Promise<number> {
  if (running) return running
  running = (async () => {
    if (!navigator.onLine) return 0
    const open = await db.hunts
      .filter((h) => h.status === 'done' && h.weatherStatus !== 'ok' && (force || (h.weatherTries ?? 0) < MAX_AUTO_TRIES))
      .toArray()
    let ok = 0
    for (const h of open) {
      try {
        await loadHuntWeather(h)
        ok++
      } catch {
        /* Fehler steht am Eintrag */
      }
    }
    return ok
  })().finally(() => {
    running = null
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
