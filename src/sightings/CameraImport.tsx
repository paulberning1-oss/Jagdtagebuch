// Wildkamera-Import: mehrere Bilder, Aufnahmezeit aus EXIF, Kamera zuordnen,
// Wildart taggen. Wetter/Mond werden automatisch ergänzt.
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Chip, Section, Stepper, useToast } from '../components/ui'
import { db } from '../db/db'
import type { Sighting } from '../domain/hunt'
import { fromPos } from '../lib/geo'
import { readCaptureTime } from '../lib/exifTime'
import { newId } from '../lib/id'
import { savePhoto } from '../lib/image'
import { fmtDateTime, fromBerlinLocal, toBerlinLocal } from '../lib/time'
import { useSpecies } from '../journal/hooks'
import { saveSightings } from '../journal/huntActions'

interface Item {
  key: string
  file: File
  url: string
  time: Date | null
  /** Zeit stammt aus EXIF? */
  exif: boolean
  speciesId: string | null
  count: number
  skip: boolean
}

/** Bilder einer Serie (gleiche Wildart, ≤ 2 min Abstand) zu einer Sichtung zusammenfassen */
export function groupBursts<T extends { time: Date; speciesId: string; count: number }>(items: T[], gapMs = 120000): T[][] {
  const sorted = [...items].sort((a, b) => a.time.getTime() - b.time.getTime())
  const groups: T[][] = []
  for (const it of sorted) {
    const g = groups[groups.length - 1]
    const last = g?.[g.length - 1]
    if (last && last.speciesId === it.speciesId && it.time.getTime() - last.time.getTime() <= gapMs) g.push(it)
    else groups.push([it])
  }
  return groups
}

export function CameraImport({ onClose }: { onClose: () => void }) {
  const cameras = useLiveQuery(() => db.facilities.where('type').equals('wildkamera').toArray(), []) ?? []
  const species = useSpecies()
  const toast = useToast()
  const [cameraId, setCameraId] = useState<string>('')
  const [items, setItems] = useState<Item[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [merge, setMerge] = useState(true)

  useEffect(() => {
    if (!cameraId && cameras.length) setCameraId(cameras[0].id)
  }, [cameras, cameraId])

  // Vorschau-URLs freigeben
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setReading(true)
    const next: Item[] = []
    for (const file of Array.from(files)) {
      const time = await readCaptureTime(file)
      next.push({ key: newId(), file, url: URL.createObjectURL(file), time, exif: !!time, speciesId: null, count: 1, skip: false })
    }
    next.sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0))
    setItems((v) => [...v, ...next])
    setReading(false)
  }

  const set = (key: string, patch: Partial<Item>) => setItems((v) => v.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const setAllSpecies = (speciesId: string) => setItems((v) => v.map((i) => (i.skip ? i : { ...i, speciesId })))

  const ready = items.filter((i) => !i.skip && i.speciesId && i.time)
  const missingTime = items.filter((i) => !i.skip && !i.time).length
  const untagged = items.filter((i) => !i.skip && !i.speciesId).length
  const camera = cameras.find((c) => c.id === cameraId)

  const groups = useMemo(() => {
    const valid = ready.map((i) => ({ ...i, time: i.time!, speciesId: i.speciesId! }))
    return merge ? groupBursts(valid) : valid.map((i) => [i])
  }, [ready, merge])

  const save = async () => {
    if (!camera || camera.geometry.type !== 'Point') return toast('Bitte eine Wildkamera wählen', 'error')
    if (!groups.length) return
    if (untagged && !confirm(`${untagged} Bild(er) ohne Wildart werden nicht übernommen. Fortfahren?`)) return
    setSaving(true)
    try {
      const pos = fromPos(camera.geometry.coordinates)
      const sightings: Sighting[] = []
      for (const g of groups) {
        const photoIds: string[] = []
        for (const it of g) photoIds.push(await savePhoto(it.file, !!camera.demo))
        sightings.push({
          id: newId(),
          huntId: null,
          time: g[0].time.getTime(),
          speciesId: g[0].speciesId,
          // Bei einer Serie: höchste Anzahl auf einem Bild (nicht addieren – es sind dieselben Tiere)
          count: Math.max(...g.map((x) => x.count)),
          sexAge: [],
          behavior: '',
          direction: null,
          lat: pos.lat,
          lng: pos.lng,
          source: 'wildkamera',
          cameraId: camera.id,
          notes: g.length > 1 ? `Serie aus ${g.length} Bildern` : '',
          photoIds,
          demo: camera.demo,
          createdAt: Date.now(),
        })
      }
      await saveSightings(sightings)
      toast(`${sightings.length} Sichtung(en) von „${camera.name}“ gespeichert`, 'success')
      onClose()
    } catch (e) {
      toast(`Fehler beim Speichern: ${(e as Error).message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-bg">
      <div className="pt-safe flex items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <h2 className="flex-1 text-xl font-bold">Wildkamera-Import</h2>
        <button className="btn-round !size-12" onClick={onClose} aria-label="Abbrechen">
          <X />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Section title="1. Kamera">
          {cameras.length ? (
            <select className="input" value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Wildkamera'}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-hint">Lege zuerst auf der Karte eine Wildkamera an (Hinzufügen → Wildkamera).</p>
          )}
        </Section>

        <Section title="2. Bilder">
          <label className="btn w-full">
            {reading ? <Loader2 className="animate-spin" /> : <ImagePlus />} Bilder auswählen
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
          </label>
          <p className="mt-1 text-sm text-ink-dim">Die Aufnahmezeit wird aus den Bilddaten (EXIF) gelesen – sonst bitte von Hand eintragen.</p>
        </Section>

        {items.length > 0 && (
          <Section title="3. Wildart zuordnen">
            <p className="mb-2 text-sm text-ink-dim">Für alle Bilder auf einmal:</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {species.map((s) => (
                <Chip key={s.id} active={false} onClick={() => setAllSpecies(s.id)}>
                  {s.name}
                </Chip>
              ))}
            </div>
            {(missingTime > 0 || untagged > 0) && (
              <p className="mb-3 flex items-center gap-2 text-hint">
                <AlertTriangle className="shrink-0" />
                {missingTime > 0 && `${missingTime} ohne Zeit. `}
                {untagged > 0 && `${untagged} ohne Wildart.`}
              </p>
            )}
            <div className="grid gap-3">
              {items.map((it) => (
                <div key={it.key} className={`card min-w-0 overflow-hidden !p-3 ${it.skip ? 'opacity-40' : ''}`}>
                  <img src={it.url} alt="" className="mb-2 max-h-56 w-full rounded-xl object-contain" />
                  <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <input
                      className="input !min-h-12 min-w-0"
                      type="datetime-local"
                      value={it.time ? toBerlinLocal(it.time) : ''}
                      onChange={(e) => e.target.value && set(it.key, { time: fromBerlinLocal(e.target.value), exif: false })}
                    />
                    <button className={`btn !min-h-12 shrink-0 !px-3 !text-sm ${it.skip ? 'btn-primary' : ''}`} onClick={() => set(it.key, { skip: !it.skip })}>
                      {it.skip ? 'Übersprungen' : 'Kein Wild'}
                    </button>
                  </div>
                  {!it.time && <p className="mb-2 text-sm text-hint">Keine Zeit im Bild gefunden – bitte eintragen.</p>}
                  {!it.skip && (
                    <>
                      <div className="mb-2 flex flex-wrap gap-2">
                        {species.map((s) => (
                          <Chip key={s.id} active={it.speciesId === s.id} onClick={() => set(it.key, { speciesId: s.id })}>
                            {s.name}
                          </Chip>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-ink-dim">Anzahl</span>
                        <Stepper value={it.count} onChange={(count) => set(it.key, { count })} />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {items.length > 1 && (
          <label className="mb-6 flex items-center gap-3">
            <input type="checkbox" className="size-6 accent-[#d4a72c]" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            <span>Bildserien zusammenfassen (gleiche Wildart, max. 2 Minuten Abstand)</span>
          </label>
        )}
      </div>

      <div className="pb-safe border-t border-line bg-panel px-4 py-3">
        {groups.length > 0 && (
          <p className="mb-2 text-sm text-ink-dim">
            {ready.length} Bild(er) → {groups.length} Sichtung(en)
            {groups[0] && ` · ab ${fmtDateTime(groups[0][0].time)}`}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={!groups.length || saving || !camera} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : <Camera />} {groups.length || ''} Sichtung(en) speichern
        </button>
      </div>
    </div>
  )
}
