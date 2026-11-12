import { kml } from '@tmcw/togeojson'
import type { Geometry, MultiPolygon, Polygon } from 'geojson'

/**
 * Liest eine KML- oder GeoJSON-Datei und gibt alle Flächen (Polygone) zurück.
 * Linien und Punkte werden ignoriert – es geht um die Reviergrenze.
 */
export async function readBoundaryFile(file: File): Promise<{ name: string; geometry: Polygon | MultiPolygon }[]> {
  const text = await file.text()
  const lower = file.name.toLowerCase()
  let fc: { features?: { geometry: Geometry | null; properties?: Record<string, unknown> | null }[] }

  if (lower.endsWith('.kmz')) {
    throw new Error('KMZ-Dateien bitte vorher entpacken (darin steckt eine .kml-Datei).')
  }
  if (lower.endsWith('.kml') || text.trimStart().startsWith('<')) {
    const dom = new DOMParser().parseFromString(text, 'text/xml')
    if (dom.getElementsByTagName('parsererror').length) throw new Error('Die KML-Datei ist fehlerhaft.')
    fc = kml(dom) as typeof fc
  } else {
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error('Die Datei ist weder gültiges KML noch GeoJSON.')
    }
    const j = json as { type?: string; features?: unknown[]; geometry?: Geometry; coordinates?: unknown }
    if (j.type === 'FeatureCollection') fc = j as typeof fc
    else if (j.type === 'Feature') fc = { features: [j as never] }
    else if (j.type && j.coordinates) fc = { features: [{ geometry: j as Geometry, properties: {} }] }
    else throw new Error('Unbekanntes GeoJSON-Format.')
  }

  const out: { name: string; geometry: Polygon | MultiPolygon }[] = []
  const collect = (g: Geometry | null, name: string) => {
    if (!g) return
    if (g.type === 'Polygon') out.push({ name, geometry: stripZ(g) as Polygon })
    else if (g.type === 'MultiPolygon') out.push({ name, geometry: stripZ(g) as MultiPolygon })
    else if (g.type === 'GeometryCollection') g.geometries.forEach((x) => collect(x, name))
  }
  for (const f of fc.features ?? []) {
    const name = String(f.properties?.name ?? f.properties?.Name ?? 'Reviergrenze')
    collect(f.geometry, name)
  }
  if (!out.length) throw new Error('In der Datei wurde keine Fläche (Polygon) gefunden.')
  return out
}

/** Höhenangaben (3. Koordinate) entfernen */
function stripZ(g: Polygon | MultiPolygon): Polygon | MultiPolygon {
  const s = (ring: number[][]) => ring.map((p) => [p[0], p[1]])
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(s) }
  return { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map(s)) }
}
