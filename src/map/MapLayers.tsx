// Die einzelnen Kartenebenen als React-Komponenten.
import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { Circle, CircleMarker, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Boundary, Facility } from '../db/db'
import { typeInfo } from '../domain/facilityTypes'
import { fromPos, sector, type LatLng } from '../lib/geo'
import { fetchGoogleAttribution } from './googleTiles'
import { providerById, type TileProvider } from './providers'

// ---------- Grundkarte ----------

export function BaseLayer({
  providerId,
  onUnavailable,
}: {
  providerId: string
  onUnavailable: (p: TileProvider, reason: string) => void
}) {
  const map = useMap()
  const cb = useRef(onUnavailable)
  cb.current = onUnavailable

  useEffect(() => {
    const provider = providerById(providerId)
    let layer: L.TileLayer | null = null
    let cancelled = false
    ;(async () => {
      if (!provider.isAvailable()) {
        cb.current(provider, navigator.onLine ? 'kein Schlüssel hinterlegt' : 'kein Internet')
        return
      }
      try {
        const l = await provider.createLayer()
        if (cancelled) return
        layer = l
        l.addTo(map)
        l.bringToBack()
      } catch (e) {
        if (!cancelled) cb.current(provider, (e as Error).message)
      }
    })()
    // Fällt das Internet weg, Ebenen wie Google automatisch ersetzen
    const onOffline = () => {
      if (!provider.isAvailable()) cb.current(provider, 'kein Internet')
    }
    window.addEventListener('offline', onOffline)
    return () => {
      cancelled = true
      window.removeEventListener('offline', onOffline)
      layer?.remove()
    }
  }, [providerId, map])

  return providerId === 'google' ? <GoogleAttribution /> : null
}

/** Pflichtangabe der Google-Urheberrechte für den sichtbaren Ausschnitt */
function GoogleAttribution() {
  const map = useMap()
  useEffect(() => {
    let current = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const text = await fetchGoogleAttribution(map.getBounds(), map.getZoom())
          if (text !== current) {
            if (current) map.attributionControl.removeAttribution(current)
            map.attributionControl.addAttribution(text)
            current = text
          }
        } catch {
          /* still */
        }
      }, 400)
    }
    update()
    map.on('moveend', update)
    return () => {
      clearTimeout(timer)
      map.off('moveend', update)
      if (current) map.attributionControl.removeAttribution(current)
    }
  }, [map])
  return null
}

// ---------- Klicks auf die Karte ----------

export function MapClicks({
  onClick,
  onMoveEnd,
  onZoom,
}: {
  onClick: (p: LatLng) => void
  onMoveEnd?: (c: LatLng, zoom: number) => void
  onZoom?: (z: number) => void
}) {
  const map = useMapEvents({
    click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }),
    moveend: () => {
      const c = map.getCenter()
      onMoveEnd?.({ lat: c.lat, lng: c.lng }, map.getZoom())
    },
    zoomend: () => onZoom?.(map.getZoom()),
  })
  return null
}

// ---------- Einrichtungen ----------

function markerIcon(f: Facility, selected: boolean, highlighted: boolean) {
  const info = typeInfo(f.type)
  const size = info.isStand ? 38 : 32
  const round = !info.isStand
  const cls = `fac-marker${round ? ' round' : ''}${selected ? ' selected' : ''}`
  const ring = highlighted ? 'box-shadow:0 0 0 4px #ef6b4a;' : ''
  return L.divIcon({
    className: '',
    html: `<div class="${cls}" style="width:${size}px;height:${size}px;background:${info.color};${ring}">${info.glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function FacilityLayer({
  facilities,
  interactive,
  selectedId,
  highlightIds,
  showLabels,
  onSelect,
}: {
  facilities: Facility[]
  interactive: boolean
  selectedId?: string | null
  highlightIds?: Set<string>
  showLabels: boolean
  onSelect: (f: Facility) => void
}) {
  // Flächen zuerst (unten), dann Linien, dann Punkte (oben)
  const sorted = useMemo(() => {
    const rank = (f: Facility) => (f.geometry.type === 'Polygon' ? 0 : f.geometry.type === 'LineString' ? 1 : 2)
    return [...facilities].sort((a, b) => rank(a) - rank(b))
  }, [facilities])

  return (
    <>
      {sorted.map((f) => {
        const info = typeInfo(f.type)
        const hl = highlightIds?.has(f.id) ?? false
        const sel = selectedId === f.id
        const key = `${f.id}-${interactive ? 1 : 0}-${f.updatedAt}`
        const handlers = { click: () => onSelect(f) }
        const label = showLabels && f.name ? (
          <Tooltip permanent direction="bottom" offset={[0, 14]} className="facility-label">
            {f.name}
          </Tooltip>
        ) : null

        if (f.geometry.type === 'Polygon') {
          const ring = f.geometry.coordinates[0].map(fromPos)
          return (
            <Polygon
              key={key}
              positions={ring}
              interactive={interactive}
              eventHandlers={handlers}
              pathOptions={{
                color: hl ? '#ef6b4a' : info.color,
                weight: hl || sel ? 4 : 2,
                fillColor: info.color,
                fillOpacity: 0.22,
              }}
            >
              {showLabels && f.name && (
                <Tooltip permanent direction="center" className="facility-label">
                  {f.name}
                </Tooltip>
              )}
            </Polygon>
          )
        }
        if (f.geometry.type === 'LineString') {
          return (
            <Polyline
              key={key}
              positions={f.geometry.coordinates.map(fromPos)}
              interactive={interactive}
              eventHandlers={handlers}
              pathOptions={{ color: hl ? '#ef6b4a' : info.color, weight: hl || sel ? 7 : 5, dashArray: '10 8' }}
            />
          )
        }
        const pos = fromPos(f.geometry.coordinates)
        return (
          <FacilityPoint key={key} f={f} pos={pos} interactive={interactive} selected={sel} highlighted={hl} onClick={handlers.click}>
            {label}
          </FacilityPoint>
        )
      })}
    </>
  )
}

function FacilityPoint({
  f,
  pos,
  interactive,
  selected,
  highlighted,
  onClick,
  children,
}: {
  f: Facility
  pos: LatLng
  interactive: boolean
  selected: boolean
  highlighted: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const info = typeInfo(f.type)
  const icon = useMemo(() => markerIcon(f, selected, highlighted), [f, selected, highlighted])
  const wedge = useMemo(() => {
    if (f.bearing == null || !info.hasBearing) return null
    const isCam = f.type === 'wildkamera'
    return sector(pos, f.bearing, isCam ? 50 : (f.fieldWidth ?? 60), isCam ? 40 : 120)
  }, [f.bearing, f.fieldWidth, f.type, info.hasBearing, pos])
  return (
    <>
      {wedge && (
        <Polygon
          positions={wedge}
          interactive={false}
          pathOptions={{ color: info.color, weight: 1, opacity: 0.6, fillOpacity: 0.12, dashArray: '4 4' }}
        />
      )}
      <Marker position={pos} icon={icon} interactive={interactive} eventHandlers={{ click: onClick }}>
        {children}
      </Marker>
    </>
  )
}

// ---------- Reviergrenze ----------

export function BoundaryLayer({
  boundaries,
  interactive,
  onSelect,
}: {
  boundaries: Boundary[]
  interactive: boolean
  onSelect: (b: Boundary) => void
}) {
  return (
    <>
      {boundaries.map((b) => {
        const polys = b.geometry.type === 'Polygon' ? [b.geometry.coordinates] : b.geometry.coordinates
        return polys.map((poly, i) => (
          <Polygon
            key={`${b.id}-${i}-${interactive ? 1 : 0}`}
            positions={poly.map((ring) => ring.map(fromPos))}
            interactive={interactive}
            eventHandlers={{ click: () => onSelect(b) }}
            pathOptions={{ color: '#ffd54f', weight: 3, dashArray: '12 8', fill: false }}
          />
        ))
      })}
    </>
  )
}

// ---------- Entwurf beim Zeichnen ----------

const vertexIcon = L.divIcon({ className: 'draft-vertex', iconSize: [16, 16], iconAnchor: [8, 8] })

export function DraftLayer({ points, closed }: { points: LatLng[]; closed: boolean }) {
  if (!points.length) return null
  return (
    <>
      {closed && points.length >= 3 ? (
        <Polygon positions={points} interactive={false} pathOptions={{ color: '#d4a72c', weight: 3, fillOpacity: 0.15 }} />
      ) : (
        <Polyline positions={points} interactive={false} pathOptions={{ color: '#d4a72c', weight: 4 }} />
      )}
      {points.map((p, i) => (
        <Marker key={i} position={p} icon={vertexIcon} interactive={false} />
      ))}
    </>
  )
}

// ---------- Witterungskegel ----------

export function ConeLayer({ cone, stand }: { cone: LatLng[]; stand: LatLng }) {
  return (
    <>
      <Polygon
        positions={cone}
        interactive={false}
        pathOptions={{ color: '#ef6b4a', weight: 2, fillColor: '#ef6b4a', fillOpacity: 0.28 }}
      />
      <CircleMarker center={stand} radius={7} interactive={false} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ef6b4a', fillOpacity: 1 }} />
    </>
  )
}

// ---------- Eigener Standort ----------

export function LocationLayer({ pos, accuracy }: { pos: LatLng; accuracy: number }) {
  const icon = useMemo(() => L.divIcon({ className: 'loc-dot', iconSize: [18, 18], iconAnchor: [9, 9] }), [])
  return (
    <>
      {accuracy > 10 && (
        <Circle center={pos} radius={accuracy} interactive={false} pathOptions={{ color: '#4aa3ff', weight: 1, fillOpacity: 0.08 }} />
      )}
      <Marker position={pos} icon={icon} interactive={false} />
    </>
  )
}

/**
 * Fliegt einmalig zu einem Ziel, wenn sich `target` ändert.
 * `raise`: Ziel nach oben schieben, weil unten ein Panel die Karte verdeckt.
 */
export function FlyTo({
  target,
}: {
  target: { pos: LatLng; zoom?: number; bounds?: L.LatLngBoundsExpression; raise?: boolean; n: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    if (target.bounds) {
      map.flyToBounds(target.bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, target.raise ? map.getSize().y * 0.55 + 30 : 40],
        maxZoom: 17,
        duration: 0.8,
      })
      return
    }
    const z = target.zoom ?? Math.max(map.getZoom(), 16)
    let center = L.latLng(target.pos.lat, target.pos.lng)
    if (target.raise) {
      const pt = map.project(center, z).add([0, map.getSize().y * 0.28])
      center = map.unproject(pt, z)
    }
    map.flyTo(center, z, { duration: 0.8 })
  }, [target, map])
  return null
}

/** Gibt die Leaflet-Karte nach außen (für Berechnungen außerhalb der Karte) */
export function MapRef({ mapRef }: { mapRef: { current: L.Map | null } }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    return () => {
      mapRef.current = null
    }
  }, [map, mapRef])
  return null
}
