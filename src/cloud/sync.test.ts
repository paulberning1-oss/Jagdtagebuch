// Tests für den Cloud-Abgleich: nachgebaute Supabase-Cloud im Speicher, zwei „Geräte“ nacheinander.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Row {
  user_id: string
  tbl: string
  id: string
  data: Record<string, unknown> | null
  deleted: boolean
  updated_at: string
}

// ---------- Nachgebaute Cloud ----------
const cloud = vi.hoisted(() => {
  const records = new Map<string, Row>()
  const files = new Map<string, Blob>()
  let clock = Date.UTC(2026, 0, 1)
  const now = () => new Date((clock += 1000)).toISOString()

  const select = () => {
    let since: string | null = null
    let from = 0
    let to = 999
    const b = {
      order: () => b,
      range: (f: number, t: number) => ((from = f), (to = t), b),
      gt: (_c: string, v: string) => ((since = v), b),
      then: (res: (v: unknown) => void) => {
        const all = [...records.values()]
          .filter((r) => !since || r.updated_at > since)
          .sort((a, c) => a.updated_at.localeCompare(c.updated_at))
          .slice(from, to + 1)
          .map((r) => ({ ...r, data: r.data ? JSON.parse(JSON.stringify(r.data)) : null }))
        res({ data: all, error: null })
      },
    }
    return b
  }
  const supabase = {
    from: () => ({
      select,
      upsert: (rows: Omit<Row, 'updated_at'>[]) => {
        for (const r of rows) records.set(`${r.user_id}|${r.tbl}|${r.id}`, { ...r, updated_at: now() } as Row)
        return Promise.resolve({ error: null })
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, blob: Blob) => (files.set(path, blob), Promise.resolve({ error: null })),
        download: (path: string) =>
          Promise.resolve(files.has(path) ? { data: files.get(path), error: null } : { data: null, error: new Error('404') }),
        remove: (paths: string[]) => (paths.forEach((p) => files.delete(p)), Promise.resolve({ error: null })),
      }),
    },
  }
  return { records, files, supabase }
})

vi.mock('./supabase', () => ({ supabase: cloud.supabase, cloudEnabled: true, PHOTO_BUCKET: 'photos' }))

const { db } = await import('../db/db')
const { activateAccount, countPending, syncNow } = await import('./sync')

const ALICE = 'user-alice'
const BOB = 'user-bob'

/** Neues Gerät simulieren: lokale Datenbank komplett leer (nur Startliste Wildarten) */
async function freshDevice() {
  await db.delete()
  await db.open()
}

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [7.2, 52.52],
      [7.21, 52.52],
      [7.21, 52.53],
      [7.2, 52.52],
    ],
  ],
}

beforeEach(async () => {
  cloud.records.clear()
  cloud.files.clear()
  await freshDevice()
})

describe('Cloud-Abgleich', () => {
  it('sichert die Reviergrenze im Konto und holt sie auf ein neues Gerät', async () => {
    await activateAccount(ALICE)
    await db.boundaries.add({ id: 'b1', name: 'Reviergrenze EJ Brögber', geometry: square, createdAt: 1 })
    await syncNow()
    expect(await countPending()).toBe(0)
    expect(cloud.records.get(`${ALICE}|boundaries|b1`)?.data?.name).toBe('Reviergrenze EJ Brögber')

    await freshDevice()
    expect(await db.boundaries.count()).toBe(0)
    await activateAccount(ALICE)
    await syncNow()
    const b = await db.boundaries.get('b1')
    expect(b?.name).toBe('Reviergrenze EJ Brögber')
    expect(b?.geometry).toEqual(square)
  })

  it('überträgt Änderungen und Löschungen zwischen Geräten', async () => {
    await activateAccount(ALICE)
    await db.boundaries.add({ id: 'b1', name: 'Alt', geometry: square, createdAt: 1 })
    await syncNow()

    // Gerät B holt, ändert den Namen
    await freshDevice()
    await activateAccount(ALICE)
    await syncNow()
    await db.boundaries.update('b1', { name: 'Neu' })
    await syncNow()
    expect(cloud.records.get(`${ALICE}|boundaries|b1`)?.data?.name).toBe('Neu')

    // Löschen wird als gelöscht markiert
    await db.boundaries.delete('b1')
    await syncNow()
    expect(cloud.records.get(`${ALICE}|boundaries|b1`)?.deleted).toBe(true)

    // Ein weiteres Gerät bekommt die Grenze gar nicht erst
    await freshDevice()
    await activateAccount(ALICE)
    await syncNow()
    expect(await db.boundaries.count()).toBe(0)
  })

  it('löscht auf dem anderen Gerät, wenn in der Cloud gelöscht wurde', async () => {
    await activateAccount(ALICE)
    await db.boundaries.add({ id: 'b1', name: 'X', geometry: square, createdAt: 1 })
    await syncNow()
    // Anderes Gerät löscht → simuliert über die Cloud
    const r = cloud.records.get(`${ALICE}|boundaries|b1`)!
    cloud.records.set(`${ALICE}|boundaries|b1`, { ...r, data: null, deleted: true, updated_at: '2030-01-01T00:00:00.000Z' })
    await syncNow()
    expect(await db.boundaries.get('b1')).toBeUndefined()
  })

  it('sichert Fotos samt Bild', async () => {
    await activateAccount(ALICE)
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    await db.photos.add({ id: 'p1', blob, mime: 'image/jpeg', width: 10, height: 20, createdAt: 1 })
    await syncNow()
    expect(cloud.files.has(`${ALICE}/p1`)).toBe(true)
    expect(cloud.records.get(`${ALICE}|photos|p1`)?.data).not.toHaveProperty('blob')

    await freshDevice()
    await activateAccount(ALICE)
    await syncNow()
    const p = await db.photos.get('p1')
    expect(p?.width).toBe(10)
    expect(await p!.blob.text()).toBe('jpeg-bytes')
  })

  it('lädt Testdaten und den Kartenausschnitt nicht hoch', async () => {
    await activateAccount(ALICE)
    await db.boundaries.add({ id: 'demo', name: 'Demo', geometry: square, demo: true, createdAt: 1 })
    await db.settings.put({ key: 'mapView', value: { lat: 1, lng: 2, zoom: 3 } })
    await db.settings.put({ key: 'scentLength', value: 500 })
    await syncNow()
    expect(cloud.records.has(`${ALICE}|boundaries|demo`)).toBe(false)
    expect(cloud.records.has(`${ALICE}|settings|mapView`)).toBe(false)
    expect(cloud.records.get(`${ALICE}|settings|scentLength`)?.data).toEqual({ key: 'scentLength', value: 500 })
  })

  it('übernimmt keine Daten eines anderen Kontos auf demselben Gerät', async () => {
    await activateAccount(ALICE)
    await db.boundaries.add({ id: 'b1', name: 'Alice', geometry: square, createdAt: 1 })
    await syncNow()

    await activateAccount(BOB)
    expect(await db.boundaries.count()).toBe(0)
    expect(await db.species.count()).toBeGreaterThan(0) // Startliste Wildarten wieder da
    await syncNow()
    expect(cloud.records.has(`${BOB}|boundaries|b1`)).toBe(false)
  })

  it('erzeugt beim erneuten Abgleich ohne Änderungen keine neuen Uploads', async () => {
    await activateAccount(ALICE)
    await db.boundaries.add({ id: 'b1', name: 'X', geometry: square, createdAt: 1 })
    await syncNow()
    const before = cloud.records.get(`${ALICE}|boundaries|b1`)!.updated_at
    await syncNow()
    await syncNow()
    expect(cloud.records.get(`${ALICE}|boundaries|b1`)!.updated_at).toBe(before)
  })
})
