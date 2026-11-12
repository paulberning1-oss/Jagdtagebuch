// Eine Sichtung (Anblick) erfassen oder bearbeiten – Vollbild, große Bedienelemente.
import { MapPin, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Chip, ChipGroup, Section, Stepper } from '../components/ui'
import { SIGHTING_SOURCES, type Sighting } from '../domain/hunt'
import { BEHAVIORS } from '../domain/species'
import { COMPASS_8, distance, type LatLng } from '../lib/geo'
import { fromBerlinLocal, toBerlinLocal } from '../lib/time'
import { MapPicker } from '../map/MapPicker'
import { PhotoThumb } from '../map/FacilityEditor'
import { useSpecies } from './hooks'
import { deleteSighting, saveSighting } from './huntActions'

export function SightingEditor({
  initial,
  isNew,
  standPos,
  onClose,
}: {
  initial: Sighting
  isNew: boolean
  /** Position des Sitzes – für "am Sitz" */
  standPos: LatLng | null
  /** saved = true, wenn gespeichert wurde */
  onClose: (saved: boolean) => void
}) {
  const species = useSpecies()
  const [s, setS] = useState<Sighting>(initial)
  const [picking, setPicking] = useState(false)
  const sp = species.find((x) => x.id === s.speciesId)
  const set = (patch: Partial<Sighting>) => setS((v) => ({ ...v, ...patch }))
  const atStand = standPos != null && distance(standPos, { lat: s.lat, lng: s.lng }) < 5

  const save = async () => {
    await saveSighting(s)
    onClose(true)
  }
  const remove = async () => {
    if (!confirm('Diese Sichtung löschen?')) return
    await deleteSighting(s.id)
    onClose(false)
  }

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-bg">
      <div className="pt-safe flex items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <h2 className="flex-1 text-xl font-bold">{isNew ? 'Anblick erfassen' : 'Sichtung bearbeiten'}</h2>
        <button className="btn-round !size-12" onClick={() => onClose(false)} aria-label="Abbrechen">
          <X />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {s.photoIds.length > 0 && (
          <Section title={`Fotos (${s.photoIds.length})`}>
            <div className="grid grid-cols-3 gap-2">
              {s.photoIds.map((pid) => (
                <PhotoThumb key={pid} id={pid} onDelete={() => set({ photoIds: s.photoIds.filter((x) => x !== pid) })} />
              ))}
            </div>
          </Section>
        )}
        {!s.huntId && s.env && <EnvSummary s={s} />}
        <Section title="Wildart">
          <div className="flex flex-wrap gap-2">
            {species.map((x) => (
              <Chip key={x.id} active={s.speciesId === x.id} onClick={() => set({ speciesId: x.id, sexAge: [] })}>
                {x.name}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Anzahl">
          <Stepper value={s.count} onChange={(count) => set({ count })} />
        </Section>

        {sp && sp.sexAge.length > 0 && (
          <Section title="Geschlecht / Alter (mehrere möglich)">
            <ChipGroup
              multi
              options={[...sp.sexAge, 'unbekannt'].map((x) => ({ id: x, label: x }))}
              value={s.sexAge}
              onChange={(sexAge) => set({ sexAge })}
            />
          </Section>
        )}

        <Section title="Verhalten">
          <ChipGroup
            options={BEHAVIORS.map((b) => ({ id: b as string, label: b }))}
            value={s.behavior ? [s.behavior] : []}
            onChange={(v) => set({ behavior: v[0] ?? '' })}
          />
        </Section>

        <Section title="Zugrichtung (wohin zieht das Wild?)">
          <div className="grid grid-cols-4 gap-2">
            {COMPASS_8.map((c, i) => (
              <button
                key={c}
                className={`btn !px-0 ${s.direction === i * 45 ? 'btn-primary' : ''}`}
                onClick={() => set({ direction: s.direction === i * 45 ? null : i * 45 })}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Uhrzeit">
          <input
            className="input"
            type="datetime-local"
            value={toBerlinLocal(new Date(s.time))}
            onChange={(e) => e.target.value && set({ time: fromBerlinLocal(e.target.value).getTime() })}
          />
        </Section>

        <Section title="Ort">
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`btn ${atStand ? 'btn-primary' : ''}`}
              disabled={!standPos}
              onClick={() => standPos && set({ lat: standPos.lat, lng: standPos.lng })}
            >
              Am Sitz
            </button>
            <button className={`btn ${!atStand ? 'btn-primary' : ''}`} onClick={() => setPicking(true)}>
              <MapPin /> Auf Karte
            </button>
          </div>
          {!atStand && standPos && (
            <p className="mt-2 text-ink-dim">ca. {Math.round(distance(standPos, { lat: s.lat, lng: s.lng }))} m vom Sitz entfernt</p>
          )}
        </Section>

        <Section title="Quelle">
          <ChipGroup options={SIGHTING_SOURCES} value={[s.source]} onChange={(v) => v[0] && set({ source: v[0] })} />
        </Section>

        <Section title="Notiz">
          <textarea className="input min-h-20 py-3" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Section>
      </div>

      <div className="pb-safe flex gap-2 border-t border-line bg-panel px-4 py-3">
        {!isNew && (
          <button className="btn btn-danger" onClick={remove} aria-label="Löschen">
            <Trash2 />
          </button>
        )}
        <button className="btn btn-primary flex-1" onClick={save}>
          Speichern
        </button>
      </div>

      {picking && (
        <MapPicker
          title="Wo stand das Wild?"
          initial={{ lat: s.lat, lng: s.lng }}
          onCancel={() => setPicking(false)}
          onPick={(p) => {
            set({ lat: p.lat, lng: p.lng })
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

/** Kurzinfo zu Wetter/Mond einer Sichtung außerhalb eines Ansitzes */
function EnvSummary({ s }: { s: Sighting }) {
  const w = s.env?.weather
  const m = s.env?.moon
  const parts: string[] = []
  if (w?.windCompass) parts.push(`Wind ${w.windCompass} ${Math.round(w.windSpeed ?? 0)} km/h`)
  if (w?.temperature != null) parts.push(`${Math.round(w.temperature)} °C`)
  if (w?.pressureTrend) parts.push(`Luftdruck ${w.pressureTrend}`)
  if (m) parts.push(`${m.phaseName} (${m.illumination} %)`)
  if (s.env?.sun) parts.push(s.env.sun.period)
  return (
    <p className="mb-4 rounded-xl border border-line bg-panel p-3 text-sm text-ink-dim">
      {parts.join(' · ')}
      {s.weatherStatus && s.weatherStatus !== 'ok' && ' · Wetter wird nachgeladen'}
    </p>
  )
}
