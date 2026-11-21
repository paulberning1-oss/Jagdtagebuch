import { ask } from '../components/ConfirmDialog'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Eye, EyeOff, FileUp, Image, ListChecks, Maximize, Move, PenLine, Plus, Square, SquareCheck, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Sheet, useToast } from '../components/ui'
import { db, type Boundary, type Facility, type MapOverlay } from '../db/db'
import { trashBoundaries, trashFacilities, trashOverlay } from '../db/trash'
import { allTypes, typeInfo, typesOfKind, type FacilityType, type GeometryKind } from '../domain/facilityTypes'
import { CategoryForm } from './CategoryForm'
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
                      if (!await ask(`„${o.name}“ löschen? (Eine daraus gezeichnete Reviergrenze bleibt erhalten.)\n\n30 Tage lang wiederherstellbar unter „Mehr → Zuletzt gelöscht“.`)) return
                      await trashOverlay(o)
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
  // Neue eigene Kategorie für diese Geometrie anlegen
  const [newCat, setNewCat] = useState<GeometryKind | null>(null)

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const parts = await readBoundaryFile(file)
      const existing = await db.boundaries.filter((b) => !b.demo).count()
      if (existing && await ask('Es gibt schon eine eigene Reviergrenze. Ersetzen oder die neue zusätzlich hinzufügen?', { ok: 'Ersetzen', cancel: 'Zusätzlich hinzufügen', danger: true })) {
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
        <button className="btn !justify-start !px-3 text-base text-ink-dim" onClick={() => setNewCat(kind)}>
          <Plus className="size-8 shrink-0 rounded border border-dashed border-line p-1" />
          <span className="truncate">Eigene Kategorie…</span>
        </button>
      </div>
    </>
  )

  if (newCat) {
    return (
      <Sheet title="Neue Kategorie" onClose={() => setNewCat(null)}>
        <CategoryForm
          presetKind={newCat}
          onCancel={() => setNewCat(null)}
          onSaved={(c) => onPick({ t: newCat, type: c.id })}
        />
      </Sheet>
    )
  }

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
  onShowRevier,
  onClose,
}: {
  onPickFacility: (f: Facility) => void
  onPickBoundary: (b: Boundary) => void
  /** Karte auf das ganze (eigene) Revier ausrichten */
  onShowRevier: () => void
  onClose: () => void
}) {
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  const boundaries = useLiveQuery(() => db.boundaries.toArray(), []) ?? []
  const toast = useToast()
  // Auswahlmodus: Schlüssel 'f:<id>' (Objekt) bzw. 'b:<id>' (Reviergrenze)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const allKeys = [...boundaries.map((b) => `b:${b.id}`), ...facilities.map((f) => `f:${f.id}`)]
  const demoKeys = [...boundaries.filter((b) => b.demo).map((b) => `b:${b.id}`), ...facilities.filter((f) => f.demo).map((f) => `f:${f.id}`)]
  const toggle = (k: string) => setSel((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])))
  const setMany = (keys: string[], on: boolean) => setSel((s) => (on ? new Set([...s, ...keys]) : new Set([...s].filter((x) => !keys.includes(x)))))
  const stop = () => {
    setSelecting(false)
    setSel(new Set())
  }

  const removeSelected = async () => {
    const keys = [...sel].filter((k) => allKeys.includes(k))
    if (!keys.length) return
    if (!await ask(`${keys.length} Einträge löschen?\n\nDu kannst sie 30 Tage lang unter „Mehr → Zuletzt gelöscht“ wiederherstellen.`)) return
    const n =
      (await trashFacilities(keys.filter((k) => k.startsWith('f:')).map((k) => k.slice(2)))) +
      (await trashBoundaries(keys.filter((k) => k.startsWith('b:')).map((k) => k.slice(2))))
    toast(`${n} gelöscht – wiederherstellen unter „Mehr → Zuletzt gelöscht“`, 'success')
    stop()
  }

  const Row = ({ k, label, onOpen }: { k: string; label: string; onOpen: () => void }) =>
    selecting ? (
      <button className={`btn !justify-start text-left ${sel.has(k) ? '!border-accent' : ''}`} onClick={() => toggle(k)} aria-pressed={sel.has(k)}>
        {sel.has(k) ? <SquareCheck className="shrink-0 text-accent" /> : <Square className="shrink-0 text-ink-dim" />}
        <span className="truncate">{label}</span>
      </button>
    ) : (
      <button className="btn !justify-start text-left" onClick={onOpen}>
        <span className="truncate">{label}</span>
      </button>
    )

  const GroupHead = ({ title, keys }: { title: string; keys: string[] }) => {
    const all = keys.every((k) => sel.has(k))
    return (
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold uppercase tracking-wide text-ink-dim">{title}</h3>
        {selecting && (
          <button className="text-sm font-semibold text-accent underline" onClick={() => setMany(keys, !all)}>
            {all ? 'keine' : 'alle'}
          </button>
        )}
      </div>
    )
  }

  const empty = !facilities.length && !boundaries.length
  return (
    <Sheet
      title={selecting ? `${sel.size} ausgewählt` : 'Revier-Übersicht'}
      onClose={onClose}
      footer={
        selecting ? (
          <>
            <button className="btn flex-1" onClick={stop}>
              Abbrechen
            </button>
            <button className="btn btn-danger flex-1" disabled={!sel.size} onClick={removeSelected}>
              <Trash2 /> Löschen ({sel.size})
            </button>
          </>
        ) : undefined
      }
    >
      {empty && <p className="text-ink-dim">Noch nichts angelegt.</p>}
      {!empty && !selecting && (
        <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
          <button className="btn btn-primary" onClick={onShowRevier}>
            <Maximize /> Mein Revier anzeigen
          </button>
          <button className="btn" onClick={() => setSelecting(true)}>
            <ListChecks /> Auswählen
          </button>
        </div>
      )}
      {selecting && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button className="btn !min-h-11 !px-3 !text-base" onClick={() => setMany(allKeys, sel.size < allKeys.length)}>
            {sel.size < allKeys.length ? 'Alles auswählen' : 'Nichts auswählen'}
          </button>
          {demoKeys.length > 0 && (
            <button className="btn !min-h-11 !px-3 !text-base" onClick={() => setMany(demoKeys, true)}>
              Alle Beispiel-Objekte ({demoKeys.length})
            </button>
          )}
        </div>
      )}
      {boundaries.length > 0 && (
        <>
          <GroupHead title="Reviergrenze" keys={boundaries.map((b) => `b:${b.id}`)} />
          <div className="mb-4 grid gap-2">
            {boundaries.map((b) => (
              <Row key={b.id} k={`b:${b.id}`} label={b.name + (b.demo ? ' (Beispiel)' : '')} onOpen={() => onPickBoundary(b)} />
            ))}
          </div>
        </>
      )}
      {allTypes().map((ti) => {
        const items = facilities.filter((f) => f.type === ti.type).sort((a, b) => a.name.localeCompare(b.name, 'de'))
        if (!items.length) return null
        return (
          <div key={ti.type}>
            <GroupHead title={`${ti.label} (${items.length})`} keys={items.map((f) => `f:${f.id}`)} />
            <div className="mb-4 grid gap-2">
              {items.map((f) => (
                <Row key={f.id} k={`f:${f.id}`} label={(f.name || ti.label) + (f.demo ? ' (Beispiel)' : '')} onOpen={() => onPickFacility(f)} />
              ))}
            </div>
          </div>
        )
      })}
      {selecting && <p className="pb-2 text-sm text-ink-dim">Beim Löschen eines Sitzes gehen seine Anmarschwege mit. Alles lässt sich 30 Tage lang wiederherstellen.</p>}
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
              if (!await ask('Diese Reviergrenze löschen? (30 Tage lang wiederherstellbar unter „Mehr → Zuletzt gelöscht“)')) return
              await trashBoundaries([b.id])
              toast('Reviergrenze gelöscht – wiederherstellbar unter „Mehr → Zuletzt gelöscht“')
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
