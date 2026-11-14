// „Zuletzt gelöscht“: Gelöschte Objekte und Reviergrenzen landen hier und lassen sich wiederherstellen.
// Nach 30 Tagen (oder beim Leeren) werden sie endgültig entfernt – erst dann auch ihre Fotos.
// Die Tabelle wird wie alle Kontodaten synchronisiert (Testdaten bleiben lokal).
import { newId } from '../lib/id'
import { typeInfo } from '../domain/facilityTypes'
import { db, type Boundary, type Facility } from './db'

export const TRASH_DAYS = 30
const DAY = 86400000

export type TrashTable = 'facilities' | 'boundaries'

export interface TrashEntry {
  id: string
  tbl: TrashTable
  /** Der gelöschte Eintrag, unverändert */
  item: Facility | Boundary
  /** Anzeige, z. B. „Hochsitz Hochspannung“ */
  label: string
  /** Art, z. B. „Hochsitz“ oder „Reviergrenze“ */
  kind: string
  /** Gemeinsam gelöschte Einträge (z. B. Sitz + seine Anmarschwege) */
  batch: string
  deletedAt: number
  /** Testdaten – bleiben lokal */
  demo?: boolean
}

function facilityEntry(f: Facility, batch: string, now: number, note = ''): TrashEntry {
  const info = typeInfo(f.type)
  return { id: newId(), tbl: 'facilities', item: f, label: (f.name || info.label) + note, kind: info.label, batch, deletedAt: now, demo: f.demo }
}

/**
 * Objekte in „Zuletzt gelöscht“ verschieben. Bei Sitzen gehen deren Anmarschwege mit.
 * Gibt die Zahl der verschobenen Einträge zurück.
 */
export async function trashFacilities(ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  const batch = newId()
  return db.transaction('rw', [db.facilities, db.trash], async () => {
    const list = (await db.facilities.bulkGet(ids)).filter((f): f is Facility => !!f)
    const standIds = new Set(list.filter((f) => typeInfo(f.type).isStand).map((f) => f.id))
    const routes = standIds.size
      ? await db.facilities.filter((f) => f.type === 'anmarsch' && !!f.standId && standIds.has(f.standId) && !ids.includes(f.id)).toArray()
      : []
    const entries = [
      ...list.map((f) => facilityEntry(f, batch, now)),
      ...routes.map((r) => facilityEntry(r, batch, now, ` (zu ${list.find((s) => s.id === r.standId)?.name || 'Sitz'})`)),
    ]
    await db.trash.bulkAdd(entries)
    await db.facilities.bulkDelete(entries.map((e) => e.item.id))
    return entries.length
  })
}

export async function trashBoundaries(ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  const batch = newId()
  return db.transaction('rw', [db.boundaries, db.trash], async () => {
    const list = (await db.boundaries.bulkGet(ids)).filter((b): b is Boundary => !!b)
    const entries: TrashEntry[] = list.map((b) => ({
      id: newId(),
      tbl: 'boundaries',
      item: b,
      label: b.name || 'Reviergrenze',
      kind: 'Reviergrenze',
      batch,
      deletedAt: now,
      demo: b.demo,
    }))
    await db.trash.bulkAdd(entries)
    await db.boundaries.bulkDelete(entries.map((e) => e.item.id))
    return entries.length
  })
}

/** Einträge wiederherstellen (gleiche Kennung wie vorher) */
export async function restoreTrash(entryIds: string[]): Promise<number> {
  return db.transaction('rw', [db.facilities, db.boundaries, db.trash], async () => {
    const entries = (await db.trash.bulkGet(entryIds)).filter((e): e is TrashEntry => !!e)
    for (const e of entries) {
      if (e.tbl === 'facilities') await db.facilities.put({ ...(e.item as Facility), updatedAt: Date.now() })
      else await db.boundaries.put(e.item as Boundary)
    }
    await db.trash.bulkDelete(entries.map((e) => e.id))
    return entries.length
  })
}

/** Endgültig löschen – erst jetzt verschwinden auch die Fotos */
export async function purgeTrash(entryIds: string[]): Promise<number> {
  return db.transaction('rw', [db.trash, db.photos], async () => {
    const entries = (await db.trash.bulkGet(entryIds)).filter((e): e is TrashEntry => !!e)
    const photoIds = entries.flatMap((e) => (e.tbl === 'facilities' ? ((e.item as Facility).photoIds ?? []) : []))
    if (photoIds.length) await db.photos.bulkDelete(photoIds)
    await db.trash.bulkDelete(entries.map((e) => e.id))
    return entries.length
  })
}

/** Alles, was älter als 30 Tage ist, endgültig löschen (beim App-Start) */
export async function purgeOldTrash(now = Date.now()): Promise<number> {
  const old = await db.trash.where('deletedAt').below(now - TRASH_DAYS * DAY).primaryKeys()
  return old.length ? purgeTrash(old as string[]) : 0
}

/** Tage bis zum endgültigen Löschen */
export const daysLeft = (e: TrashEntry, now = Date.now()) => Math.max(0, Math.ceil((e.deletedAt + TRASH_DAYS * DAY - now) / DAY))
