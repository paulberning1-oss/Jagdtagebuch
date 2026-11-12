// Kartenanbieter an einer Stelle gekapselt.
// Einen neuen Anbieter ergänzen = ein weiteres Objekt in TILE_PROVIDERS.

import L from 'leaflet'
import { googleProvider } from './googleTiles'

export interface TileProvider {
  id: string
  label: string
  /** Kurzer Hinweis im Ebenen-Menü */
  description: string
  /** Darf für die Offline-Nutzung vorab gespeichert werden? (Phase 5) */
  offlineCacheable: boolean
  /** Ist die Ebene gerade nutzbar? (z. B. Schlüssel vorhanden, online) */
  isAvailable(): boolean
  /** Erzeugt die Leaflet-Kachelebene (darf asynchron sein, z. B. für Sitzungs-Token) */
  createLayer(): Promise<L.TileLayer> | L.TileLayer
}

const MAX_ZOOM = 21

export const esriProvider: TileProvider = {
  id: 'esri',
  label: 'Satellit (Esri)',
  description: 'Luftbild, frei nutzbar',
  offlineCacheable: true,
  isAvailable: () => true,
  createLayer: () =>
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 19,
      attribution: 'Luftbild &copy; Esri, Maxar, Earthstar Geographics, GIS User Community',
    }),
}

export const osmProvider: TileProvider = {
  id: 'osm',
  label: 'OpenStreetMap',
  description: 'Straßen, Wege, Gewässer',
  offlineCacheable: true,
  isAvailable: () => true,
  createLayer: () =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }),
}

export const topoProvider: TileProvider = {
  id: 'topo',
  label: 'Topo (OpenTopoMap)',
  description: 'Höhenlinien, Gelände',
  offlineCacheable: true,
  isAvailable: () => true,
  createLayer: () =>
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 17,
      subdomains: 'abc',
      attribution:
        'Karte &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), Daten &copy; OpenStreetMap-Mitwirkende',
    }),
}

export const TILE_PROVIDERS: TileProvider[] = [esriProvider, googleProvider, osmProvider, topoProvider]

export const FALLBACK_PROVIDER = esriProvider

export function providerById(id: string | undefined): TileProvider {
  return TILE_PROVIDERS.find((p) => p.id === id) ?? FALLBACK_PROVIDER
}
