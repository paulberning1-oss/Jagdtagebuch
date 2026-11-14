import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Facility } from './db'
import {
  childrenOf,
  daysLeft,
  purgeOldTrash,
  purgeTrash,
  restoreTrash,
  trashBoundaries,
  trashCategory,
  trashFacilities,
  trashHunts,
  trashSightings,
  trashSpecies,
} from './trash'

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

  it('nimmt beim Ansitz seine Sichtungen mit und stellt beide wieder her', async () => {
    const hunt = {
      id: 'h1', standId: null, standName: 'Eiche', lat: 52.5, lng: 7.2, start: Date.UTC(2026, 4, 10, 18), end: Date.UTC(2026, 4, 10, 20),
      status: 'done', huntType: 'ansitz', targetSpecies: [], success: false, kills: [], disturbances: [], notes: '', rating: null,
      env: null, weatherStatus: 'ok', weatherTries: 0, createdAt: 0, updatedAt: 0,
    } as const
    const sighting = (id: string, huntId: string | null, photoIds: string[] = []) => ({
      id, huntId, time: Date.UTC(2026, 4, 10, 19), speciesId: 'rehwild', count: 2, sexAge: [], behavior: '', direction: null,
      lat: 52.5, lng: 7.2, source: 'eigen' as const, notes: '', photoIds, createdAt: 0,
    })
    await db.hunts.add({ ...hunt, targetSpecies: [], kills: [], disturbances: [] })
    await db.photos.add({ id: 'p1', blob: new Blob(['x']), mime: 'image/jpeg', width: 1, height: 1, createdAt: 0 })
    await db.sightings.bulkAdd([sighting('s1', 'h1', ['p1']), sighting('s2', 'h1'), sighting('frei', null)])

    expect(await trashHunts(['h1'])).toBe(3)
    expect(await db.sightings.count()).toBe(1)
    const entries = await db.trash.toArray()
    const huntEntry = entries.find((e) => e.tbl === 'hunts')!
    expect(huntEntry.label).toContain('Eiche')
    expect(childrenOf(entries, huntEntry)).toHaveLength(2)
    expect(entries.find((e) => e.tbl === 'sightings')!.label).toContain('2× Rehwild')

    await restoreTrash([huntEntry.id, ...childrenOf(entries, huntEntry).map((e) => e.id)])
    expect(await db.hunts.get('h1')).toBeDefined()
    expect(await db.sightings.count()).toBe(3)
    expect(await db.photos.get('p1')).toBeDefined()
  })

  it('löscht einzelne Sichtungen, Wildarten und Kategorien wiederherstellbar', async () => {
    await db.sightings.add({
      id: 's', huntId: null, time: 0, speciesId: 'fuchs', count: 1, sexAge: [], behavior: '', direction: null, lat: 0, lng: 0,
      source: 'eigen', notes: '', photoIds: [], createdAt: 0,
    })
    await trashSightings(['s'])
    const sp = (await db.species.get('hase'))!
    await trashSpecies(sp)
    await db.categories.add({ id: 'k_x', label: 'Polter', kinds: ['point'], color: '#000', scent: null, hasCrop: false, order: 1, createdAt: 0 })
    await trashCategory((await db.categories.get('k_x'))!)
    expect(await db.sightings.count()).toBe(0)
    expect(await db.species.get('hase')).toBeUndefined()
    const entries = await db.trash.toArray()
    expect(entries.map((e) => e.kind).sort()).toEqual(['Kategorie', 'Sichtung', 'Wildart'])
    await restoreTrash(entries.map((e) => e.id))
    expect(await db.sightings.get('s')).toBeDefined()
    expect((await db.species.get('hase'))?.name).toBe('Hase')
    expect(await db.categories.get('k_x')).toBeDefined()
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
