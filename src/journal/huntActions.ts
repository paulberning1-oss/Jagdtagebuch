// Ansitz starten, beenden, nachtragen, löschen – alles sofort lokal gespeichert.
import { db, type Facility } from '../db/db'
import { computeLocalEnv } from '../domain/environment'
import type { Hunt, Sighting } from '../domain/hunt'
import { fromPos, type LatLng } from '../lib/geo'
import { newId } from '../lib/id'
import { syncPendingWeather } from '../services/weatherSync'

export async function getRunningHunt(): Promise<Hunt | undefined> {
  return db.hunts.where('status').equals('running').first()
}

function baseHunt(where: { stand?: Facility; pos?: LatLng; name?: string }, start: number, end: number | null): Hunt {
  const pos = where.stand && where.stand.geometry.type === 'Point' ? fromPos(where.stand.geometry.coordinates) : where.pos!
  const now = Date.now()
  return {
    id: newId(),
    standId: where.stand?.id ?? null,
    standName: where.stand?.name ?? where.name ?? 'Ohne festen Sitz',
    lat: pos.lat,
    lng: pos.lng,
    start,
    end,
    status: end == null ? 'running' : 'done',
    huntType: 'ansitz',
    targetSpecies: [],
    success: false,
    kills: [],
    disturbances: [],
    notes: '',
    rating: null,
    // Sonne/Mond/Kalender gleich lokal berechnen; Wetter folgt
    env: { weather: null, ...computeLocalEnv(start, end ?? start, pos.lat, pos.lng) },
    weatherStatus: 'pending',
    weatherTries: 0,
    demo: where.stand?.demo,
    createdAt: now,
    updatedAt: now,
  }
}

/** Startet einen Ansitz jetzt. Gibt die ID zurück. */
export async function startHunt(where: { stand?: Facility; pos?: LatLng }): Promise<string> {
  const running = await getRunningHunt()
  if (running) throw new Error(`Es läuft bereits ein Ansitz (${running.standName}).`)
  const h = baseHunt(where, Date.now(), null)
  if (!where.stand) h.huntType = 'pirsch'
  await db.hunts.add(h)
  return h.id
}

/** Beendet den Ansitz jetzt und stößt das Laden der Wetterdaten an */
export async function endHunt(id: string): Promise<void> {
  const h = await db.hunts.get(id)
  if (!h) return
  const end = Math.max(Date.now(), h.start + 60000)
  await db.hunts.update(id, {
    end,
    status: 'done',
    env: { weather: null, ...computeLocalEnv(h.start, end, h.lat, h.lng) },
    weatherStatus: 'pending',
    weatherTries: 0,
    updatedAt: Date.now(),
  })
  syncPendingWeather()
}

/** Nachträglicher Eintrag für einen vergangenen Zeitraum */
export async function createPastHunt(stand: Facility | undefined, pos: LatLng | undefined, start: number, end: number): Promise<string> {
  if (end <= start) throw new Error('Das Ende muss nach dem Beginn liegen.')
  if (end > Date.now() + 5 * 60000) throw new Error('Das Ende liegt in der Zukunft.')
  const h = baseHunt({ stand, pos }, start, end)
  await db.hunts.add(h)
  syncPendingWeather()
  return h.id
}

/**
 * Zeit oder Ort eines Ansitzes geändert → Sonne/Mond neu berechnen, Wetter neu laden.
 */
export async function changeHuntTimeOrPlace(id: string, patch: Partial<Pick<Hunt, 'start' | 'end' | 'standId' | 'standName' | 'lat' | 'lng'>>) {
  const h = await db.hunts.get(id)
  if (!h) return
  const next = { ...h, ...patch }
  const end = next.end ?? next.start
  await db.hunts.update(id, {
    ...patch,
    env: { weather: null, ...computeLocalEnv(next.start, end, next.lat, next.lng) },
    weatherStatus: 'pending',
    weatherTries: 0,
    weatherError: undefined,
    updatedAt: Date.now(),
  })
  if (next.status === 'done') syncPendingWeather()
}

export async function deleteHunt(id: string) {
  await db.transaction('rw', [db.hunts, db.sightings, db.photos], async () => {
    const s = await db.sightings.where('huntId').equals(id).toArray()
    const photoIds = s.flatMap((x) => x.photoIds)
    if (photoIds.length) await db.photos.bulkDelete(photoIds)
    await db.sightings.bulkDelete(s.map((x) => x.id))
    await db.hunts.delete(id)
  })
}

/** Neue Sichtung mit sinnvollen Vorgaben (Zeit jetzt bzw. im Ansitz, Ort = Sitz) */
export function newSighting(h: Hunt | null, pos: LatLng, speciesId: string): Sighting {
  const now = Date.now()
  let time = now
  if (h && h.end && (now < h.start || now > h.end)) time = h.start + Math.round((h.end - h.start) / 2)
  return {
    id: newId(),
    huntId: h?.id ?? null,
    time,
    speciesId,
    count: 1,
    sexAge: [],
    behavior: '',
    direction: null,
    lat: pos.lat,
    lng: pos.lng,
    source: 'eigen',
    notes: '',
    photoIds: [],
    demo: h?.demo,
    createdAt: now,
  }
}

/**
 * Sichtung speichern. Sichtungen außerhalb eines Ansitzes bekommen eigene
 * Bedingungen (Sonne/Mond sofort, Wetter über die Warteschlange).
 */
export async function saveSighting(s: Sighting): Promise<void> {
  // Entfernte Fotos auch aus der Datenbank löschen
  const before = await db.sightings.get(s.id)
  const removed = before?.photoIds.filter((p) => !s.photoIds.includes(p)) ?? []
  if (removed.length) await db.photos.bulkDelete(removed)
  if (s.huntId) {
    await db.sightings.put({ ...s, env: undefined, weatherStatus: undefined })
    return
  }
  const old = await db.sightings.get(s.id)
  const unchanged = old && old.time === s.time && old.lat === s.lat && old.lng === s.lng && old.env
  const next: Sighting = unchanged
    ? s
    : {
        ...s,
        env: { weather: null, ...computeLocalEnv(s.time, s.time, s.lat, s.lng) },
        weatherStatus: s.env?.weather?.source === 'demo' ? 'ok' : 'pending',
        weatherTries: 0,
        weatherError: undefined,
      }
  await db.sightings.put(next)
  if (next.weatherStatus === 'pending') syncPendingWeather()
}

/** Mehrere Sichtungen auf einmal speichern (Wildkamera-Import) */
export async function saveSightings(list: Sighting[]): Promise<void> {
  const rows = list.map((s) => ({
    ...s,
    env: { weather: null, ...computeLocalEnv(s.time, s.time, s.lat, s.lng) },
    weatherStatus: 'pending' as const,
    weatherTries: 0,
  }))
  await db.sightings.bulkPut(rows)
  syncPendingWeather()
}

export async function deleteSighting(id: string) {
  const s = await db.sightings.get(id)
  if (!s) return
  if (s.photoIds.length) await db.photos.bulkDelete(s.photoIds)
  await db.sightings.delete(id)
}
