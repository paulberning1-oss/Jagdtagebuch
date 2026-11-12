import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Crosshair, Flame, List, MapPin, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer } from 'react-leaflet'
import { Sheet, useToast } from '../components/ui'
import { db } from '../db/db'
import { getSetting, setSetting, useSetting } from '../db/settings'
import type { Sighting } from '../domain/hunt'
import { EMPTY_FILTER, filterSightings } from '../domain/sightings'
import type { LatLng } from '../lib/geo'
import { fmtDateTime } from '../lib/time'
import { useSpecies, useSpeciesMap } from '../journal/hooks'
import { newSighting } from '../journal/huntActions'
import { SightingEditor } from '../journal/SightingEditor'
import { BaseLayer, BoundaryLayer, FacilityLayer, FlyTo, MapClicks } from '../map/MapLayers'
import { PhotoOverlayLayer } from '../map/PhotoOverlay'
import { FALLBACK_PROVIDER } from '../map/providers'
import { CameraImport } from '../sightings/CameraImport'
import { activeFilterCount, FilterSheet } from '../sightings/FilterSheet'
import { SightingHeatmap, SightingPoints } from '../sightings/SightingLayers'

type Panel = 'none' | 'filter' | 'list' | 'camera'

export default function SightingsPage() {
  const all = useLiveQuery(() => db.sightings.toArray(), [])
  const hunts = useLiveQuery(() => db.hunts.toArray(), []) ?? []
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  const boundaries = useLiveQuery(() => db.boundaries.toArray(), []) ?? []
  const overlays = useLiveQuery(() => db.overlays.filter((o) => o.visible).toArray(), []) ?? []
  const baseLayer = useSetting('baseLayer')
  const filter = useSetting('sightingFilter') ?? EMPTY_FILTER
  const view = useSetting('sightingView') ?? 'punkte'
  const species = useSpecies()
  const speciesMap = useSpeciesMap()
  const toast = useToast()

  const [initialView, setInitialView] = useState<{ lat: number; lng: number; zoom: number } | null>(null)
  const [zoom, setZoom] = useState(15)
  const [panel, setPanel] = useState<Panel>('none')
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState<{ s: Sighting; isNew: boolean } | null>(null)
  const [fly, setFly] = useState<{ pos: LatLng; zoom?: number; raise?: boolean; n: number } | null>(null)

  useEffect(() => {
    getSetting('mapView').then((v) => setInitialView(v ?? { lat: 51.2, lng: 10.4, zoom: 6 }))
  }, [])

  const filtered = useMemo(() => (all ? filterSightings(all, filter) : []), [all, filter])
  const totalCount = filtered.reduce((a, s) => a + s.count, 0)
  // Fester Bezugspunkt für das Heatmap-Raster (damit Zellen beim Filtern nicht springen)
  const origin = useMemo(() => (all && all.length ? { lat: all[0].lat, lng: all[0].lng } : null), [all])
  const huntsById = useMemo(() => new Map(hunts.map((h) => [h.id, h])), [hunts])

  const onUnavailable = useCallback(() => setSetting('baseLayer', FALLBACK_PROVIDER.id), [])
  const noop = useCallback(() => {}, [])

  const open = (s: Sighting) => {
    setPanel('none')
    setEdit({ s, isNew: false })
  }

  if (!initialView || !all || baseLayer === undefined) return <div className="flex h-full items-center justify-center text-ink-dim">Lade…</div>

  const editStandPos = (() => {
    if (!edit?.s.huntId) return null
    const h = huntsById.get(edit.s.huntId)
    return h ? { lat: h.lat, lng: h.lng } : null
  })()
  const nFilters = activeFilterCount(filter)
  const resultText = `${filtered.length} Sichtungen · ${totalCount} Stück`

  return (
    <div className="relative h-full">
      <MapContainer center={[initialView.lat, initialView.lng]} zoom={initialView.zoom} maxZoom={21} zoomControl={false} className="h-full w-full">
        <BaseLayer providerId={baseLayer} onUnavailable={onUnavailable} />
        {overlays.map((o) => (
          <PhotoOverlayLayer key={o.id} overlay={o} />
        ))}
        <BoundaryLayer boundaries={boundaries} interactive={false} onSelect={noop} />
        <FacilityLayer facilities={facilities} interactive={false} showLabels={zoom >= 16} onSelect={noop} />
        <MapClicks
          onClick={(p) => {
            if (!adding) return
            setAdding(false)
            setEdit({ s: newSighting(null, p, filter.speciesIds[0] ?? 'rehwild'), isNew: true })
          }}
          onZoom={setZoom}
        />
        <FlyTo target={fly} />
        {view === 'heatmap' ? (
          <SightingHeatmap sightings={filtered} zoom={zoom} origin={origin} />
        ) : (
          <SightingPoints sightings={filtered} species={speciesMap} onSelect={(s) => !adding && open(s)} />
        )}
      </MapContainer>

      {/* Kopfzeile: Zusammenfassung + Filter */}
      {!adding && (
        <div className="pt-safe absolute inset-x-3 top-3 z-[900] flex gap-2">
          <button className="flex min-h-14 flex-1 items-center gap-2 rounded-2xl border border-line bg-panel/95 px-4 text-left shadow-xl" onClick={() => setPanel('filter')}>
            <SlidersHorizontal className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{resultText}</span>
              <span className="block truncate text-xs text-ink-dim">{nFilters ? `${nFilters} Filter aktiv` : 'Alle Sichtungen – tippen zum Filtern'}</span>
            </span>
          </button>
          <button
            className={`btn-round ${view === 'heatmap' ? '!bg-accent !text-accent-ink' : ''}`}
            onClick={() => setSetting('sightingView', view === 'heatmap' ? 'punkte' : 'heatmap')}
            aria-label={view === 'heatmap' ? 'Punkte zeigen' : 'Heatmap zeigen'}
          >
            {view === 'heatmap' ? <MapPin /> : <Flame />}
          </button>
          <button className="btn-round" onClick={() => setPanel('list')} aria-label="Liste">
            <List />
          </button>
        </div>
      )}

      {/* Legende Heatmap */}
      {view === 'heatmap' && !adding && panel === 'none' && filtered.length > 0 && (
        <div className="absolute bottom-24 left-3 z-[900] rounded-xl border border-line bg-panel/90 px-3 py-2 text-xs">
          <div className="mb-1 h-2 w-32 rounded" style={{ background: 'linear-gradient(90deg, rgb(255,235,120), rgb(255,160,60), rgb(230,60,40))' }} />
          <div className="flex justify-between text-ink-dim">
            <span>wenig</span>
            <span>viel Wild</span>
          </div>
        </div>
      )}

      {/* Hinweis beim Setzen */}
      {adding && (
        <div className="pt-safe absolute inset-x-0 top-0 z-[1100] p-3">
          <div className="flex items-center gap-3 rounded-2xl border border-accent bg-panel/95 p-3 shadow-xl">
            <Crosshair className="shrink-0 text-accent" />
            <p className="flex-1 text-base font-semibold">Tippe auf die Karte, wo du das Wild gesehen hast</p>
            <button className="btn-round !size-12" onClick={() => setAdding(false)} aria-label="Abbrechen">
              <X />
            </button>
          </div>
        </div>
      )}

      {/* Knöpfe unten */}
      {!adding && panel === 'none' && (
        <div className="absolute inset-x-3 bottom-4 z-[900] grid grid-cols-2 gap-2">
          <button className="btn btn-primary shadow-xl" onClick={() => setAdding(true)}>
            <Plus /> Sichtung
          </button>
          <button className="btn shadow-xl" onClick={() => setPanel('camera')}>
            <Camera /> Wildkamera
          </button>
        </div>
      )}

      {panel === 'filter' && (
        <FilterSheet filter={filter} species={species} onChange={(f) => setSetting('sightingFilter', f)} onClose={() => setPanel('none')} resultText={resultText} />
      )}

      {panel === 'list' && (
        <Sheet title={resultText} onClose={() => setPanel('none')}>
          {!filtered.length && <p className="text-ink-dim">Keine Sichtungen für diesen Filter.</p>}
          <div className="grid gap-2">
            {[...filtered]
              .sort((a, b) => b.time - a.time)
              .slice(0, 300)
              .map((s) => (
                <button
                  key={s.id}
                  className="btn !justify-start text-left"
                  onClick={() => {
                    setFly({ pos: { lat: s.lat, lng: s.lng }, zoom: 17, raise: true, n: Date.now() })
                    open(s)
                  }}
                >
                  <span className="flex-1">
                    <span className="block">
                      {s.count}× {speciesMap.get(s.speciesId)?.name ?? s.speciesId}
                      {s.sexAge.length ? ` (${s.sexAge.join(', ')})` : ''}
                    </span>
                    <span className="block text-sm font-normal text-ink-dim">
                      {fmtDateTime(new Date(s.time))} ·{' '}
                      {s.source === 'wildkamera' ? 'Wildkamera' : s.source === 'mitjaeger' ? 'Mitjäger' : s.huntId ? `Ansitz ${huntsById.get(s.huntId)?.standName ?? ''}` : 'eigener Anblick'}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </Sheet>
      )}

      {panel === 'camera' && <CameraImport onClose={() => setPanel('none')} />}

      {edit && (
        <SightingEditor
          key={edit.s.id}
          initial={edit.s}
          isNew={edit.isNew}
          standPos={editStandPos}
          onClose={(saved) => {
            if (saved && edit.isNew) toast('Sichtung gespeichert – Wetter wird ergänzt', 'success')
            setEdit(null)
          }}
        />
      )}
    </div>
  )
}
