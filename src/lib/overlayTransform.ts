// Eckpunkte des Revier-Fotos verändern, OHNE das Bild zu verzerren.
// Gerechnet wird in Metern um die Bildmitte, damit Länge/Breite gleich behandelt werden.

import { fromXY, toXY, type LatLng, type XY } from './geo'

/**
 * - 'scale': nur Größe ändern, Form und Drehung bleiben
 * - 'rotate': Größe + Drehung, Form bleibt
 * - 'free': jede Ecke einzeln (perspektivisch, für schräg fotografierte Karten)
 */
export type HandleMode = 'scale' | 'rotate' | 'free'

export function centerOf(corners: LatLng[]): LatLng {
  return {
    lat: corners.reduce((a, p) => a + p.lat, 0) / corners.length,
    lng: corners.reduce((a, p) => a + p.lng, 0) / corners.length,
  }
}

/**
 * Neue Ecken, wenn Ecke `index` auf `target` gezogen wird.
 * `start` sind die Ecken zu Beginn des Ziehens.
 */
export function dragCorner(start: LatLng[], index: number, target: LatLng, mode: HandleMode): LatLng[] {
  if (mode === 'free') return start.map((p, i) => (i === index ? target : p))
  const c = centerOf(start)
  const pts = start.map((p) => toXY(c, p))
  const v0 = pts[index]
  const v1 = toXY(c, target)
  const len0 = Math.hypot(v0.x, v0.y)
  if (len0 < 1e-6) return start
  let s: number
  let angle = 0
  if (mode === 'scale') {
    // Anteil der Bewegung entlang der Diagonale → gleichmäßig größer/kleiner
    s = (v1.x * v0.x + v1.y * v0.y) / (len0 * len0)
  } else {
    s = Math.hypot(v1.x, v1.y) / len0
    angle = Math.atan2(v1.y, v1.x) - Math.atan2(v0.y, v0.x)
  }
  s = Math.max(0.05, s)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return pts.map((p) => fromXY(c, { x: s * (p.x * cos - p.y * sin), y: s * (p.x * sin + p.y * cos) }))
}

/**
 * Verzerrtes Foto wieder in sein echtes Seitenverhältnis bringen.
 * Mitte und Drehung (obere Kante) bleiben, die Breite wird gemittelt.
 */
export function rectifyCorners(corners: LatLng[], imgW: number, imgH: number): LatLng[] {
  const c = centerOf(corners)
  const p = corners.map((q) => toXY(c, q))
  const top: XY = { x: p[1].x - p[0].x, y: p[1].y - p[0].y }
  const bottom: XY = { x: p[2].x - p[3].x, y: p[2].y - p[3].y }
  const angle = Math.atan2(top.y + bottom.y, top.x + bottom.x)
  const w = (Math.hypot(top.x, top.y) + Math.hypot(bottom.x, bottom.y)) / 2
  const h = (w * imgH) / imgW
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Bildkoordinaten: x nach rechts, y nach unten → in Metern y nach Norden umdrehen
  const local = [
    { x: -w / 2, y: h / 2 },
    { x: w / 2, y: h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: -w / 2, y: -h / 2 },
  ]
  return local.map((q) => fromXY(c, { x: q.x * cos - q.y * sin, y: q.x * sin + q.y * cos }))
}
