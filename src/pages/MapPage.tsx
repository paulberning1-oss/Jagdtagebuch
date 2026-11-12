import { useLiveQuery } from 'dexie-react-hooks'
import L from 'leaflet'
import { Crosshair, Layers, List, LocateFixed, Plus, Timer, Undo2, Wind, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer } from 'react-leaflet'
import { useToast } from '../components/ui'
import { db, type Boundary, type Facility } from '../db/db'
import { getSetting, setSetting, useSetting } from '../db/settings'
import { DEMO_CENTER, DEMO_ZOOM, loadDemoData } from '../demo/demoRevier'
import { typeInfo, type FacilityType } from '../domain/facilityTypes'
import { fromPos, toPos, type LatLng } from '../lib/geo'
import { newId } from '../lib/id'
import { savePhoto } from '../lib/image'
import { initialCorners, OverlayHandles, PhotoOverlayLayer } from '../map/PhotoOverlay'
import { navigate } from '../lib/router'
import { fmtDuration, useNow, useRunningHunt } from '../journal/hooks'
import { FacilityEditor } from '../map/FacilityEditor'
import {
  BaseLayer,
  BoundaryLayer,
  ConeLayer,
  DraftLayer,
  FacilityLayer,
  FlyTo,
  LocationLayer,
  MapClicks,
  MapRef,
} from '../map/MapLayers'
import { AddMenu, BoundarySheet, defaultName, FacilityList, LayerMenu, type AddChoice } from '../map/Menus'
import { FALLBACK_PROVIDER } from '../map/providers'
import { WindPanel, type ConeOverlay } from '../map/WindPanel'

/** Was passiert beim nächsten Tipp auf die Karte? */
type Mode =
  | { t: 'view' }
  | { t: 'place'; type: FacilityType; moveId?: string }
  | { t: 'draw'; kind: 'line' | 'area' | 'boundary'; type?: FacilityType; points: LatLng[]; replaceId?: string }
  /** Revier-Foto ausrichten */
  | { t: 'overlay'; id: string; corners: LatLng[]; opacity: number }

/** Welches Panel ist unten offen? */
type Panel =
  | { t: 'none' }
  | { t: 'layers' }
  | { t: 'add' }
  | { t: 'list' }
  | { t: 'edit'; id: string }
  | { t: 'boundary'; id: string }
  | { t: 'wind'; standId: string | null }

type FlyTarget = { pos: LatLng; zoom?: number; bounds?: L.LatLngBoundsExpression; raise?: boolean; n: number }

const GERMANY = { lat: 51.2, lng: 10.4, zoom: 6 }

export default function MapPage() {
  const facilities = useLiveQuery(() => db.facilities.toArray(), [])
  const boundaries = useLiveQuery(() => db.boundaries.toArray(), [])
  const overlays = useLiveQuery(() => db.overlays.toArray(), []) ?? []
  const mapRef = useRef<L.Map | null>(null)
  const baseLayer = useSetting('baseLayer')
  const toast = useToast()

  const [initialView, setInitialView] = useState<{ lat: number; lng: number; zoom: number } | null>(null)
  const [mode, setMode] = useState<Mode>({ t: 'view' })
  const [panel, setPanel] = useState<Panel>({ t: 'none' })
  const [zoom, setZoom] = useState(15)
  const [fly, setFly] = useState<FlyTarget | null>(null)
  const [cone, setCone] = useState<ConeOverlay | null>(null)
  const [loc, setLoc] = useState<{ pos: LatLng; accuracy: number } | null>(null)
  const flyN = useRef(0)
  const lastConeStand = useRef<string | null>(null)

  // Startansicht: zuletzt gesehener Ausschnitt → Reviergrenze → Deutschland
  useEffect(() => {
    ;(async () => {
      const saved = await getSetting('mapView')
      if (saved) return setInitialView(saved)
      const b = await db.boundaries.toCollection().first()
      if (b) {
        const c = L.geoJSON(b.geometry).getBounds().getCenter()
        return setInitialView({ lat: c.lat, lng: c.lng, zoom: 15 })
      }
      setInitialView(GERMANY)
    })()
  }, [])

  // raise = Ziel oberhalb des unteren Panels zeigen
  const flyTo = useCallback((pos: LatLng, zoomLevel?: number, raise = false) => {
    setFly({ pos, zoom: zoomLevel, raise, n: ++flyN.current })
  }, [])
  const flyToBounds = (bounds: L.LatLngBoundsExpression, raise = false) =>
    setFly({ pos: { lat: 0, lng: 0 }, bounds, raise, n: ++flyN.current })

  // Witterungskegel anzeigen; bei anderem Sitz/Wind den ganzen Kegel ins Bild holen
  const onConeOverlay = useCallback((o: ConeOverlay | null) => {
    setCone(o)
    if (!o) {
      lastConeStand.current = null
      return
    }
    if (o.fitKey !== lastConeStand.current) {
      lastConeStand.current = o.fitKey
      setFly({ pos: o.stand, bounds: L.latLngBounds([...o.cone, o.stand]), raise: true, n: ++flyN.current })
    }
  }, [])

  const saveView = useMemo(() => {
    let t: ReturnType<typeof setTimeout>
    return (c: LatLng, z: number) => {
      clearTimeout(t)
      t = setTimeout(() => setSetting('mapView', { lat: c.lat, lng: c.lng, zoom: z }), 500)
    }
  }, [])

  // ---------- Tipp auf die Karte ----------
  const onMapClick = async (p: LatLng) => {
    if (mode.t === 'place') {
      if (mode.moveId) {
        await db.facilities.update(mode.moveId, { geometry: { type: 'Point', coordinates: toPos(p) }, updatedAt: Date.now() })
        setMode({ t: 'view' })
        setPanel({ t: 'edit', id: mode.moveId })
        flyTo(p, undefined, true)
        return
      }
      await createPoint(mode.type, p)
      return
    }
    if (mode.t === 'draw') {
      setMode({ ...mode, points: [...mode.points, p] })
    }
  }

  const createPoint = async (type: FacilityType, p: LatLng) => {
    const now = Date.now()
    const f: Facility = {
      id: newId(),
      type,
      name: defaultName(type, facilities ?? []),
      geometry: { type: 'Point', coordinates: toPos(p) },
      bearing: null,
      fieldWidth: typeInfo(type).isStand ? 60 : null,
      notes: '',
      photoIds: [],
      createdAt: now,
      updatedAt: now,
    }
    await db.facilities.add(f)
    setMode({ t: 'view' })
    setPanel({ t: 'edit', id: f.id })
    flyTo(p, undefined, true)
  }

  const placeAtMyLocation = () => {
    if (mode.t !== 'place') return
    locate((pos) => onMapClick(pos))
  }

  // ---------- Zeichnen abschließen ----------
  const finishDraw = async () => {
    if (mode.t !== 'draw') return
    const pts = mode.points
    const now = Date.now()
    if (mode.kind === 'line') {
      if (pts.length < 2) return
      const geometry = { type: 'LineString' as const, coordinates: pts.map(toPos) }
      if (mode.replaceId) {
        await db.facilities.update(mode.replaceId, { geometry, updatedAt: now })
        setPanel({ t: 'edit', id: mode.replaceId })
      } else {
        const id = newId()
        await db.facilities.add({
          id,
          type: mode.type!,
          name: defaultName(mode.type!, facilities ?? []),
          geometry,
          notes: '',
          photoIds: [],
          createdAt: now,
          updatedAt: now,
        })
        setPanel({ t: 'edit', id })
      }
    } else {
      if (pts.length < 3) return
      const ring = [...pts, pts[0]].map(toPos)
      const geometry = { type: 'Polygon' as const, coordinates: [ring] }
      if (mode.kind === 'boundary') {
        if (mode.replaceId) {
          await db.boundaries.update(mode.replaceId, { geometry })
          setPanel({ t: 'boundary', id: mode.replaceId })
        } else {
          const id = newId()
          await db.boundaries.add({ id, name: 'Reviergrenze', geometry, createdAt: now })
          setPanel({ t: 'boundary', id })
        }
      } else if (mode.replaceId) {
        await db.facilities.update(mode.replaceId, { geometry, updatedAt: now })
        setPanel({ t: 'edit', id: mode.replaceId })
      } else {
        const id = newId()
        await db.facilities.add({
          id,
          type: mode.type!,
          name: defaultName(mode.type!, facilities ?? []),
          geometry,
          notes: '',
          photoIds: [],
          createdAt: now,
          updatedAt: now,
        })
        setPanel({ t: 'edit', id })
      }
    }
    setMode({ t: 'view' })
  }

  // ---------- Revierkarte aus Foto ----------
  const startPhotoOverlay = async (file: File) => {
    setPanel({ t: 'none' })
    const map = mapRef.current
    if (!map) return
    try {
      toast('Foto wird vorbereitet…')
      const photoId = await savePhoto(file, false, 2400)
      const photo = await db.photos.get(photoId)
      if (!photo) return
      const corners = initialCorners(map, photo.width, photo.height)
      const id = newId()
      await db.overlays.add({ id, name: 'Revierkarte (Foto)', photoId, corners, opacity: 0.6, visible: true, createdAt: Date.now() })
      setMode({ t: 'overlay', id, corners, opacity: 0.6 })
    } catch (e) {
      toast(`Foto konnte nicht geladen werden: ${(e as Error).message}`, 'error')
    }
  }

  const saveOverlay = async (thenDraw: boolean) => {
    if (mode.t !== 'overlay') return
    await db.overlays.update(mode.id, { corners: mode.corners, opacity: mode.opacity, visible: true })
    if (thenDraw) {
      setMode({ t: 'draw', kind: 'boundary', points: [] })
      toast('Tippe jetzt die Grenzpunkte auf dem Foto nach')
    } else {
      setMode({ t: 'view' })
      toast('Revierkarte gespeichert – ein-/ausblenden über „Kartenebene“', 'success')
    }
  }

  const startAdd = (c: AddChoice) => {
    setPanel({ t: 'none' })
    if (c.t === 'point') setMode({ t: 'place', type: c.type })
    else if (c.t === 'boundary') setMode({ t: 'draw', kind: 'boundary', points: [] })
    else setMode({ t: 'draw', kind: c.t, type: c.type, points: [] })
  }

  // ---------- Auswahl auf der Karte ----------
  const onSelectFacility = (f: Facility) => {
    if (panel.t === 'wind' && typeInfo(f.type).isStand) {
      setPanel({ t: 'wind', standId: f.id })
      return
    }
    setPanel({ t: 'edit', id: f.id })
  }

  const focusFacility = (f: Facility) => {
    if (f.geometry.type === 'Point') flyTo(fromPos(f.geometry.coordinates), 17, true)
    else flyToBounds(L.geoJSON(f.geometry).getBounds(), true)
    setPanel({ t: 'edit', id: f.id })
  }

  // ---------- Eigener Standort ----------
  const locate = (then?: (p: LatLng) => void) => {
    if (!('geolocation' in navigator)) return toast('Standort wird von diesem Gerät nicht unterstützt', 'error')
    if (!window.isSecureContext)
      return toast('Standort geht nur über https:// (z. B. GitHub Pages oder „npm run dev:handy“)', 'error')
    toast('Suche Standort…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude }
        setLoc({ pos, accuracy: p.coords.accuracy })
        flyTo(pos, 17)
        then?.(pos)
      },
      (e) => toast(e.code === 1 ? 'Standortfreigabe verweigert – bitte in den Einstellungen erlauben' : 'Standort nicht gefunden', 'error'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )
  }

  const onLayerUnavailable = useCallback(
    (p: { id: string; label: string }, reason: string) => {
      if (p.id === FALLBACK_PROVIDER.id) return
      toast(`${p.label} nicht verfügbar (${reason}) – zeige ${FALLBACK_PROVIDER.label}`, 'error')
      setSetting('baseLayer', FALLBACK_PROVIDER.id)
    },
    [toast],
  )

  if (!initialView || facilities === undefined || boundaries === undefined || baseLayer === undefined) {
    return <div className="flex h-full items-center justify-center text-ink-dim">Lade Karte…</div>
  }

  const interactive = mode.t === 'view'
  const isEmpty = !facilities.length && !boundaries.length
  const drawHint =
    mode.t === 'place'
      ? mode.moveId
        ? 'Tippe auf die neue Position'
        : `Tippe auf die Karte: Wo ist ${typeInfo(mode.type).phrase}?`
      : mode.t === 'draw'
        ? mode.kind === 'boundary'
          ? 'Tippe die Eckpunkte der Reviergrenze nacheinander an'
          : mode.kind === 'line'
            ? 'Tippe den Verlauf des Wechsels Punkt für Punkt an'
            : `Tippe die Eckpunkte der Fläche (${typeInfo(mode.type!).label}) an`
        : null
  const canFinish = mode.t === 'draw' && mode.points.length >= (mode.kind === 'line' ? 2 : 3)

  return (
    <div className="relative h-full">
      <MapContainer
        center={[initialView.lat, initialView.lng]}
        zoom={initialView.zoom}
        maxZoom={21}
        zoomControl={false}
        className="h-full w-full"
        attributionControl
      >
        <BaseLayer providerId={baseLayer} onUnavailable={onLayerUnavailable} />
        <MapClicks onClick={onMapClick} onMoveEnd={saveView} onZoom={setZoom} />
        <FlyTo target={fly} />
        <MapRef mapRef={mapRef} />
        {overlays
          .filter((o) => o.visible || (mode.t === 'overlay' && mode.id === o.id))
          .map((o) =>
            mode.t === 'overlay' && mode.id === o.id ? (
              <PhotoOverlayLayer key={o.id} overlay={{ ...o, opacity: mode.opacity }} corners={mode.corners} />
            ) : (
              <PhotoOverlayLayer key={o.id} overlay={o} />
            ),
          )}
        {mode.t === 'overlay' && <OverlayHandles corners={mode.corners} onChange={(corners) => setMode({ ...mode, corners })} />}
        <BoundaryLayer boundaries={boundaries} interactive={interactive} onSelect={(b: Boundary) => setPanel({ t: 'boundary', id: b.id })} />
        <FacilityLayer
          facilities={facilities}
          interactive={interactive}
          selectedId={panel.t === 'edit' ? panel.id : panel.t === 'wind' ? panel.standId : null}
          highlightIds={cone?.highlightIds}
          showLabels={zoom >= 16}
          onSelect={onSelectFacility}
        />
        {cone && <ConeLayer cone={cone.cone} stand={cone.stand} />}
        {mode.t === 'draw' && <DraftLayer points={mode.points} closed={mode.kind !== 'line'} />}
        {loc && <LocationLayer pos={loc.pos} accuracy={loc.accuracy} />}
      </MapContainer>

      {/* Hinweisleiste beim Setzen/Zeichnen */}
      {drawHint && (
        <div className="pt-safe absolute inset-x-0 top-0 z-[1100] p-3">
          <div className="flex items-center gap-3 rounded-2xl border border-accent bg-panel/95 p-3 shadow-xl">
            <Crosshair className="shrink-0 text-accent" />
            <p className="flex-1 text-base font-semibold">{drawHint}</p>
            <button className="btn-round !size-12" onClick={() => setMode({ t: 'view' })} aria-label="Abbrechen">
              <X />
            </button>
          </div>
          {mode.t === 'place' && !mode.moveId && (
            <button className="btn mt-2 w-full" onClick={placeAtMyLocation}>
              <LocateFixed /> Hier, wo ich gerade stehe
            </button>
          )}
          {mode.t === 'place' && mode.moveId && (
            <button className="btn mt-2 w-full" onClick={placeAtMyLocation}>
              <LocateFixed /> An meinen Standort verschieben
            </button>
          )}
        </div>
      )}

      {/* Revier-Foto ausrichten */}
      {mode.t === 'overlay' && (
        <>
          <div className="pt-safe absolute inset-x-0 top-0 z-[1100] p-3">
            <div className="rounded-2xl border border-accent bg-panel/95 p-3 shadow-xl">
              <p className="text-base font-semibold">Foto ausrichten</p>
              <p className="text-sm text-ink-dim">
                Karte grob hinschieben, dann die Ecken 1–4 ziehen, bis Wege und Waldränder passen. ✥ verschiebt das ganze Bild.
              </p>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 z-[1100] border-t border-line bg-panel p-3">
            <label className="mb-2 flex items-center gap-3">
              <span className="text-sm text-ink-dim">Transparenz</span>
              <input
                type="range"
                className="h-10 flex-1 accent-[#d4a72c]"
                min={0.15}
                max={1}
                step={0.05}
                value={mode.opacity}
                onChange={(e) => setMode({ ...mode, opacity: Number(e.target.value) })}
              />
            </label>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
              <button className="btn" onClick={() => setMode({ t: 'view' })} aria-label="Abbrechen">
                <X />
              </button>
              <button className="btn" onClick={() => saveOverlay(false)}>
                Speichern
              </button>
              <button className="btn btn-primary" onClick={() => saveOverlay(true)}>
                Grenze zeichnen
              </button>
            </div>
          </div>
        </>
      )}

      {/* Steuerung beim Zeichnen */}
      {mode.t === 'draw' && (
        <div className="absolute inset-x-0 bottom-0 z-[1100] flex gap-2 border-t border-line bg-panel p-3">
          <button
            className="btn"
            disabled={!mode.points.length}
            onClick={() => setMode({ ...mode, points: mode.points.slice(0, -1) })}
            aria-label="Letzten Punkt entfernen"
          >
            <Undo2 />
          </button>
          <button className="btn flex-1" onClick={() => locate((p) => setMode((m) => (m.t === 'draw' ? { ...m, points: [...m.points, p] } : m)))}>
            <LocateFixed /> Mein Standort
          </button>
          <button className="btn btn-primary flex-1" disabled={!canFinish} onClick={finishDraw}>
            Fertig ({mode.points.length})
          </button>
        </div>
      )}

      {/* Runde Knöpfe rechts */}
      {mode.t === 'view' && (
        <div className="pt-safe absolute right-3 top-3 z-[900] flex flex-col gap-3">
          <button className="btn-round" onClick={() => setPanel({ t: 'layers' })} aria-label="Kartenebene">
            <Layers />
          </button>
          <button className="btn-round" onClick={() => locate()} aria-label="Mein Standort">
            <LocateFixed />
          </button>
          <button className="btn-round" onClick={() => setPanel({ t: 'list' })} aria-label="Übersicht">
            <List />
          </button>
          <button
            className={`btn-round ${panel.t === 'wind' ? '!bg-accent !text-accent-ink' : ''}`}
            onClick={() => setPanel({ t: 'wind', standId: null })}
            aria-label="Wind & Witterung"
          >
            <Wind />
          </button>
        </div>
      )}

      {/* Hinzufügen */}
      {mode.t === 'view' && panel.t === 'none' && (
        <div className="absolute bottom-4 left-1/2 z-[900] -translate-x-1/2">
          <button className="btn btn-primary !min-h-16 rounded-full !px-8 shadow-xl" onClick={() => setPanel({ t: 'add' })}>
            <Plus /> Hinzufügen
          </button>
        </div>
      )}

      {/* Laufender Ansitz */}
      {mode.t === 'view' && <RunningHuntPill />}

      {/* Willkommen bei leerer Karte */}
      {isEmpty && mode.t === 'view' && panel.t === 'none' && (
        <div className="absolute inset-x-3 top-1/4 z-[950] mx-auto max-w-md rounded-2xl border border-line bg-panel/95 p-5 shadow-2xl">
          <h2 className="mb-2 text-xl font-bold">Willkommen im Ansitzplaner</h2>
          <p className="mb-4 text-ink-dim">
            Zeichne deine Reviergrenze ein oder importiere sie (KML/GeoJSON). Zum Ausprobieren gibt es ein fiktives Beispielrevier.
          </p>
          <div className="grid gap-2">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await loadDemoData()
                flyTo(DEMO_CENTER, DEMO_ZOOM)
                toast('Beispielrevier geladen – löschbar unter „Mehr“', 'success')
              }}
            >
              Beispielrevier laden
            </button>
            <button className="btn" onClick={() => setPanel({ t: 'add' })}>
              Eigenes Revier anlegen
            </button>
          </div>
        </div>
      )}

      {/* Panels */}
      {panel.t === 'layers' && (
        <LayerMenu
          current={baseLayer}
          onAlign={(o) => {
            setPanel({ t: 'none' })
            setMode({ t: 'overlay', id: o.id, corners: o.corners, opacity: o.opacity })
            flyToBounds(L.latLngBounds(o.corners.map((p) => [p.lat, p.lng] as [number, number])))
          }}
          onPick={(id) => {
            setSetting('baseLayer', id)
            setPanel({ t: 'none' })
          }}
          onClose={() => setPanel({ t: 'none' })}
        />
      )}
      {panel.t === 'add' && (
        <AddMenu
          onPick={startAdd}
          onPhoto={startPhotoOverlay}
          onImported={(rows) => {
            setPanel({ t: 'none' })
            if (rows[0]) flyToBounds(L.geoJSON(rows.map((r) => r.geometry)).getBounds())
          }}
          onClose={() => setPanel({ t: 'none' })}
        />
      )}
      {panel.t === 'list' && (
        <FacilityList
          onPickFacility={focusFacility}
          onPickBoundary={(b) => {
            flyToBounds(L.geoJSON(b.geometry).getBounds(), true)
            setPanel({ t: 'boundary', id: b.id })
          }}
          onClose={() => setPanel({ t: 'none' })}
        />
      )}
      {panel.t === 'edit' && (
        <FacilityEditor
          key={panel.id}
          id={panel.id}
          onClose={() => setPanel({ t: 'none' })}
          onMove={(f) => {
            setPanel({ t: 'none' })
            setMode({ t: 'place', type: f.type, moveId: f.id })
          }}
          onRedraw={(f) => {
            setPanel({ t: 'none' })
            setMode({ t: 'draw', kind: f.geometry.type === 'LineString' ? 'line' : 'area', type: f.type, points: [], replaceId: f.id })
          }}
          onWind={(f) => setPanel({ t: 'wind', standId: f.id })}
        />
      )}
      {panel.t === 'boundary' && (
        <BoundarySheet
          id={panel.id}
          onClose={() => setPanel({ t: 'none' })}
          onRedraw={(b) => {
            setPanel({ t: 'none' })
            setMode({ t: 'draw', kind: 'boundary', points: [], replaceId: b.id })
          }}
        />
      )}
      {panel.t === 'wind' && (
        <WindPanel
          initialStandId={panel.standId}
          onOverlay={onConeOverlay}
          onFocusStand={(p) => flyTo(p, 16, true)}
          onClose={() => setPanel({ t: 'none' })}
        />
      )}
    </div>
  )
}

/** Kleine Leiste oben links, solange ein Ansitz läuft – Tipp öffnet das Tagebuch */
function RunningHuntPill() {
  const running = useRunningHunt()
  const now = useNow(30000)
  if (!running) return null
  return (
    <div className="pt-safe absolute left-3 top-3 z-[900] max-w-[calc(100%-6rem)]">
      <button
        className="flex min-h-14 items-center gap-2 rounded-full border-2 border-accent bg-panel/95 px-4 text-left shadow-xl"
        onClick={() => navigate('tagebuch')}
      >
        <Timer className="shrink-0 text-accent" />
        <span className="truncate font-semibold">
          {running.standName} · {fmtDuration(now - running.start)}
        </span>
      </button>
    </div>
  )
}
