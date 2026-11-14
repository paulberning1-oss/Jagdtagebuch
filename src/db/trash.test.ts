import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Facility } from './db'
import { daysLeft, purgeOldTrash, purgeTrash, restoreTrash, trashBoundaries, trashFacilities } from './trash'

const DAY = 86400000

function fac(id: string, type: string, extra: Partial<Facility> = {}): Facility {
  return { id, type, name: id, geometry: { type: 'Point', coordinates: [7.21, 52.52] }, notes: '', photoIds: [], createdAt: 0, updatedAt: 0, ...extra }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Zuletzt gelöscht', () => {
  it('verschiebt mehrere Objekte auf einmal und stellt sie unverändert wieder her', async () => {
    await db.facilities.bulkAdd([fac('h1', 'hochsitz', { bearing: 90, fieldRange: 200 }), fac('h2', 'hochsitz'), fac('k1', 'kirrung')])
    expect(await trashFacilities(['h1', 'h2'])).toBe(2)
    expect(await db.facilities.count()).toBe(1)
    const entries = await db.trash.toArray()
    expect(entries.map((e) => e.label).sort()).toEqual(['h1', 'h2'])
    expect(entries[0].kind).toBe('Hochsitz')

    await restoreTrash(entries.map((e) => e.id))
    expect(await db.trash.count()).toBe(0)
    const h1 = await db.facilities.get('h1')
    expect(h1).toMatchObject({ bearing: 90, fieldRange: 200, type: 'hochsitz' })
  })

  it('nimmt beim Sitz seine Anmarschwege mit (gleiche Gruppe)', async () => {
    await db.facilities.bulkAdd([
      fac('sitz', 'hochsitz', { name: 'Eiche' }),
      fac('weg', 'anmarsch', { standId: 'sitz', geometry: { type: 'LineString', coordinates: [[7.2, 52.5], [7.21, 52.52]] } }),
      fac('fremd', 'anmarsch', { standId: 'anderer' }),
    ])
    expect(await trashFacilities(['sitz'])).toBe(2)
    const entries = await db.trash.toArray()
    expect(new Set(entries.map((e) => e.batch)).size).toBe(1)
    expect(entries.find((e) => e.item.id === 'weg')?.label).toBe('weg (zu Eiche)')
    expect(await db.facilities.get('fremd')).toBeDefined()
  })

  it('behält Fotos bis zum endgültigen Löschen', async () => {
    await db.photos.add({ id: 'p1', blob: new Blob(['x']), mime: 'image/jpeg', width: 1, height: 1, createdAt: 0 })
    await db.facilities.add(fac('h1', 'hochsitz', { photoIds: ['p1'] }))
    await trashFacilities(['h1'])
    expect(await db.photos.get('p1')).toBeDefined()
    const [e] = await db.trash.toArray()
    await purgeTrash([e.id])
    expect(await db.photos.get('p1')).toBeUndefined()
    expect(await db.trash.count()).toBe(0)
  })

  it('löscht Reviergrenzen in den Papierkorb', async () => {
    await db.boundaries.add({ id: 'b1', name: 'Revier', geometry: { type: 'Polygon', coordinates: [] }, createdAt: 0 })
    await trashBoundaries(['b1'])
    expect(await db.boundaries.count()).toBe(0)
    const [e] = await db.trash.toArray()
    expect(e).toMatchObject({ tbl: 'boundaries', kind: 'Reviergrenze', label: 'Revier' })
    await restoreTrash([e.id])
    expect(await db.boundaries.get('b1')).toBeDefined()
  })

  it('räumt nach 30 Tagen endgültig auf', async () => {
    const now = Date.UTC(2026, 10, 15)
    await db.facilities.bulkAdd([fac('alt', 'hochsitz'), fac('neu', 'hochsitz')])
    await trashFacilities(['alt'], now - 31 * DAY)
    await trashFacilities(['neu'], now - 2 * DAY)
    expect(await purgeOldTrash(now)).toBe(1)
    const [left] = await db.trash.toArray()
    expect(left.item.id).toBe('neu')
    expect(daysLeft(left, now)).toBe(28)
  })
})
