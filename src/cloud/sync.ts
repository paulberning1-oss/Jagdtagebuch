// Abgleich der lokalen Datenbank (IndexedDB) mit dem Cloud-Konto (Supabase).
//
// Prinzip (offline zuerst):
// - Die App schreibt wie bisher nur lokal. Dieser Dienst gleicht im Hintergrund ab.
// - Für jeden Eintrag merken wir uns in `syncState` einen Fingerabdruck des zuletzt
//   abgeglichenen Inhalts. Weicht der lokale Inhalt davon ab → hochladen.
//   Fehlt der Eintrag lokal, ist aber in `syncState` → in der Cloud löschen.
// - Herunterladen: alle Cloud-Einträge, die seit dem letzten Abgleich geändert wurden.
//   Konflikt (lokal UND Cloud geändert): die lokale Änderung gewinnt.
// - Fotos: Daten-Eintrag in `records`, das Bild selbst im privaten Speicher `photos/<user>/<id>`.
// - Testdaten (demo: true) bleiben lokal.
import Dexie from 'dexie'
import { useSyncExternalStore } from 'react'
import { db, type Photo } from '../db/db'
import { DEFAULT_SPECIES } from '../domain/species'
import { PHOTO_BUCKET, supabase } from './supabase'

/** Tabellen, die mit dem Konto abgeglichen werden */
export const SYNCED_TABLES = ['species', 'settings', 'facilities', 'boundaries', 'photos', 'overlays', 'hunts', 'sightings'] as const
type SyncedTable = (typeof SYNCED_TABLES)[number]

/** Einstellungen, die nur zu diesem Gerät gehören */
const DEVICE_SETTINGS = new Set(['mapView'])

const BATCH = 200
/** Beim Herunterladen etwas überlappen – doppelt gelesene Einträge schaden nicht */
const PULL_OVERLAP_MS = 10_000
const INTERVAL_MS = 60_000
const DEBOUNCE_MS = 2_500

// ---------- Status für die Anzeige ----------

export interface SyncStatus {
  state: 'aus' | 'bereit' | 'läuft' | 'offline' | 'fehler'
  lastSync: number | null
  error: string | null
  /** Einträge, die noch nicht hochgeladen sind (Stand des letzten Abgleichs) */
  pending: number
}

let status: SyncStatus = { state: 'aus', lastSync: null, error: null, pending: 0 }
const listeners = new Set<() => void>()
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p }
  listeners.forEach((l) => l())
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

// ---------- Hilfen ----------

/** JSON mit sortierten Schlüsseln – die Cloud (jsonb) ändert die Reihenfolge */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}

/** Kurzer Fingerabdruck (cyrb53) */
function fingerprint(s: string): string {
  let h1 = 0xdeadbeef ^ s.length
  let h2 = 0x41c6ce57 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const hashOf = (data: unknown) => fingerprint(stableStringify(data))

const keyOf = (tbl: SyncedTable, row: Record<string, unknown>) => String(tbl === 'settings' ? row.key : row.id)

/** Gehört der Eintrag ins Konto? (Testdaten und Geräte-Einstellungen nicht) */
function shouldSync(tbl: SyncedTable, row: Record<string, unknown>) {
  if (row.demo) return false
  if (tbl === 'settings' && DEVICE_SETTINGS.has(String(row.key))) return false
  return true
}

/** Inhalt, der in die Cloud geht (Fotos ohne das Bild selbst) */
function toData(tbl: SyncedTable, row: Record<string, unknown>): Record<string, unknown> {
  if (tbl === 'photos') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { blob, ...rest } = row
    return JSON.parse(JSON.stringify(rest))
  }
  return JSON.parse(JSON.stringify(row))
}

const photoPath = (userId: string, id: string) => `${userId}/${id}`

async function meta<T>(key: string): Promise<T | undefined> {
  return (await db.syncMeta.get(key))?.value as T | undefined
}
const setMeta = (key: string, value: unknown) => db.syncMeta.put({ key, value })

async function statesOf(tbl: SyncedTable) {
  const rows = await db.syncState.where('[tbl+id]').between([tbl, Dexie.minKey], [tbl, Dexie.maxKey]).toArray()
  return new Map(rows.map((r) => [r.id, r.hash]))
}

// ---------- Konto wechseln ----------

/** Lokale Kontodaten löschen (z. B. wenn sich ein anderes Konto anmeldet). Testdaten bleiben. */
async function wipeLocalAccountData() {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState, db.syncMeta], async () => {
    for (const t of SYNCED_TABLES) {
      if (t === 'species' || t === 'settings') await db.table(t).clear()
      else await db.table(t).filter((r: { demo?: boolean }) => !r.demo).delete()
    }
    await db.species.bulkAdd(DEFAULT_SPECIES)
    await db.syncState.clear()
    await db.syncMeta.clear()
  })
}

// ---------- Herunterladen ----------

interface RemoteRow {
  tbl: string
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  updated_at: string
}

async function pull(userId: string) {
  const sb = supabase!
  const cursor = await meta<string>('cursor')
  const since = cursor ? new Date(new Date(cursor).getTime() - PULL_OVERLAP_MS).toISOString() : null

  const remote: RemoteRow[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from('records').select('tbl,id,data,deleted,updated_at').order('updated_at', { ascending: true }).range(from, from + 999)
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q
    if (error) throw error
    remote.push(...(data as RemoteRow[]))
    if (data.length < 1000) break
  }
  if (!remote.length) return

  const states = new Map<SyncedTable, Map<string, string>>()
  let maxTs = cursor ?? ''
  for (const r of remote) {
    if (r.updated_at > maxTs) maxTs = r.updated_at
    if (!(SYNCED_TABLES as readonly string[]).includes(r.tbl)) continue
    const tbl = r.tbl as SyncedTable
    if (!states.has(tbl)) states.set(tbl, await statesOf(tbl))
    const stateHash = states.get(tbl)!.get(r.id)
    const remoteHash = r.deleted || !r.data ? null : hashOf(r.data)
    if (remoteHash === (stateHash ?? null)) continue // nichts Neues (z. B. eigene Änderung)

    const table = db.table(tbl)
    const local = (await table.get(r.id)) as Record<string, unknown> | undefined
    const localHash = local && shouldSync(tbl, local) ? hashOf(toData(tbl, local)) : null
    if (localHash === remoteHash) {
      // Schon gleich – nur den Stand merken
      if (remoteHash) await db.syncState.put({ tbl, id: r.id, hash: remoteHash })
      else await db.syncState.delete([tbl, r.id])
      continue
    }
    // Konflikt: lokal seit dem letzten Abgleich geändert → lokale Änderung gewinnt (wird gleich hochgeladen)
    if (stateHash !== undefined && localHash !== stateHash) continue
    if (local?.demo) continue // Testdaten nie überschreiben

    if (!remoteHash) {
      await table.delete(r.id)
      await db.syncState.delete([tbl, r.id])
      continue
    }
    let row: Record<string, unknown> = r.data!
    if (tbl === 'photos') {
      const { data: blob, error } = await sb.storage.from(PHOTO_BUCKET).download(photoPath(userId, r.id))
      if (error || !blob) continue // beim nächsten Abgleich erneut versuchen
      row = { ...row, blob }
    }
    await table.put(row)
    await db.syncState.put({ tbl, id: r.id, hash: remoteHash })
  }
  if (maxTs && maxTs !== cursor) await setMeta('cursor', maxTs)
}

// ---------- Hochladen ----------

async function push(userId: string) {
  const sb = supabase!
  let pending = 0
  for (const tbl of SYNCED_TABLES) {
    const rows = (await db.table(tbl).toArray()) as Record<string, unknown>[]
    const states = await statesOf(tbl)
    const seen = new Set<string>()
    const changed: { id: string; data: Record<string, unknown>; hash: string; row: Record<string, unknown> }[] = []
    for (const row of rows) {
      if (!shouldSync(tbl, row)) continue
      const id = keyOf(tbl, row)
      seen.add(id)
      const data = toData(tbl, row)
      const hash = hashOf(data)
      if (states.get(id) !== hash) changed.push({ id, data, hash, row })
    }
    const removed = [...states.keys()].filter((id) => !seen.has(id))
    pending += changed.length + removed.length

    for (let i = 0; i < changed.length; i += BATCH) {
      const part = changed.slice(i, i + BATCH)
      if (tbl === 'photos') {
        for (const c of part) {
          const p = c.row as unknown as Photo
          const { error } = await sb.storage
            .from(PHOTO_BUCKET)
            .upload(photoPath(userId, c.id), p.blob, { upsert: true, contentType: p.mime || 'image/jpeg' })
          if (error) throw error
        }
      }
      const { error } = await sb
        .from('records')
        .upsert(
          part.map((c) => ({ user_id: userId, tbl, id: c.id, data: c.data, deleted: false })),
          { onConflict: 'user_id,tbl,id' },
        )
      if (error) throw error
      await db.syncState.bulkPut(part.map((c) => ({ tbl, id: c.id, hash: c.hash })))
      pending -= part.length
      setStatus({ pending })
    }

    for (let i = 0; i < removed.length; i += BATCH) {
      const part = removed.slice(i, i + BATCH)
      if (tbl === 'photos') {
        await sb.storage.from(PHOTO_BUCKET).remove(part.map((id) => photoPath(userId, id)))
      }
      const { error } = await sb
        .from('records')
        .upsert(
          part.map((id) => ({ user_id: userId, tbl, id, data: null, deleted: true })),
          { onConflict: 'user_id,tbl,id' },
        )
      if (error) throw error
      await db.syncState.bulkDelete(part.map((id) => [tbl, id] as [string, string]))
      pending -= part.length
      setStatus({ pending })
    }
  }
}

/** Wie viele Einträge sind lokal geändert, aber noch nicht in der Cloud? */
export async function countPending(): Promise<number> {
  let n = 0
  for (const tbl of SYNCED_TABLES) {
    const rows = (await db.table(tbl).toArray()) as Record<string, unknown>[]
    const states = await statesOf(tbl)
    const seen = new Set<string>()
    for (const row of rows) {
      if (!shouldSync(tbl, row)) continue
      const id = keyOf(tbl, row)
      seen.add(id)
      if (states.get(id) !== hashOf(toData(tbl, row))) n++
    }
    for (const id of states.keys()) if (!seen.has(id)) n++
  }
  return n
}

// ---------- Ablauf ----------

let currentUser: string | null = null
let running: Promise<void> | null = null
let again = false

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Konto auf diesem Gerät aktivieren. Anderes Konto als zuletzt? Dann dessen Daten nicht übernehmen. */
export async function activateAccount(userId: string) {
  const lastUser = await meta<string>('userId')
  if (lastUser && lastUser !== userId) await wipeLocalAccountData()
  await setMeta('userId', userId)
  currentUser = userId
}

/** Konto auf diesem Gerät abmelden (lokale Daten bleiben, bis sich ein anderes Konto anmeldet) */
export function deactivateAccount() {
  currentUser = null
}

/** Einmal abgleichen (läuft schon einer, wird danach noch einmal abgeglichen) */
export function syncNow(): Promise<void> {
  if (!supabase || !currentUser) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  const userId = currentUser
  running = (async () => {
    if (isOffline()) {
      setStatus({ state: 'offline', pending: await countPending() })
      return
    }
    setStatus({ state: 'läuft', error: null })
    try {
      await pull(userId)
      await push(userId)
      await setMeta('lastSync', Date.now())
      setStatus({ state: 'bereit', lastSync: Date.now(), error: null, pending: 0 })
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      const offline = isOffline() || /fetch|network|Load failed/i.test(msg)
      setStatus({ state: offline ? 'offline' : 'fehler', error: offline ? null : msg, pending: await countPending() })
    }
  })().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

/** Abgleich für ein angemeldetes Konto starten. Gibt eine Stopp-Funktion zurück. */
export function startCloudSync(userId: string): () => void {
  if (!supabase) return () => {}
  let stopped = false
  let debounce: ReturnType<typeof setTimeout> | undefined

  ;(async () => {
    await activateAccount(userId)
    if (stopped) return deactivateAccount()
    setStatus({ state: 'bereit', lastSync: (await meta<number>('lastSync')) ?? null })
    void syncNow()
  })()

  const trigger = () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS)
  }
  // Nach jeder lokalen Änderung an Kontodaten (nicht an den Sync-Tabellen selbst)
  const watched = new RegExp(`^idb://ansitzplaner/(${SYNCED_TABLES.join('|')})(/|$)`)
  const onMutated = (parts: Record<string, unknown>) => {
    if (Object.keys(parts).some((k) => watched.test(k))) trigger()
  }
  const onVisible = () => document.visibilityState === 'visible' && trigger()
  Dexie.on('storagemutated', onMutated)
  window.addEventListener('online', trigger)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(() => void syncNow(), INTERVAL_MS)

  return () => {
    stopped = true
    deactivateAccount()
    clearTimeout(debounce)
    clearInterval(timer)
    Dexie.on('storagemutated').unsubscribe(onMutated)
    window.removeEventListener('online', trigger)
    document.removeEventListener('visibilitychange', onVisible)
    setStatus({ state: 'aus' })
  }
}
