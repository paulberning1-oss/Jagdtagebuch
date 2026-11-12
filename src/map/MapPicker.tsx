// Vollbild-Karte zum Auswählen eines Ortes (Sichtung, Erlegung, Ansitz ohne Sitz).
import { useLiveQuery } from 'dexie-react-hooks'
import L from 'leaflet'
import { Check, LocateFixed, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { MapContainer, Marker } from 'react-leaflet'
import { useToast } from '../components/ui'
import { db } from '../db/db'
import { setSetting, useSetting } from '../db/settings'
import type { LatLng } from '../lib/geo'
import { BaseLayer, BoundaryLayer, FacilityLayer, FlyTo, MapClicks } from './MapLayers'
import { FALLBACK_PROVIDER } from './providers'

const pickIcon = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:999px;background:#ef6b4a;border:3px solid #fff;box-shadow:0 0 0 3px rgba(0,0,0,.5)"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

export function MapPicker({
  title,
  initial,
  onPick,
  onCancel,
}: {
  title: string
  initial: LatLng | null
  onPick: (p: LatLng) => void
  onCancel: () => void
}) {
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  const boundaries = useLiveQuery(() => db.boundaries.toArray(), []) ?? []
  const baseLayer = useSetting('baseLayer')
  const mapView = useSetting('mapView')
  const [pos, setPos] = useState<LatLng | null>(initial)
  const [fly, setFly] = useState<{ pos: LatLng; zoom?: number; n: number } | null>(null)
  const toast = useToast()

  const center = initial ?? (mapView ? { lat: mapView.lat, lng: mapView.lng } : { lat: 51.2, lng: 10.4 })
  const zoom = initial ? 17 : (mapView?.zoom ?? 6)

  const onUnavailable = useCallback(() => setSetting('baseLayer', FALLBACK_PROVIDER.id), [])
  const noop = useMemo(() => () => {}, [])

  const locate = () => {
    if (!window.isSecureContext || !('geolocation' in navigator)) return toast('Standort nur über https verfügbar', 'error')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const q = { lat: p.coords.latitude, lng: p.coords.longitude }
        setPos(q)
        setFly({ pos: q, zoom: 17, n: Date.now() })
      },
      () => toast('Standort nicht gefunden', 'error'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  if (baseLayer === undefined) return null

  return (
    <div className="fixed inset-0 z-[2500] flex flex-col bg-bg">
      <div className="pt-safe flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <p className="flex-1 text-lg font-bold">{title}</p>
        <button className="btn-round !size-12" onClick={onCancel} aria-label="Abbrechen">
          <X />
        </button>
      </div>
      <div className="relative flex-1">
        <MapContainer center={[center.lat, center.lng]} zoom={zoom} maxZoom={21} zoomControl={false} className="h-full w-full">
          <BaseLayer providerId={baseLayer} onUnavailable={onUnavailable} />
          <BoundaryLayer boundaries={boundaries} interactive={false} onSelect={noop} />
          <FacilityLayer facilities={facilities} interactive={false} showLabels onSelect={noop} />
          <MapClicks onClick={setPos} />
          <FlyTo target={fly} />
          {pos && <Marker position={pos} icon={pickIcon} interactive={false} />}
        </MapContainer>
        <p className="pointer-events-none absolute inset-x-3 top-3 z-[900] rounded-xl bg-panel/90 p-2 text-center text-base">
          Tippe auf die Karte, um den Ort zu setzen
        </p>
      </div>
      <div className="pb-safe flex gap-2 border-t border-line bg-panel p-3">
        <button className="btn flex-1" onClick={locate}>
          <LocateFixed /> Mein Standort
        </button>
        <button className="btn btn-primary flex-1" disabled={!pos} onClick={() => pos && onPick(pos)}>
          <Check /> Übernehmen
        </button>
      </div>
    </div>
  )
}
