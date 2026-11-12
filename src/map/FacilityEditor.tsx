import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Move, PenLine, Play, Trash2, Wind } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, Sheet, useToast } from '../components/ui'
import { db, type Facility } from '../db/db'
import { typeInfo, typesOfKind, type FacilityType } from '../domain/facilityTypes'
import { COMPASS_8, compass16, fromPos, lineLength, polygonArea } from '../lib/geo'
import { savePhoto } from '../lib/image'
import { navigate } from '../lib/router'
import { useRunningHunt } from '../journal/hooks'
import { startHunt } from '../journal/huntActions'

export function FacilityEditor({
  id,
  onClose,
  onMove,
  onRedraw,
  onWind,
}: {
  id: string
  onClose: () => void
  onMove: (f: Facility) => void
  onRedraw: (f: Facility) => void
  onWind: (f: Facility) => void
}) {
  const stored = useLiveQuery(() => db.facilities.get(id), [id])
  const [draft, setDraft] = useState<Facility | null>(null)
  const toast = useToast()
  const running = useRunningHunt()

  // Entwurf aus der Datenbank übernehmen. Danach nur noch die Geometrie
  // nachziehen (z. B. nach "Position verschieben"), damit beim Tippen nichts springt.
  useEffect(() => {
    if (!stored) return
    setDraft((d) => {
      if (!d || d.id !== stored.id) return stored
      if (JSON.stringify(d.geometry) !== JSON.stringify(stored.geometry)) return { ...d, geometry: stored.geometry }
      return d
    })
  }, [stored])

  if (!draft) return null
  const info = typeInfo(draft.type)

  // Jede Änderung wird sofort gespeichert – kein "Speichern" vergessen.
  const update = (patch: Partial<Facility>) => {
    const next = { ...draft, ...patch, updatedAt: Date.now() }
    setDraft(next)
    db.facilities.update(draft.id, { ...patch, updatedAt: next.updatedAt })
  }

  const remove = async () => {
    if (!confirm(`„${draft.name || info.label}“ wirklich löschen?`)) return
    await db.facilities.delete(draft.id)
    if (draft.photoIds.length) await db.photos.bulkDelete(draft.photoIds)
    toast('Gelöscht')
    onClose()
  }

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      const pid = await savePhoto(file, !!draft.demo)
      update({ photoIds: [...draft.photoIds, pid] })
    } catch (e) {
      toast(`Foto konnte nicht gespeichert werden: ${(e as Error).message}`, 'error')
    }
  }

  const removePhoto = async (pid: string) => {
    if (!confirm('Foto löschen?')) return
    update({ photoIds: draft.photoIds.filter((p) => p !== pid) })
    await db.photos.delete(pid)
  }

  let size = ''
  if (draft.geometry.type === 'Polygon') {
    const ha = polygonArea(draft.geometry.coordinates[0].map(fromPos)) / 10000
    size = `${ha.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha`
  } else if (draft.geometry.type === 'LineString') {
    size = `${Math.round(lineLength(draft.geometry.coordinates.map(fromPos)))} m lang`
  }

  return (
    <Sheet
      title={draft.name || info.label}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={remove} aria-label="Löschen">
            <Trash2 />
          </button>
          <button className="btn btn-primary flex-1" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      {draft.demo && <p className="mb-3 text-sm text-hint">Teil des fiktiven Beispielreviers</p>}
      {info.isStand && (
        <div className="mb-4 grid grid-cols-1 gap-2">
          <button className="btn btn-primary w-full" onClick={() => onWind(draft)}>
            <Wind /> Wind & Witterung prüfen
          </button>
          {!running && (
            <button
              className="btn w-full"
              onClick={async () => {
                try {
                  await startHunt({ stand: draft })
                  toast('Ansitz gestartet – Waidmannsheil!', 'success')
                  navigate('tagebuch')
                } catch (e) {
                  toast((e as Error).message, 'error')
                }
              }}
            >
              <Play /> Ansitz hier starten
            </button>
          )}
        </div>
      )}
      <Field label="Name">
        <input className="input" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder={info.label} />
      </Field>
      <Field label="Typ">
        <select className="input" value={draft.type} onChange={(e) => update({ type: e.target.value as FacilityType })}>
          {typesOfKind(info.kind).map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      {size && <p className="-mt-2 mb-4 text-ink-dim">Größe: {size}</p>}

      {info.hasBearing && (
        <div className="mb-4">
          <span className="label">
            {info.isStand ? 'Blickrichtung (Mitte des Schussfelds)' : 'Blickrichtung'}
            {draft.bearing != null && `: ${Math.round(draft.bearing)}° ${compass16(draft.bearing)}`}
          </span>
          <div className="grid grid-cols-4 gap-2">
            {COMPASS_8.map((c, i) => (
              <button
                key={c}
                className={`btn !px-0 ${draft.bearing != null && Math.round(draft.bearing) === i * 45 ? 'btn-primary' : ''}`}
                onClick={() => update({ bearing: i * 45 })}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={359}
              placeholder="Grad, z. B. 215"
              value={draft.bearing ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : ((Number(e.target.value) % 360) + 360) % 360
                update({ bearing: v })
              }}
            />
            <button className="btn" onClick={() => update({ bearing: null })}>
              Keine
            </button>
          </div>
        </div>
      )}

      {info.isStand && draft.bearing != null && (
        <Field label={`Breite des Schussfelds: ${draft.fieldWidth ?? 60}°`}>
          <input
            type="range"
            className="h-10 w-full accent-[#d4a72c]"
            min={20}
            max={180}
            step={10}
            value={draft.fieldWidth ?? 60}
            onChange={(e) => update({ fieldWidth: Number(e.target.value) })}
          />
        </Field>
      )}

      <Field label="Notizen">
        <textarea
          className="input min-h-28 py-3"
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="z. B. Zugang, Besonderheiten, Wind…"
        />
      </Field>

      <div className="mb-4">
        <span className="label">Fotos</span>
        <div className="grid grid-cols-3 gap-2">
          {draft.photoIds.map((pid) => (
            <PhotoThumb key={pid} id={pid} onDelete={() => removePhoto(pid)} />
          ))}
          <label className="btn aspect-square !min-h-0 flex-col !gap-1 !text-sm">
            <Camera />
            Foto
            <input type="file" accept="image/*" className="hidden" onChange={(e) => addPhoto(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-1 gap-2">
        {draft.geometry.type === 'Point' ? (
          <button className="btn" onClick={() => onMove(draft)}>
            <Move /> Position verschieben
          </button>
        ) : (
          <button className="btn" onClick={() => onRedraw(draft)}>
            <PenLine /> Neu zeichnen
          </button>
        )}
      </div>
    </Sheet>
  )
}

export function usePhotoUrl(id: string | undefined) {
  const photo = useLiveQuery(() => (id ? db.photos.get(id) : undefined), [id])
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!photo) return
    const u = URL.createObjectURL(photo.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])
  return url
}

export function PhotoThumb({ id, onDelete }: { id: string; onDelete: () => void }) {
  const url = usePhotoUrl(id)
  const [big, setBig] = useState(false)
  return (
    <>
      <button className="relative aspect-square overflow-hidden rounded-xl border border-line bg-bg" onClick={() => setBig(true)}>
        {url && <img src={url} alt="" className="size-full object-cover" />}
      </button>
      {big && url && (
        <div className="fixed inset-0 z-[4000] flex flex-col bg-black/95 p-3 pt-safe pb-safe">
          <img src={url} alt="" className="min-h-0 flex-1 object-contain" />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-danger" onClick={() => (setBig(false), onDelete())}>
              <Trash2 />
            </button>
            <button className="btn btn-primary flex-1" onClick={() => setBig(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </>
  )
}
