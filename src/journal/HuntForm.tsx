// Abfrage-Formular nach dem Ansitz. Jede Änderung wird sofort lokal gespeichert.
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, MapPin, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Chip, ChipGroup, DecimalInput, Section, Stars, useToast } from '../components/ui'
import { db } from '../db/db'
import { typeInfo } from '../domain/facilityTypes'
import { DISTURBANCES, HUNT_TYPES, type Hunt, type Kill, type Sighting } from '../domain/hunt'
import { distance, fromPos } from '../lib/geo'
import { newId } from '../lib/id'
import { navigate } from '../lib/router'
import { fmtTime, fromBerlinLocal, toBerlinLocal } from '../lib/time'
import { MapPicker } from '../map/MapPicker'
import { useSpecies, useSpeciesMap } from './hooks'
import { changeHuntTimeOrPlace, newSighting } from './huntActions'
import { SightingEditor } from './SightingEditor'

export function HuntForm({ id }: { id: string }) {
  const stored = useLiveQuery(() => db.hunts.get(id), [id])
  const sightings = useLiveQuery(() => db.sightings.where('huntId').equals(id).sortBy('time'), [id]) ?? []
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  const species = useSpecies()
  const speciesMap = useSpeciesMap()
  const toast = useToast()
  const [h, setH] = useState<Hunt | null>(null)
  const [editSighting, setEditSighting] = useState<{ s: Sighting; isNew: boolean } | null>(null)
  const [pickKill, setPickKill] = useState<string | null>(null)

  useEffect(() => {
    if (stored && (!h || h.id !== stored.id)) setH(stored)
    // Sonne/Mond/Wetter ändern sich im Hintergrund – nur diese Felder übernehmen
    else if (stored && h && (stored.env !== h.env || stored.weatherStatus !== h.weatherStatus))
      setH((v) => (v ? { ...v, env: stored.env, weatherStatus: stored.weatherStatus } : v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored])

  const stands = useMemo(
    () => facilities.filter((f) => typeInfo(f.type).isStand).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [facilities],
  )

  if (stored === undefined && !h) return <p className="p-4 text-ink-dim">Lade…</p>
  if (!h) return <p className="p-4 text-ink-dim">Eintrag nicht gefunden.</p>

  const standPos = { lat: h.lat, lng: h.lng }

  const update = (patch: Partial<Hunt>) => {
    const next = { ...h, ...patch, updatedAt: Date.now() }
    setH(next)
    db.hunts.update(h.id, { ...patch, updatedAt: next.updatedAt })
  }

  const changeTime = (field: 'start' | 'end', value: string) => {
    if (!value) return
    const t = fromBerlinLocal(value).getTime()
    const start = field === 'start' ? t : h.start
    const end = field === 'end' ? t : h.end
    if (end != null && end <= start) return toast('Das Ende muss nach dem Beginn liegen', 'error')
    setH({ ...h, start, end })
    changeHuntTimeOrPlace(h.id, { start, end })
  }

  const changeStand = (standId: string) => {
    const f = stands.find((x) => x.id === standId)
    if (!f || f.geometry.type !== 'Point') return
    const p = fromPos(f.geometry.coordinates)
    const patch = { standId: f.id, standName: f.name, lat: p.lat, lng: p.lng }
    setH({ ...h, ...patch })
    changeHuntTimeOrPlace(h.id, patch)
  }

  const setKill = (kid: string, patch: Partial<Kill>) => update({ kills: h.kills.map((k) => (k.id === kid ? { ...k, ...patch } : k)) })

  const addKill = () => {
    const sp = h.targetSpecies[0] ?? sightings[0]?.speciesId ?? 'rehwild'
    const time = h.end ?? Date.now()
    update({
      success: true,
      kills: [...h.kills, { id: newId(), speciesId: sp, sexAge: '', time, lat: h.lat, lng: h.lng, weightKg: null }],
    })
  }

  const setSuccess = (success: boolean) => {
    if (success && !h.kills.length) addKill()
    else update({ success })
  }

  const defaultSpecies = h.targetSpecies[0] ?? 'rehwild'

  return (
    <div className="h-full overflow-y-auto">
      <div className="pt-safe sticky top-0 z-10 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold">{h.status === 'running' ? 'Ansitz läuft' : 'Wie war der Ansitz?'}</h1>
        <p className="text-ink-dim">
          {h.standName} · {fmtTime(new Date(h.start))}
          {h.end ? `–${fmtTime(new Date(h.end))}` : ''} Uhr
        </p>
      </div>

      <div className="px-4 py-4">
        <Section title="Zeit & Sitz">
          <div className="mb-2 grid grid-cols-1 gap-2">
            <label>
              <span className="label">Beginn</span>
              <input className="input" type="datetime-local" value={toBerlinLocal(new Date(h.start))} onChange={(e) => changeTime('start', e.target.value)} />
            </label>
            {h.end != null && (
              <label>
                <span className="label">Ende</span>
                <input className="input" type="datetime-local" value={toBerlinLocal(new Date(h.end))} onChange={(e) => changeTime('end', e.target.value)} />
              </label>
            )}
            <label>
              <span className="label">Sitz</span>
              <select className="input" value={h.standId ?? ''} onChange={(e) => changeStand(e.target.value)}>
                {!h.standId && <option value="">{h.standName}</option>}
                {stands.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || typeInfo(s.type).label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Section>

        <Section title="Jagdart">
          <ChipGroup options={HUNT_TYPES} value={[h.huntType]} onChange={(v) => v[0] && update({ huntType: v[0] })} />
        </Section>

        <Section title="Auf welche Wildart?">
          <ChipGroup
            multi
            options={species.map((s) => ({ id: s.id, label: s.name }))}
            value={h.targetSpecies}
            onChange={(targetSpecies) => update({ targetSpecies })}
          />
        </Section>

        <Section title={`Anblick (${sightings.reduce((a, s) => a + s.count, 0)} Stück)`}>
          <div className="mb-2 grid gap-2">
            {sightings.map((s) => (
              <button key={s.id} className="btn !justify-start text-left" onClick={() => setEditSighting({ s, isNew: false })}>
                <span className="flex-1">
                  <span className="block">
                    {s.count}× {speciesMap.get(s.speciesId)?.name ?? s.speciesId}
                    {s.sexAge.length ? ` · ${s.sexAge.join(', ')}` : ''}
                  </span>
                  <span className="block text-sm font-normal text-ink-dim">
                    {fmtTime(new Date(s.time))} Uhr{s.behavior ? ` · ${s.behavior}` : ''}
                    {distance(standPos, s) > 5 ? ` · ${Math.round(distance(standPos, s))} m entfernt` : ''}
                  </span>
                </span>
                <ChevronRight className="text-ink-dim" />
              </button>
            ))}
            {!sightings.length && <p className="text-ink-dim">Kein Anblick eingetragen.</p>}
          </div>
          <button className="btn w-full" onClick={() => setEditSighting({ s: newSighting(h, standPos, defaultSpecies), isNew: true })}>
            <Plus /> Anblick hinzufügen
          </button>
        </Section>

        <Section title="Erfolg?">
          <div className="mb-3 flex gap-2">
            <Chip active={!h.success} onClick={() => setSuccess(false)}>
              Nein
            </Chip>
            <Chip active={h.success} onClick={() => setSuccess(true)}>
              Ja, Beute gemacht
            </Chip>
          </div>
          {h.success && (
            <div className="grid gap-3">
              {h.kills.map((k, i) => {
                const sp = speciesMap.get(k.speciesId)
                const atStand = distance(standPos, k) < 5
                return (
                  <div key={k.id} className="card">
                    <div className="mb-3 flex items-center">
                      <p className="flex-1 font-bold">Stück {i + 1}</p>
                      <button
                        className="btn btn-danger !min-h-11 !px-3"
                        aria-label="Stück entfernen"
                        onClick={() => {
                          const kills = h.kills.filter((x) => x.id !== k.id)
                          update({ kills, success: kills.length > 0 })
                        }}
                      >
                        <Trash2 />
                      </button>
                    </div>
                    <label className="mb-3 block">
                      <span className="label">Wildart</span>
                      <select className="input" value={k.speciesId} onChange={(e) => setKill(k.id, { speciesId: e.target.value, sexAge: '' })}>
                        {species.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sp && sp.sexAge.length > 0 && (
                      <div className="mb-3">
                        <span className="label">Geschlecht / Alter</span>
                        <ChipGroup
                          options={sp.sexAge.map((x) => ({ id: x, label: x }))}
                          value={k.sexAge ? [k.sexAge] : []}
                          onChange={(v) => setKill(k.id, { sexAge: v[0] ?? '' })}
                        />
                      </div>
                    )}
                    <label className="mb-3 block">
                      <span className="label">Uhrzeit</span>
                      <input
                        className="input"
                        type="datetime-local"
                        value={toBerlinLocal(new Date(k.time))}
                        onChange={(e) => e.target.value && setKill(k.id, { time: fromBerlinLocal(e.target.value).getTime() })}
                      />
                    </label>
                    <div className="mb-3">
                      <span className="label">Ort</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button className={`btn ${atStand ? 'btn-primary' : ''}`} onClick={() => setKill(k.id, { lat: h.lat, lng: h.lng })}>
                          Am Sitz
                        </button>
                        <button className={`btn ${!atStand ? 'btn-primary' : ''}`} onClick={() => setPickKill(k.id)}>
                          <MapPin /> Auf Karte
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="label">Gewicht aufgebrochen (kg)</span>
                      <DecimalInput value={k.weightKg} onChange={(weightKg) => setKill(k.id, { weightKg })} />
                    </label>
                  </div>
                )
              })}
              <button className="btn" onClick={addKill}>
                <Plus /> Weiteres Stück
              </button>
            </div>
          )}
        </Section>

        <Section title="Störungen">
          <ChipGroup
            multi
            options={DISTURBANCES.map((d) => ({ id: d as string, label: d }))}
            value={h.disturbances}
            onChange={(disturbances) => update({ disturbances })}
          />
        </Section>

        <Section title="Besonderheiten">
          <textarea
            className="input min-h-28 py-3"
            value={h.notes}
            placeholder="z. B. Wild kam früher als sonst, Mais gehäckselt, Wind drehte…"
            onChange={(e) => update({ notes: e.target.value })}
          />
        </Section>

        <Section title="Deine Bewertung">
          <Stars value={h.rating} onChange={(rating) => update({ rating })} />
        </Section>

        <button className="btn btn-primary mb-8 w-full" onClick={() => navigate('tagebuch', h.id)}>
          Fertig
        </button>
      </div>

      {editSighting && (
        <SightingEditor initial={editSighting.s} isNew={editSighting.isNew} standPos={standPos} onClose={() => setEditSighting(null)} />
      )}
      {pickKill && (
        <MapPicker
          title="Wo lag das Stück?"
          initial={(() => {
            const k = h.kills.find((x) => x.id === pickKill)
            return k ? { lat: k.lat, lng: k.lng } : standPos
          })()}
          onCancel={() => setPickKill(null)}
          onPick={(p) => {
            setKill(pickKill, { lat: p.lat, lng: p.lng })
            setPickKill(null)
          }}
        />
      )}
    </div>
  )
}
