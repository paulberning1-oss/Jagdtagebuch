// Sichtungen auf der Karte: als Punkte oder als Heatmap-Raster.
import L from 'leaflet'
import { useMemo } from 'react'
import { Marker, Polygon, Tooltip } from 'react-leaflet'
import type { Sighting } from '../domain/hunt'
import { heatColor, heatGrid } from '../domain/sightings'
import { speciesColor, type Species } from '../domain/species'
import type { LatLng } from '../lib/geo'

function sightingIcon(s: Sighting, sp: Species | undefined) {
  const color = speciesColor(sp)
  const cam = s.source === 'wildkamera'
  const badge =
    s.count > 1
      ? `<span style="position:absolute;right:-8px;top:-8px;background:#0f1410;color:#e7e5dc;border:1px solid #e7e5dc;border-radius:999px;font-size:11px;min-width:18px;height:18px;line-height:16px;text-align:center;padding:0 3px">${s.count}</span>`
      : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:28px;height:28px;border-radius:999px;background:${color};border:2px ${cam ? 'dashed' : 'solid'} #111;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.6)">${sp?.short ?? '?'}${badge}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export function SightingPoints({
  sightings,
  species,
  onSelect,
}: {
  sightings: Sighting[]
  species: Map<string, Species>
  onSelect: (s: Sighting) => void
}) {
  return (
    <>
      {sightings.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={sightingIcon(s, species.get(s.speciesId))} eventHandlers={{ click: () => onSelect(s) }} />
      ))}
    </>
  )
}

/** Zellgröße passend zur Zoomstufe */
export const cellSizeForZoom = (z: number) => (z >= 17 ? 25 : z >= 15 ? 50 : z >= 13 ? 100 : 250)

export function SightingHeatmap({ sightings, zoom, origin }: { sightings: Sighting[]; zoom: number; origin: LatLng | null }) {
  const cell = cellSizeForZoom(zoom)
  const cells = useMemo(() => heatGrid(sightings, cell, origin ?? undefined), [sightings, cell, origin])
  const max = Math.max(1, ...cells.map((c) => c.value))
  return (
    <>
      {cells.map((c) => (
        <Polygon
          key={`${cell}-${c.key}`}
          positions={c.polygon}
          pathOptions={{ color: heatColor(c.value, max), weight: 1, opacity: 0.9, fillColor: heatColor(c.value, max), fillOpacity: 0.55 }}
        >
          <Tooltip direction="top">
            {c.value} Stück in {c.sightings} {c.sightings === 1 ? 'Sichtung' : 'Sichtungen'} ({cell} × {cell} m)
          </Tooltip>
        </Polygon>
      ))}
    </>
  )
}
