// Offline-Kacheln: eigene kleine Datenbank NUR auf diesem Gerät (wird nicht synchronisiert, nicht gesichert).
// Nur Anbieter, die das Vorab-Speichern erlauben (`offlineCacheable`), siehe providers.ts.
import Dexie, { type EntityTable } from 'dexie'
import type { Bounds } from '../db/ownData'
import { tileKey, tilesIn, type TileXYZ } from './tileMath'

export interface StoredTile {
  /** `<anbieter>/<z>/<x>/<y>` */
  key: string
  provider: string
  blob: Blob
  savedAt: number
}

/** Was für einen Anbieter gespeichert ist */
export interface TilePack {
  provider: string
  bounds: Bounds
  minZoom: number
  maxZoom: number
  count: number
  bytes: number
  /** Kacheln, die nicht geladen werden konnten */
  failed: number
  savedAt: number
  /** Download wurde abgebrochen (Teil gespeichert) */
  partial: boolean
}

class TileDB extends Dexie {
  tiles!: EntityTable<StoredTile, 'key'>
  packs!: EntityTable<TilePack, 'provider'>
  constructor() {
    super('ansitzplaner-kacheln')
    this.version(1).stores({ tiles: '&key, provider', packs: '&provider' })
  }
}

export const tileDb = new TileDB()

// Schnelle Prüfung beim Zeichnen: welche Schlüssel liegen vor? (null = noch nicht geladen)
let keys: Set<string> | null = null
const keysReady = tileDb.tiles
  .toCollection()
  .primaryKeys()
  .then((k) => (keys = new Set(k as string[])))
  .catch(() => (keys = new Set()))

/** Gespeicherte Kachel holen – oder undefined (dann aus dem Internet) */
export async function storedTile(key: string): Promise<Blob | undefined> {
  if (keys && !keys.has(key)) return undefined
  try {
    return (await tileDb.tiles.get(key))?.blob
  } catch {
    return undefined
  }
}

export interface DownloadProgress {
  done: number
  total: number
  failed: number
  bytes: number
}

/**
 * Lädt alle Kacheln des Gebiets (grob → fein). Bereits gespeicherte werden übersprungen (Fortsetzen nach Abbruch).
 * Wenige gleichzeitige Anfragen, um die Server der Anbieter nicht zu belasten.
 */
export async function downloadTiles(opts: {
  provider: string
  url: (t: TileXYZ) => string
  bounds: Bounds
  minZoom: number
  maxZoom: number
  total: number
  signal: AbortSignal
  onProgress: (p: DownloadProgress) => void
  parallel?: number
}): Promise<DownloadProgress> {
  await keysReady
  // Dauerhaften Speicher anfragen, damit Safari die Kacheln (und alles andere) nicht wegräumt
  await navigator.storage?.persist?.().catch(() => false)
  const p: DownloadProgress = { done: 0, total: opts.total, failed: 0, bytes: 0 }
  const it = tilesIn(opts.bounds, opts.minZoom, opts.maxZoom)
  let last = 0
  const report = () => {
    const now = Date.now()
    if (now - last > 150 || p.done === p.total) {
      last = now
      opts.onProgress({ ...p })
    }
  }

  const fetchOne = async (t: TileXYZ) => {
    const key = tileKey(opts.provider, t)
    if (keys?.has(key)) {
      const old = await tileDb.tiles.get(key)
      p.bytes += old?.blob.size ?? 0
      return
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (opts.signal.aborted) return
      try {
        const res = await fetch(opts.url(t), { signal: opts.signal, mode: 'cors' })
        const type = res.headers.get('content-type') ?? ''
        if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type}`)
        const blob = await res.blob()
        await tileDb.tiles.put({ key, provider: opts.provider, blob, savedAt: Date.now() })
        keys?.add(key)
        p.bytes += blob.size
        return
      } catch {
        if (opts.signal.aborted) return
        if (attempt === 1) p.failed++
        else await new Promise((r) => setTimeout(r, 800))
      }
    }
  }

  const worker = async () => {
    for (;;) {
      if (opts.signal.aborted) return
      const n = it.next()
      if (n.done) return
      await fetchOne(n.value)
      if (opts.signal.aborted) return
      p.done++
      report()
    }
  }
  await Promise.all(Array.from({ length: opts.parallel ?? 4 }, worker))
  opts.onProgress({ ...p })

  const count = await tileDb.tiles.where('provider').equals(opts.provider).count()
  await tileDb.packs.put({
    provider: opts.provider,
    bounds: opts.bounds,
    minZoom: opts.minZoom,
    maxZoom: opts.maxZoom,
    count,
    bytes: p.bytes,
    failed: p.failed,
    savedAt: Date.now(),
    partial: opts.signal.aborted,
  })
  return p
}

/** Alle gespeicherten Kacheln eines Anbieters löschen */
export async function deleteTiles(provider: string) {
  await keysReady
  await tileDb.transaction('rw', tileDb.tiles, tileDb.packs, async () => {
    await tileDb.tiles.where('provider').equals(provider).delete()
    await tileDb.packs.delete(provider)
  })
  if (keys) for (const k of [...keys]) if (k.startsWith(provider + '/')) keys.delete(k)
}
