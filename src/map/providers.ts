// Kartenanbieter an einer Stelle gekapselt.
// Einen neuen Anbieter ergänzen = ein weiteres Objekt in TILE_PROVIDERS.

import L from 'leaflet'
import { googleProvider } from './googleTiles'
import { OfflineTileLayer } from './offlineLayer'
import { tileBbox3857, type TileXYZ } from './tileMath'

export interface TileProvider {
  id: string
  label: string
  /** Kurzer Hinweis im Ebenen-Menü */
  description: string
  /** Darf für die Offline-Nutzung vorab gespeichert werden? Nur wenn die Nutzungsbedingungen das erlauben. */
  offlineCacheable: boolean
  /** Für offline speicherbare Anbieter: Adresse einer Kachel und Download-Grenzen */
  offline?: {
    url: (t: TileXYZ) => string
    /** feinste sinnvolle Stufe (Auflösung der Quelle) */
    maxZoom: number
    /** geschätzte Größe je Kachel in KB (für die Anzeige vor dem Download) */
    avgKb: number
    /** gleichzeitige Anfragen */
    parallel: number
    /** Hinweis zum Gebiet, z. B. „nur Niedersachsen“ */
    coverage: string
  }
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
  offlineCacheable: false, // Nutzungsbedingungen erlauben das Vorab-Speichern nicht eindeutig
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
  offlineCacheable: false, // OSM verbietet Offline-Nutzung und Vorab-Laden ausdrücklich
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
  offlineCacheable: false, // Betreiber bitten, Massendownloads zu vermeiden
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

const year = new Date().getFullYear()
const CC_BY = '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>'

// Luftbild Niedersachsen (DOP20, 20 cm) – Open Data des LGLN, CC BY 4.0 (Vervielfältigung erlaubt → offline speicherbar)
const LGLN_WMS = 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms'
const lglnUrl = (t: TileXYZ) =>
  `${LGLN_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ni_dop20&STYLES=&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg&BBOX=${tileBbox3857(t).join(',')}`

export const lglnProvider: TileProvider = {
  id: 'lgln',
  label: 'Luftbild Niedersachsen (LGLN)',
  description: 'Sehr scharf (20 cm), nur Niedersachsen, offline speicherbar',
  offlineCacheable: true,
  offline: { url: lglnUrl, maxZoom: 19, avgKb: 14, parallel: 4, coverage: 'nur Niedersachsen' },
  isAvailable: () => true,
  createLayer: () =>
    new OfflineTileLayer('lgln', lglnUrl, {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 19,
      minZoom: 6,
      attribution: `Luftbild &copy; <a href="https://www.lgln.niedersachsen.de">LGLN</a> (${year}) ${CC_BY}`,
    }),
}

// basemap.de Web Raster (BKG, amtliche Karte Deutschland) – CC BY 4.0 → offline speicherbar
const basemapUrl = (t: TileXYZ) =>
  `https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/${t.z}/${t.y}/${t.x}.png`

export const basemapProvider: TileProvider = {
  id: 'basemap',
  label: 'Karte Deutschland (basemap.de)',
  description: 'Amtliche Karte mit Wegen und Gewässern, offline speicherbar',
  offlineCacheable: true,
  offline: { url: basemapUrl, maxZoom: 18, avgKb: 8, parallel: 4, coverage: 'nur Deutschland' },
  isAvailable: () => true,
  createLayer: () =>
    new OfflineTileLayer('basemap', basemapUrl, {
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 18,
      attribution: `&copy; GeoBasis-DE / <a href="https://www.bkg.bund.de">BKG</a> (${year}) ${CC_BY}`,
    }),
}

export const TILE_PROVIDERS: TileProvider[] = [esriProvider, lglnProvider, googleProvider, basemapProvider, osmProvider, topoProvider]

/** Anbieter, deren Kacheln vorab gespeichert werden dürfen */
export const OFFLINE_PROVIDERS = TILE_PROVIDERS.filter((p) => p.offlineCacheable && p.offline)

export const FALLBACK_PROVIDER = esriProvider

export function providerById(id: string | undefined): TileProvider {
  return TILE_PROVIDERS.find((p) => p.id === id) ?? FALLBACK_PROVIDER
}
