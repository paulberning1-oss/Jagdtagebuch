// „Zuletzt gelöscht“: Gelöschte Einträge aller Listen landen hier und lassen sich wiederherstellen –
// Objekte, Reviergrenzen, Ansitze, Sichtungen, Wildarten, Kategorien, Revier-Fotos und Jagdwissen
// (eigene/geänderte Abschnitte, Kalender-Phasen, Jagdzeiten).
// Nach 30 Tagen (oder beim Leeren) werden sie endgültig entfernt – erst dann auch ihre Fotos.
// Die Tabelle wird wie alle Kontodaten synchronisiert (Testdaten bleiben lokal).
import { newId } from '../lib/id'
import { fmtDate, fmtTime } from '../lib/time'
import { typeInfo, type Category } from '../domain/facilityTypes'
import type { Hunt, Sighting } from '../domain/hunt'
import type { CalendarPhase, KnowledgeEntry, Season } from '../domain/knowledge'
import type { Species } from '../domain/species'
import { db, type Boundary, type Facility, type MapOverlay } from './db'

export const TRASH_DAYS = 30
const DAY = 86400000

export type TrashTable =
  | 'facilities'
  | 'boundaries'
  | 'hunts'
  | 'sightings'
  | 'species'
  | 'categories'
  | 'overlays'
  | 'knowledge'
  | 'calendar'
  | 'seasons'
type TrashItem = Facility | Boundary | Hunt | Sighting | Species | Category | MapOverlay | KnowledgeEntry | CalendarPhase | Season

export interface TrashEntry {
  id: string
  tbl: TrashTable
  /** Der gelöschte Eintrag, unverändert */
  item: TrashItem
  /** Anzeige, z. B. „Hochsitz Hochspannung“ */
  label: string
  /** Art, z. B. „Hochsitz“, „Ansitz“ oder „Sichtung“ */
  kind: string
  /** Gemeinsam gelöschte Einträge (z. B. Sitz + Anmarschwege, Ansitz + Sichtungen) */
  batch: string
  /** Gehört zu diesem Eintrag derselben Gruppe (wird mit ihm wiederhergestellt) */
  parentId?: string
  deletedAt: number
  /** Testdaten – bleiben lokal */
  demo?: boolean
}

const ALL_TABLES = () => [db.facilities, db.boundaries, db.hunts, db.sightings, db.species, db.categories, db.overlays, db.knowledge, db.calendar, db.seasons, db.photos, db.trash]
const table = (t: TrashTable) => db.table(t)

type NewEntry = Omit<TrashEntry, 'id' | 'batch' | 'deletedAt'>

/** Einträge in „Zuletzt gelöscht“ verschieben (in einer Transaktion) */
async function moveToTrash(list: NewEntry[], now: number): Promise<number> {
  if (!list.length) return 0
  const batch = newId()
  const entries: TrashEntry[] = list.map((e) => ({ ...e, id: newId(), batch, deletedAt: now }))
  await db.trash.bulkAdd(entries)
  for (const t of new Set(entries.map((e) => e.tbl))) {
    await table(t).bulkDelete(entries.filter((e) => e.tbl === t).map((e) => keyOf(e)))
  }
  return entries.length
}

const keyOf = (e: Pick<TrashEntry, 'tbl' | 'item'>) => (e.item as { id: string }).id

// ---------- Objekte & Reviergrenzen ----------

/**
 * Objekte in „Zuletzt gelöscht“ verschieben. Bei Sitzen gehen deren Anmarschwege mit.
 * Gibt die Zahl der verschobenen Einträge zurück.
 */
export async function trashFacilities(ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  return db.transaction('rw', ALL_TABLES(), async () => {
    const list = (await db.facilities.bulkGet(ids)).filter((f): f is Facility => !!f)
    const standIds = new Set(list.filter((f) => typeInfo(f.type).isStand).map((f) => f.id))
    const routes = standIds.size
      ? await db.facilities.filter((f) => f.type === 'anmarsch' && !!f.standId && standIds.has(f.standId) && !ids.includes(f.id)).toArray()
      : []
    const entry = (f: Facility, note = '', parentId?: string): NewEntry => ({
      tbl: 'facilities',
      item: f,
      label: (f.name || typeInfo(f.type).label) + note,
      kind: typeInfo(f.type).label,
      parentId,
      demo: f.demo,
    })
    return moveToTrash(
      [...list.map((f) => entry(f)), ...routes.map((r) => entry(r, ` (zu ${list.find((s) => s.id === r.standId)?.name || 'Sitz'})`, r.standId!))],
      now,
    )
  })
}

export async function trashBoundaries(ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  return db.transaction('rw', ALL_TABLES(), async () => {
    const list = (await db.boundaries.bulkGet(ids)).filter((b): b is Boundary => !!b)
    return moveToTrash(
      list.map((b) => ({ tbl: 'boundaries', item: b, label: b.name || 'Reviergrenze', kind: 'Reviergrenze', demo: b.demo })),
      now,
    )
  })
}

// ---------- Ansitze & Sichtungen ----------

const dateText = (t: number) => `${fmtDate(new Date(t))}, ${fmtTime(new Date(t))}`

async function speciesNames() {
  return new Map((await db.species.toArray()).map((s) => [s.id, s.name]))
}

function sightingEntry(s: Sighting, names: Map<string, string>, parentId?: string): NewEntry {
  return {
    tbl: 'sightings',
    item: s,
    label: `${s.count}× ${names.get(s.speciesId) ?? s.speciesId} · ${dateText(s.time)}`,
    kind: 'Sichtung',
    parentId,
    demo: s.demo,
  }
}

/** Ansitze löschen – ihre Sichtungen gehen mit (und kommen beim Wiederherstellen mit zurück) */
export async function trashHunts(ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  return db.transaction('rw', ALL_TABLES(), async () => {
    const list = (await db.hunts.bulkGet(ids)).filter((h): h is Hunt => !!h)
    const names = await speciesNames()
    const sightings = await db.sightings.filter((s) => !!s.huntId && ids.includes(s.huntId)).toArray()
    return moveToTrash(
      [
        ...list.map((h): NewEntry => ({ tbl: 'hunts', item: h, label: `${h.standName} · ${dateText(h.start)}`, kind: 'Ansitz', demo: h.demo })),
        ...sightings.map((s) => sightingEntry(s, names, s.huntId!)),
      ],
      now,
    )
  })
}

export async function trashSightings(ids: string[], now = Date.now()): Promise<number> {
  if (!ids.length) return 0
  return db.transaction('rw', ALL_TABLES(), async () => {
    const list = (await db.sightings.bulkGet(ids)).filter((s): s is Sighting => !!s)
    const names = await speciesNames()
    return moveToTrash(
      list.map((s) => sightingEntry(s, names)),
      now,
    )
  })
}

// ---------- Wildarten, Kategorien, Revier-Fotos ----------

export async function trashSpecies(s: Species, now = Date.now()) {
  return db.transaction('rw', ALL_TABLES(), () => moveToTrash([{ tbl: 'species', item: s, label: s.name, kind: 'Wildart' }], now))
}

export async function trashCategory(c: Category, now = Date.now()) {
  return db.transaction('rw', ALL_TABLES(), () => moveToTrash([{ tbl: 'categories', item: c, label: c.label, kind: 'Kategorie' }], now))
}

export async function trashOverlay(o: MapOverlay, now = Date.now()) {
  return db.transaction('rw', ALL_TABLES(), () => moveToTrash([{ tbl: 'overlays', item: o, label: o.name || 'Revierkarte (Foto)', kind: 'Revier-Foto' }], now))
}

// ---------- Wiederherstellen & endgültig löschen ----------

/** Einträge wiederherstellen (gleiche Kennung wie vorher) */
export async function restoreTrash(entryIds: string[]): Promise<number> {
  return db.transaction('rw', ALL_TABLES(), async () => {
    const entries = (await db.trash.bulkGet(entryIds)).filter((e): e is TrashEntry => !!e)
    for (const e of entries) {
      const item = e.tbl === 'facilities' ? { ...(e.item as Facility), updatedAt: Date.now() } : e.item
      await table(e.tbl ?? 'facilities').put(item)
    }
    await db.trash.bulkDelete(entries.map((e) => e.id))
    return entries.length
  })
}

/** Zum Eintrag gehörende Einträge derselben Gruppe (Anmarschwege eines Sitzes, Sichtungen eines Ansitzes) */
export function childrenOf(entries: TrashEntry[], e: TrashEntry): TrashEntry[] {
  const id = keyOf(e)
  return entries.filter((x) => x.batch === e.batch && x.id !== e.id && (x.parentId === id || (x.item as Facility).standId === id))
}

/** Fotos, die nur zu diesen Einträgen gehören */
function photosOf(e: TrashEntry): string[] {
  if (e.tbl === 'facilities' || e.tbl === 'sightings') return (e.item as Facility | Sighting).photoIds ?? []
  if (e.tbl === 'overlays') return [(e.item as MapOverlay).photoId]
  return []
}

/** Endgültig löschen – erst jetzt verschwinden auch die Fotos */
export async function purgeTrash(entryIds: string[]): Promise<number> {
  return db.transaction('rw', ALL_TABLES(), async () => {
    const entries = (await db.trash.bulkGet(entryIds)).filter((e): e is TrashEntry => !!e)
    const photoIds = entries.flatMap(photosOf).filter(Boolean)
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

// ---------- Jagdwissen ----------

/**
 * Wissensabschnitt löschen bzw. – bei einem geänderten Vorschlag – auf den Vorschlag zurücksetzen.
 * Beides landet in „Zuletzt gelöscht“; Wiederherstellen bringt die eigene Fassung zurück.
 */
export async function trashKnowledge(k: KnowledgeEntry, now = Date.now()) {
  const kind = k.own ? 'Jagdwissen' : 'Jagdwissen (deine Änderung)'
  return db.transaction('rw', ALL_TABLES(), () => moveToTrash([{ tbl: 'knowledge', item: k, label: k.title, kind }], now))
}

export async function trashCalendarPhase(p: CalendarPhase, now = Date.now()) {
  const kind = p.own ? 'Kalender-Phase' : 'Kalender-Phase (deine Änderung)'
  return db.transaction('rw', ALL_TABLES(), () => moveToTrash([{ tbl: 'calendar', item: p, label: p.label, kind }], now))
}

export async function trashSeason(s: Season, speciesName: string, now = Date.now()) {
  return db.transaction('rw', ALL_TABLES(), () =>
    moveToTrash([{ tbl: 'seasons', item: s, label: `${speciesName}: ${s.label || 'Jagdzeit'}`, kind: 'Jagdzeit' }], now),
  )
}
