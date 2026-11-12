// Panels zum Starten eines Ansitzes und zum Nachtragen eines vergangenen Ansitzes.
import { useLiveQuery } from 'dexie-react-hooks'
import { LocateFixed, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Field, Sheet, useToast } from '../components/ui'
import { db, type Facility } from '../db/db'
import { typeInfo } from '../domain/facilityTypes'
import { distance, fromPos, type LatLng } from '../lib/geo'
import { navigate } from '../lib/router'
import { fromBerlinLocal, toBerlinDate } from '../lib/time'
import { MapPicker } from '../map/MapPicker'
import { createPastHunt, startHunt } from './huntActions'

function useStands() {
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  return useMemo(() => facilities.filter((f) => typeInfo(f.type).isStand && f.geometry.type === 'Point'), [facilities])
}

const posOf = (f: Facility) => fromPos((f.geometry as { coordinates: number[] }).coordinates)

/** Eigenen Standort leise ermitteln (nur über https) */
function useMyPosition(): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null)
  useEffect(() => {
    if (!window.isSecureContext || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }, [])
  return pos
}

export function StartHuntSheet({ onClose }: { onClose: () => void }) {
  const stands = useStands()
  const me = useMyPosition()
  const toast = useToast()
  const [picking, setPicking] = useState(false)

  const sorted = useMemo(() => {
    const list = stands.map((f) => ({ f, d: me ? distance(me, posOf(f)) : null }))
    return list.sort((a, b) => (a.d != null && b.d != null ? a.d - b.d : a.f.name.localeCompare(b.f.name, 'de')))
  }, [stands, me])

  const start = async (where: { stand?: Facility; pos?: LatLng }) => {
    try {
      await startHunt(where)
      toast('Ansitz gestartet – Waidmannsheil!', 'success')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <>
      <Sheet title="Ansitz starten" onClose={onClose}>
        <p className="mb-3 text-ink-dim">{me ? 'Sitze nach Entfernung sortiert:' : 'Welcher Sitz?'}</p>
        <div className="mb-4 grid gap-2">
          {sorted.map(({ f, d }) => (
            <button key={f.id} className="btn !justify-start text-left" onClick={() => start({ stand: f })}>
              <span className="flex-1 truncate">{f.name || typeInfo(f.type).label}</span>
              {d != null && <span className="text-sm font-normal text-ink-dim">{d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}</span>}
            </button>
          ))}
          {!sorted.length && <p className="text-ink-dim">Noch keine Sitze auf der Karte angelegt.</p>}
        </div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-dim">Ohne festen Sitz (z. B. Pirsch)</h3>
        <div className="grid gap-2">
          <button className="btn" disabled={!me} onClick={() => me && start({ pos: me })}>
            <LocateFixed /> {me ? 'An meinem Standort' : 'Standort nicht verfügbar'}
          </button>
          <button className="btn" onClick={() => setPicking(true)}>
            <MapPin /> Ort auf der Karte wählen
          </button>
        </div>
      </Sheet>
      {picking && (
        <MapPicker
          title="Wo jagst du?"
          initial={me}
          onCancel={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false)
            start({ pos: p })
          }}
        />
      )}
    </>
  )
}

export function PastHuntSheet({ onClose }: { onClose: () => void }) {
  const stands = useStands()
  const toast = useToast()
  const yesterday = toBerlinDate(new Date(Date.now() - 86400000))
  const [standId, setStandId] = useState<string>('')
  const [pos, setPos] = useState<LatLng | null>(null)
  const [date, setDate] = useState(yesterday)
  const [from, setFrom] = useState('17:00')
  const [to, setTo] = useState('19:00')
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (!standId && stands.length) setStandId(stands[0].id)
  }, [stands, standId])

  const submit = async () => {
    const stand = stands.find((s) => s.id === standId)
    if (!stand && !pos) return toast('Bitte Sitz oder Ort wählen', 'error')
    const start = fromBerlinLocal(`${date}T${from}`).getTime()
    let end = fromBerlinLocal(`${date}T${to}`).getTime()
    if (end <= start) end += 86400000 // über Mitternacht
    try {
      const id = await createPastHunt(stand, stand ? undefined : pos!, start, end)
      onClose()
      navigate('tagebuch', id, 'bearbeiten')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <>
      <Sheet
        title="Ansitz nachtragen"
        onClose={onClose}
        footer={
          <button className="btn btn-primary flex-1" onClick={submit}>
            Weiter
          </button>
        }
      >
        <Field label="Sitz">
          <select
            className="input"
            value={standId}
            onChange={(e) => {
              if (e.target.value === '__karte') setPicking(true)
              else setStandId(e.target.value)
            }}
          >
            {stands.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || typeInfo(s.type).label}
              </option>
            ))}
            {pos && !standId && <option value="">Gewählter Ort auf der Karte</option>}
            <option value="__karte">Ohne Sitz – Ort auf Karte wählen…</option>
          </select>
        </Field>
        <Field label="Datum">
          <input className="input" type="date" max={toBerlinDate(new Date())} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Von">
            <input className="input" type="time" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label="Bis">
            <input className="input" type="time" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-ink-dim">Wetter, Sonne und Mond für diesen Tag werden automatisch ergänzt (historische Wetterdaten).</p>
      </Sheet>
      {picking && (
        <MapPicker
          title="Wo hast du gejagt?"
          initial={pos}
          onCancel={() => setPicking(false)}
          onPick={(p) => {
            setPos(p)
            setStandId('')
            setPicking(false)
          }}
        />
      )}
    </>
  )
}
