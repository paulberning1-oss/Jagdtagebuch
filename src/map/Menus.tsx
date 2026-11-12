import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Eye, EyeOff, FileUp, Image, Move, PenLine, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { Sheet, useToast } from '../components/ui'
import { db, type Boundary, type Facility, type MapOverlay } from '../db/db'
import { FACILITY_TYPES, typeInfo, typesOfKind, type FacilityType } from '../domain/facilityTypes'
import { fromPos, polygonArea } from '../lib/geo'
import { newId } from '../lib/id'
import { readBoundaryFile } from '../lib/importBoundary'
import { TILE_PROVIDERS } from './providers'

// ---------- Kartenebenen ----------

export function LayerMenu({
  current,
  onPick,
  onClose,
  onAlign,
}: {
  current: string
  onPick: (id: string) => void
  onClose: () => void
  onAlign: (o: MapOverlay) => void
}) {
  const overlays = useLiveQuery(() => db.overlays.toArray(), []) ?? []
  return (
    <Sheet title="Kartenebene" onClose={onClose}>
      <div className="grid gap-2">
        {TILE_PROVIDERS.map((p) => {
          const ok = p.isAvailable()
          return (
            <button
              key={p.id}
              disabled={!ok}
              className={`btn !justify-start text-left ${current === p.id ? 'btn-primary' : ''}`}
              onClick={() => onPick(p.id)}
            >
              <span className="flex-1">
                <span className="block">{p.label}</span>
                <span className="block text-sm font-normal opacity-75">
                  {ok ? p.description : p.id === 'google' && navigator.onLine ? 'Kein API-Schlüssel hinterlegt' : 'Nur mit Internet'}
                </span>
              </span>
              {current === p.id && <Check />}
            </button>
          )
        })}
      </div>
      {overlays.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-ink-dim">Eigene Revierkarten (Foto)</h3>
          <div className="grid gap-2">
            {overlays.map((o) => (
              <div key={o.id} className="card flex flex-col gap-2 !p-3">
                <p className="font-semibold">{o.name}</p>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <button className={`btn !px-2 !text-base ${o.visible ? 'btn-primary' : ''}`} onClick={() => db.overlays.update(o.id, { visible: !o.visible })}>
                    {o.visible ? <Eye /> : <EyeOff />} {o.visible ? 'Sichtbar' : 'Aus'}
                  </button>
                  <button className="btn !px-2 !text-base" onClick={() => onAlign(o)}>
                    <Move /> Ausrichten
                  </button>
                  <button
                    className="btn btn-danger !px-3"
                    aria-label="Revierkarte löschen"
                    onClick={async () => {
                      if (!confirm(`„${o.name}“ löschen? (Eine daraus gezeichnete Reviergrenze bleibt erhalten.)`)) return
                      await db.overlays.delete(o.id)
                      await db.photos.delete(o.photoId)
                    }}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}

// ---------- Neues Element ----------

export type AddChoice =
  | { t: 'point'; type: FacilityType }
  | { t: 'line'; type: FacilityType }
  | { t: 'area'; type: FacilityType }
  | { t: 'boundary' }

export function AddMenu({
  onPick,
  onImported,
  onPhoto,
  onClose,
}: {
  onPick: (c: AddChoice) => void
  onImported: (b: Boundary[]) => void
  onPhoto: (file: File) => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const parts = await readBoundaryFile(file)
      const existing = await db.boundaries.filter((b) => !b.demo).count()
      if (existing && confirm('Es gibt schon eine eigene Reviergrenze. Ersetzen? (Abbrechen = zusätzlich hinzufügen)')) {
        await db.boundaries.filter((b) => !b.demo).delete()
      }
      const rows: Boundary[] = parts.map((p) => ({ id: newId(), name: p.name, geometry: p.geometry, createdAt: Date.now() }))
      await db.boundaries.bulkAdd(rows)
      toast(`${rows.length} Fläche(n) als Reviergrenze importiert`, 'success')
      onImported(rows)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const Group = ({ title, kind, t }: { title: string; kind: 'point' | 'line' | 'area'; t: 'point' | 'line' | 'area' }) => (
    <>
      <h3 className="mb-2 mt-1 text-sm font-semibold uppercase tracking-wide text-ink-dim">{title}</h3>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {typesOfKind(kind).map((ti) => (
          <button key={ti.type} className="btn !justify-start !px-3 text-base" onClick={() => onPick({ t, type: ti.type })}>
            <span
              className={`inline-flex size-8 shrink-0 items-center justify-center text-xs font-extrabold text-black ${
                kind === 'point' ? (ti.isStand ? 'rounded-lg' : 'rounded-full') : 'rounded'
              }`}
              style={{ background: ti.color }}
            >
              {ti.glyph}
            </span>
            <span className="truncate">{ti.label}</span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <Sheet title="Hinzufügen" onClose={onClose}>
      <Group title="Punkt setzen" kind="point" t="point" />
      <Group title="Linie zeichnen" kind="line" t="line" />
      <Group title="Fläche zeichnen" kind="area" t="area" />
      <h3 className="mb-2 mt-1 text-sm font-semibold uppercase tracking-wide text-ink-dim">Reviergrenze</h3>
      <div className="grid grid-cols-1 gap-2">
        <button className="btn" onClick={() => onPick({ t: 'boundary' })}>
          <PenLine /> Grenze einzeichnen
        </button>
        <button className="btn" onClick={() => photoRef.current?.click()}>
          <Image /> Aus Foto einer Revierkarte übertragen
        </button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onPhoto(f)
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <FileUp /> KML / GeoJSON importieren
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json,application/json"
          className="hidden"
          onChange={(e) => {
            importFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    </Sheet>
  )
}

// ---------- Liste aller Einrichtungen ----------

export function FacilityList({
  onPickFacility,
  onPickBoundary,
  onClose,
}: {
  onPickFacility: (f: Facility) => void
  onPickBoundary: (b: Boundary) => void
  onClose: () => void
}) {
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  const boundaries = useLiveQuery(() => db.boundaries.toArray(), []) ?? []
  return (
    <Sheet title="Revier-Übersicht" onClose={onClose}>
      {!facilities.length && !boundaries.length && <p className="text-ink-dim">Noch nichts angelegt.</p>}
      {boundaries.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-dim">Reviergrenze</h3>
          <div className="mb-4 grid gap-2">
            {boundaries.map((b) => (
              <button key={b.id} className="btn !justify-start text-left" onClick={() => onPickBoundary(b)}>
                {b.name}
              </button>
            ))}
          </div>
        </>
      )}
      {FACILITY_TYPES.map((ti) => {
        const items = facilities.filter((f) => f.type === ti.type).sort((a, b) => a.name.localeCompare(b.name, 'de'))
        if (!items.length) return null
        return (
          <div key={ti.type}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-dim">
              {ti.label} ({items.length})
            </h3>
            <div className="mb-4 grid gap-2">
              {items.map((f) => (
                <button key={f.id} className="btn !justify-start text-left" onClick={() => onPickFacility(f)}>
                  <span className="truncate">{f.name || ti.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </Sheet>
  )
}

// ---------- Reviergrenze bearbeiten ----------

export function BoundarySheet({ id, onClose, onRedraw }: { id: string; onClose: () => void; onRedraw: (b: Boundary) => void }) {
  const b = useLiveQuery(() => db.boundaries.get(id), [id])
  const toast = useToast()
  if (!b) return null
  const polys = b.geometry.type === 'Polygon' ? [b.geometry.coordinates] : b.geometry.coordinates
  const ha = polys.reduce((s, p) => s + polygonArea(p[0].map(fromPos)), 0) / 10000
  return (
    <Sheet
      title="Reviergrenze"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-danger"
            aria-label="Löschen"
            onClick={async () => {
              if (!confirm('Diese Reviergrenze löschen?')) return
              await db.boundaries.delete(b.id)
              toast('Reviergrenze gelöscht')
              onClose()
            }}
          >
            <Trash2 />
          </button>
          <button className="btn btn-primary flex-1" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      {b.demo && <p className="mb-3 text-sm text-hint">Teil des fiktiven Beispielreviers</p>}
      <label className="mb-4 block">
        <span className="label">Name</span>
        <input className="input" defaultValue={b.name} onChange={(e) => db.boundaries.update(b.id, { name: e.target.value })} />
      </label>
      <p className="mb-4 text-ink-dim">Fläche: {ha.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ha</p>
      <button className="btn w-full" onClick={() => onRedraw(b)}>
        <PenLine /> Neu zeichnen
      </button>
    </Sheet>
  )
}

export function defaultName(type: FacilityType, existing: Facility[]) {
  const n = existing.filter((f) => f.type === type).length + 1
  return `${typeInfo(type).label} ${n}`
}
