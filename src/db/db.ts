// Lokale Datenbank im Browser (IndexedDB über Dexie).
// Nichts davon verlässt das Gerät.
import Dexie, { type EntityTable } from 'dexie'
import type { LineString, MultiPolygon, Point, Polygon } from 'geojson'
import type { FacilityType } from '../domain/facilityTypes'

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

export interface Setting {
  key: string
  value: unknown
}

export class AnsitzDB extends Dexie {
  facilities!: EntityTable<Facility, 'id'>
  boundaries!: EntityTable<Boundary, 'id'>
  photos!: EntityTable<Photo, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor() {
    super('ansitzplaner')
    // Versionen nur ergänzen, nie ändern – sonst gehen Daten verloren.
    this.version(1).stores({
      facilities: 'id, type, updatedAt',
      boundaries: 'id',
      photos: 'id',
      settings: 'key',
    })
  }
}

export const db = new AnsitzDB()
