// Lokale Datenbank im Browser (IndexedDB über Dexie).
// Nichts davon verlässt das Gerät.
import Dexie, { type EntityTable } from 'dexie'
import type { LineString, MultiPolygon, Point, Polygon } from 'geojson'
import type { FacilityType } from '../domain/facilityTypes'
import type { Hunt, Sighting } from '../domain/hunt'
import { DEFAULT_SPECIES, type Species } from '../domain/species'

export interface Facility {
  id: string
  type: FacilityType
  name: string
  /** GeoJSON-Geometrie: Punkt, Linie (Wechsel) oder Fläche */
  geometry: Point | LineString | Polygon
  /** Blickrichtung in Grad (0 = Nord, 90 = Ost) */
  bearing?: number | null
  /** Breite des Schussfelds in Grad */
  fieldWidth?: number | null
  notes: string
  photoIds: string[]
  /** true = gehört zu den Testdaten (Beispielrevier) */
  demo?: boolean
  createdAt: number
  updatedAt: number
}

export interface Boundary {
  id: string
  name: string
  geometry: Polygon | MultiPolygon
  demo?: boolean
  createdAt: number
}

export interface Photo {
  id: string
  blob: Blob
  mime: string
  width: number
  height: number
  demo?: boolean
  createdAt: number
}

/** Revier-Foto als ausgerichtete Kartenebene (4 Ecken: oben links, oben rechts, unten rechts, unten links) */
export interface MapOverlay {
  id: string
  name: string
  photoId: string
  corners: { lat: number; lng: number }[]
  opacity: number
  visible: boolean
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

export class AnsitzDB extends Dexie {
  facilities!: EntityTable<Facility, 'id'>
  boundaries!: EntityTable<Boundary, 'id'>
  photos!: EntityTable<Photo, 'id'>
  settings!: EntityTable<Setting, 'key'>
  hunts!: EntityTable<Hunt, 'id'>
  sightings!: EntityTable<Sighting, 'id'>
  species!: EntityTable<Species, 'id'>
  overlays!: EntityTable<MapOverlay, 'id'>

  constructor() {
    super('ansitzplaner')
    // Versionen nur ergänzen, nie ändern – sonst gehen Daten verloren.
    this.version(1).stores({
      facilities: 'id, type, updatedAt',
      boundaries: 'id',
      photos: 'id',
      settings: 'key',
    })
    // Phase 2: Ansitz-Tagebuch, Sichtungen, Wildarten
    this.version(2)
      .stores({
        hunts: 'id, start, standId, status',
        sightings: 'id, huntId, time, speciesId',
        species: 'id, order',
      })
      .upgrade((tx) => tx.table('species').bulkPut(DEFAULT_SPECIES))
    // Phase 3: Revier-Foto-Ebenen, Wildkamera-Index, Farben der Wildarten
    this.version(3)
      .stores({
        overlays: 'id',
        sightings: 'id, huntId, time, speciesId, cameraId',
      })
      .upgrade(async (tx) => {
        const byId = new Map(DEFAULT_SPECIES.map((s) => [s.id, s]))
        await tx
          .table('species')
          .toCollection()
          .modify((s: Species) => {
            if (!s.color && byId.get(s.id)?.color) s.color = byId.get(s.id)!.color
          })
      })
    // Ganz neue Datenbank: Startliste der Wildarten anlegen
    this.on('populate', (tx) => {
      tx.table('species').bulkAdd(DEFAULT_SPECIES)
    })
  }
}

export const db = new AnsitzDB()
