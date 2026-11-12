// Revier-Foto als verzerrbare Kartenebene: 4 Ecken werden auf die Karte gelegt,
// das Bild wird per Homographie (CSS matrix3d) perspektivisch entzerrt.
import { useLiveQuery } from 'dexie-react-hooks'
import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { Marker, useMap } from 'react-leaflet'
import { db, type MapOverlay } from '../db/db'
import { cssMatrix3d } from '../lib/homography'
import type { LatLng } from '../lib/geo'
import { usePhotoUrl } from './FacilityEditor'

const PANE = 'photoPane'

function usePane() {
  const map = useMap()
  return useMemo(() => {
    let pane = map.getPane(PANE)
    if (!pane) {
      pane = map.createPane(PANE)
      pane.style.zIndex = '350' // über den Kacheln (200), unter Flächen/Linien (400)
      pane.style.pointerEvents = 'none'
    }
    return pane
  }, [map])
}

/** Zeichnet ein Foto mit 4 Ecken perspektivisch auf die Karte */
export function PhotoOverlayLayer({ overlay, corners }: { overlay: MapOverlay; corners?: LatLng[] }) {
  const map = useMap()
  const pane = usePane()
  const url = usePhotoUrl(overlay.photoId)
  const photo = useLiveQuery(() => db.photos.get(overlay.photoId), [overlay.photoId])
  const imgRef = useRef<HTMLImageElement | null>(null)
  const c = corners ?? overlay.corners

  // Bild-Element anlegen
  useEffect(() => {
    const img = document.createElement('img')
    img.style.position = 'absolute'
    img.style.left = '0'
    img.style.top = '0'
    img.style.transformOrigin = '0 0'
    img.style.pointerEvents = 'none'
    img.style.maxWidth = 'none'
    img.draggable = false
    pane.appendChild(img)
    imgRef.current = img
    return () => {
      img.remove()
      imgRef.current = null
    }
  }, [pane])

  useEffect(() => {
    if (imgRef.current && url) imgRef.current.src = url
  }, [url])

  useEffect(() => {
    if (imgRef.current) imgRef.current.style.opacity = String(overlay.opacity)
  }, [overlay.opacity])

  // Lage berechnen – bei jedem Zoom neu (beim Verschieben bleibt sie gültig)
  useEffect(() => {
    const img = imgRef.current
    if (!img || !photo) return
    const w = photo.width
    const h = photo.height
    img.style.width = `${w}px`
    img.style.height = `${h}px`
    const place = () => {
      const pts = c.map((p) => map.latLngToLayerPoint([p.lat, p.lng]))
      try {
        img.style.transform = cssMatrix3d(w, h, pts)
        img.style.display = ''
      } catch {
        img.style.display = 'none'
      }
    }
    const hide = () => (img.style.visibility = 'hidden')
    const show = () => {
      place()
      img.style.visibility = 'visible'
    }
    place()
    map.on('zoomstart', hide)
    map.on('zoomend viewreset', show)
    return () => {
      map.off('zoomstart', hide)
      map.off('zoomend viewreset', show)
    }
  }, [map, photo, c])

  return null
}

const handleIcon = (label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:40px;height:40px;border-radius:999px;background:#d4a72c;border:3px solid #000;box-shadow:0 0 0 3px rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;font-weight:800;color:#000;font-size:16px">${label}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
const ICONS = ['1', '2', '3', '4'].map(handleIcon)
const MOVE_ICON = handleIcon('✥')

/** 4 große Eck-Griffe + Griff in der Mitte zum Verschieben */
export function OverlayHandles({ corners, onChange }: { corners: LatLng[]; onChange: (c: LatLng[]) => void }) {
  const center = useMemo(
    () => ({ lat: corners.reduce((a, p) => a + p.lat, 0) / 4, lng: corners.reduce((a, p) => a + p.lng, 0) / 4 }),
    [corners],
  )
  const ref = useRef(corners)
  ref.current = corners
  const dragStart = useRef<{ center: LatLng; corners: LatLng[] } | null>(null)

  return (
    <>
      {corners.map((p, i) => (
        <Marker
          key={i}
          position={p}
          icon={ICONS[i]}
          draggable
          eventHandlers={{
            drag: (e) => {
              const ll = (e.target as L.Marker).getLatLng()
              const next = [...ref.current]
              next[i] = { lat: ll.lat, lng: ll.lng }
              onChange(next)
            },
          }}
        />
      ))}
      <Marker
        position={center}
        icon={MOVE_ICON}
        draggable
        eventHandlers={{
          dragstart: () => (dragStart.current = { center, corners: ref.current }),
          drag: (e) => {
            const s = dragStart.current
            if (!s) return
            const ll = (e.target as L.Marker).getLatLng()
            const dLat = ll.lat - s.center.lat
            const dLng = ll.lng - s.center.lng
            onChange(s.corners.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng })))
          },
          dragend: () => (dragStart.current = null),
        }}
      />
    </>
  )
}

/** Anfangslage: Bild mittig in den sichtbaren Kartenausschnitt (60 % Größe, Seitenverhältnis bleibt) */
export function initialCorners(map: L.Map, imgW: number, imgH: number): LatLng[] {
  const size = map.getSize()
  const scale = Math.min((size.x * 0.6) / imgW, (size.y * 0.45) / imgH)
  const w = imgW * scale
  const h = imgH * scale
  const cx = size.x / 2
  const cy = size.y * 0.35 // etwas nach oben, unten ist das Panel
  const pts = [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ]
  return pts.map(([x, y]) => {
    const ll = map.containerPointToLatLng([x, y])
    return { lat: ll.lat, lng: ll.lng }
  })
}
