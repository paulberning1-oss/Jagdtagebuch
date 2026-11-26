// Kachelebene, die zuerst im Offline-Speicher nachsieht und nur sonst aus dem Internet lädt.
import L from 'leaflet'
import { tileKey, type TileXYZ } from './tileMath'
import { storedTile } from './tileStore'

type Internal = {
  _tileOnLoad: (done: L.DoneCallback, tile: HTMLElement) => void
  _tileOnError: (done: L.DoneCallback, tile: HTMLElement, e: Error) => void
}

export class OfflineTileLayer extends L.TileLayer {
  private providerId: string
  private urlFor: (t: TileXYZ) => string

  constructor(providerId: string, urlFor: (t: TileXYZ) => string, options: L.TileLayerOptions) {
    super('', options)
    this.providerId = providerId
    this.urlFor = urlFor
  }

  getTileUrl(coords: L.Coords): string {
    return this.urlFor({ z: coords.z, x: coords.x, y: coords.y })
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const self = this as unknown as Internal
    const tile = document.createElement('img')
    let objectUrl: string | null = null
    const free = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    L.DomEvent.on(tile, 'load', () => {
      free()
      self._tileOnLoad(done, tile)
    })
    L.DomEvent.on(tile, 'error', (e) => {
      free()
      self._tileOnError(done, tile, e as unknown as Error)
    })
    tile.alt = ''
    tile.setAttribute('role', 'presentation')

    const key = tileKey(this.providerId, { z: coords.z, x: coords.x, y: coords.y })
    const url = this.getTileUrl(coords)
    storedTile(key).then((blob) => {
      // Leaflet hat die Kachel inzwischen verworfen (src gesetzt) → nichts mehr tun
      if (tile.getAttribute('src') != null) return
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        tile.src = objectUrl
      } else tile.src = url
    })
    return tile
  }
}
