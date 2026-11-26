import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { latToY, lngToX, padBounds, tileBbox3857, tileCount, tileRange, tilesIn } from './tileMath'
import { deleteTiles, downloadTiles, storedTile, tileDb } from './tileStore'

const revier = { south: 52.51, north: 52.53, west: 7.19, east: 7.23 }

describe('Kachel-Rechnung', () => {
  it('Kachelnummern wie OSM/Leaflet', () => {
    expect(lngToX(7.21, 18)).toBe(136322)
    expect(latToY(52.52, 18)).toBe(85971)
    expect(lngToX(-180, 3)).toBe(0)
    expect(latToY(0, 1)).toBe(1)
  })

  it('Bereich, Anzahl und Reihenfolge grob → fein', () => {
    const r = tileRange(revier, 12)
    expect(r.x1 - r.x0 + 1).toBeLessThanOrEqual(2)
    const n = tileCount(revier, 12, 16)
    const list = [...tilesIn(revier, 12, 16)]
    expect(list).toHaveLength(n)
    expect(list[0].z).toBe(12)
    expect(list.at(-1)!.z).toBe(16)
    // jede feinere Stufe hat etwa 4× so viele Kacheln
    expect(tileCount(revier, 17, 17)).toBeGreaterThan(3 * tileCount(revier, 16, 16))
  })

  it('Rand in Metern', () => {
    const p = padBounds(revier, 300)
    expect((p.north - revier.north) * 111_320).toBeCloseTo(300, 0)
    expect(p.west).toBeLessThan(revier.west)
  })

  it('WMS-Ausschnitt in EPSG:3857 passt zur Kachel', () => {
    const [minx, miny, maxx, maxy] = tileBbox3857({ z: 18, x: 136322, y: 85971 })
    expect(minx).toBeCloseTo(802588.797, 2)
    expect(maxy).toBeCloseTo(6894772.825, 2)
    expect(maxx - minx).toBeCloseTo(maxy - miny, 6)
    expect(tileBbox3857({ z: 0, x: 0, y: 0 })[0]).toBeCloseTo(-20037508.34, 1)
  })
})

describe('Offline-Speicher', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lädt, überspringt Vorhandenes, zählt Fehler und löscht', async () => {
    const small = { south: 52.52, north: 52.521, west: 7.21, east: 7.211 }
    const total = tileCount(small, 15, 17)
    let calls = 0
    let failUrl = ''
    vi.stubGlobal('fetch', async (url: string) => {
      calls++
      if (url === failUrl) return new Response('kaputt', { status: 500, headers: { 'content-type': 'text/xml' } })
      return new Response(new Blob(['abc']), { status: 200, headers: { 'content-type': 'image/png' } })
    })
    const url = (t: { z: number; x: number; y: number }) => `https://k/${t.z}/${t.x}/${t.y}`
    failUrl = url([...tilesIn(small, 17, 17)][0])
    const opts = { provider: 'test', url, bounds: small, minZoom: 15, maxZoom: 17, total, signal: new AbortController().signal, onProgress: () => {}, parallel: 2 }

    const first = await downloadTiles(opts)
    expect(first.done).toBe(total)
    expect(first.failed).toBe(1)
    expect(await tileDb.tiles.where('provider').equals('test').count()).toBe(total - 1)
    expect((await tileDb.packs.get('test'))?.failed).toBe(1)
    expect(await storedTile(`test/${[...tilesIn(small, 15, 15)][0].z}/${[...tilesIn(small, 15, 15)][0].x}/${[...tilesIn(small, 15, 15)][0].y}`)).toBeTruthy()

    // Fortsetzen: nur die fehlende Kachel wird neu geholt
    failUrl = ''
    calls = 0
    const second = await downloadTiles(opts)
    expect(calls).toBe(1)
    expect(second.failed).toBe(0)
    expect((await tileDb.packs.get('test'))?.count).toBe(total)

    await deleteTiles('test')
    expect(await tileDb.tiles.count()).toBe(0)
    expect(await tileDb.packs.get('test')).toBeUndefined()
  })

  it('Abbruch speichert den Teil als „teilweise“', async () => {
    const ctrl = new AbortController()
    let n = 0
    vi.stubGlobal('fetch', async () => {
      if (++n === 3) ctrl.abort()
      return new Response(new Blob(['x']), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    })
    await downloadTiles({ provider: 'abbruch', url: () => 'https://k', bounds: revier, minZoom: 14, maxZoom: 16, total: 99, signal: ctrl.signal, onProgress: () => {}, parallel: 1 })
    const pack = await tileDb.packs.get('abbruch')
    expect(pack?.partial).toBe(true)
    expect(pack!.count).toBeGreaterThan(0)
    expect(pack!.count).toBeLessThan(tileCount(revier, 14, 16))
  })
})
