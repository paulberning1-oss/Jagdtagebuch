// Fiktives Beispielrevier "Heidekamp" – nur zum Ausprobieren.
// Alles hier erhält demo: true und lässt sich mit einem Klick löschen.
// Die Lage ist frei erfunden; das Luftbild darunter passt nicht dazu.

import type { LineString, Point, Polygon } from 'geojson'
import { db, type Boundary, type Facility } from '../db/db'
import type { FacilityType } from '../domain/facilityTypes'
import { fromXY, toPos } from '../lib/geo'
import { newId } from '../lib/id'

export const DEMO_CENTER = { lat: 52.64, lng: 10.3 }
export const DEMO_ZOOM = 15

const P = (x: number, y: number) => toPos(fromXY(DEMO_CENTER, { x, y }))

function ring(points: [number, number][]): Polygon {
  const c = points.map(([x, y]) => P(x, y))
  return { type: 'Polygon', coordinates: [[...c, c[0]]] }
}

/** Unregelmäßiges Viereck um (cx, cy) mit Breite w und Höhe h in Metern */
function blob(cx: number, cy: number, w: number, h: number): Polygon {
  return ring([
    [cx - w / 2, cy - h / 2 + h * 0.1],
    [cx + w * 0.1, cy - h / 2],
    [cx + w / 2, cy - h / 2 + h * 0.15],
    [cx + w / 2 - w * 0.08, cy + h / 2],
    [cx - w * 0.15, cy + h / 2 - h * 0.05],
    [cx - w / 2 + w * 0.05, cy + h * 0.1],
  ])
}

const now = Date.now()

function f(
  type: FacilityType,
  name: string,
  geometry: Point | LineString | Polygon,
  extra: Partial<Facility> = {},
): Facility {
  return { id: newId(), type, name, geometry, notes: '', photoIds: [], demo: true, createdAt: now, updatedAt: now, ...extra }
}
const pt = (x: number, y: number): Point => ({ type: 'Point', coordinates: P(x, y) })
const line = (...pts: [number, number][]): LineString => ({ type: 'LineString', coordinates: pts.map(([x, y]) => P(x, y)) })

export function buildDemoFacilities(): Facility[] {
  return [
    // Sitze
    f('kanzel', 'Eichenkanzel', pt(0, 150), { bearing: 35, fieldWidth: 90, notes: 'Blick auf den Wildacker. Bei Westwind am besten.' }),
    f('leiter', 'Birkenleiter', pt(-300, 650), { bearing: 200, fieldWidth: 70, notes: 'Am Dickungsrand, Schussfeld eng.' }),
    f('kanzel', 'Feldkanzel Nord', pt(450, 680), { bearing: 120, fieldWidth: 120, notes: 'Überblickt den Maisschlag. Gut für Sauen im Sommer.' }),
    f('hochsitz', 'Bruchsitz', pt(-600, -130), { bearing: 210, fieldWidth: 80, notes: 'Am Erlenbruch, oft feucht. Leiser Zugang über den Graben.' }),
    f('hochsitz', 'Kirrungssitz Buche', pt(320, -120), { bearing: 140, fieldWidth: 60, notes: 'Kirrung ca. 180 m SO.' }),
    f('drueckjagdbock', 'Drückjagdbock 1', pt(-120, -330), { bearing: 270, fieldWidth: 100 }),
    // Punkte
    f('kirrung', 'Buchenecke', pt(440, -260)),
    f('salzlecke', 'Salzlecke Fichte', pt(-420, 260)),
    f('suhle', 'Erlensuhle', pt(-760, -300)),
    f('wildkamera', 'Kamera Kirrung', pt(520, -200), { bearing: 230 }),
    f('parkplatz', 'Parkplatz Waldweg', pt(-1050, -660)),
    // Wechsel
    f('wechsel', 'Hauptwechsel Dickung–Mais', line([-520, 420], [-200, 330], [100, 330], [420, 420], [700, 470])),
    f('wechsel', 'Bruchwechsel', line([-820, -420], [-520, -520], [-200, -620])),
    f('wechsel', 'Wechsel zur Kirrung', line([620, -440], [440, -260], [200, -40])),
    // Flächen
    f('dickung', 'Fichtendickung', blob(-520, 440, 320, 220)),
    f('dickung', 'Brombeerdickung', blob(640, -460, 260, 200)),
    f('einstand', 'Erlenbruch', blob(-820, -400, 260, 260)),
    f('aesung', 'Wildacker Eichenecke', blob(120, 330, 170, 110)),
    f('feld', 'Maisschlag', blob(760, 470, 380, 300)),
    f('feld', 'Rapsfeld Süd', blob(-220, -640, 420, 220)),
  ]
}

export function buildDemoBoundary(): Boundary {
  return {
    id: newId(),
    name: 'Beispielrevier Heidekamp (fiktiv)',
    demo: true,
    createdAt: now,
    geometry: ring([
      [-1200, -800],
      [-300, -950],
      [900, -880],
      [1250, -200],
      [1150, 720],
      [300, 960],
      [-700, 880],
      [-1250, 300],
    ]),
  }
}

export async function hasDemoData(): Promise<boolean> {
  const n = await db.facilities.filter((x) => !!x.demo).count()
  const b = await db.boundaries.filter((x) => !!x.demo).count()
  return n + b > 0
}

export async function loadDemoData() {
  await clearDemoData()
  await db.transaction('rw', db.facilities, db.boundaries, async () => {
    await db.boundaries.add(buildDemoBoundary())
    await db.facilities.bulkAdd(buildDemoFacilities())
  })
}

/** Löscht ALLE Testdaten – eigene Einträge bleiben unberührt */
export async function clearDemoData() {
  await db.transaction('rw', db.facilities, db.boundaries, db.photos, async () => {
    await db.facilities.filter((x) => !!x.demo).delete()
    await db.boundaries.filter((x) => !!x.demo).delete()
    await db.photos.filter((x) => !!x.demo).delete()
  })
}
