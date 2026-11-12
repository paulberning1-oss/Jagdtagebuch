import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, ChevronRight, CloudOff, Moon, Play, Square, Telescope, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Stars, useToast } from '../components/ui'
import { db } from '../db/db'
import type { Hunt, Sighting } from '../domain/hunt'
import { fmtDuration, useNow, useRunningHunt } from '../journal/hooks'
import { HuntDetail } from '../journal/HuntDetail'
import { HuntForm } from '../journal/HuntForm'
import { deleteHunt, endHunt, newSighting } from '../journal/huntActions'
import { SightingEditor } from '../journal/SightingEditor'
import { PastHuntSheet, StartHuntSheet } from '../journal/StartHuntSheet'
import { navigate } from '../lib/router'
import { fmtDate, fmtTime } from '../lib/time'

export default function JournalPage({ parts }: { parts: string[] }) {
  if (parts[0] && parts[1] === 'bearbeiten') return <HuntForm key={parts[0]} id={parts[0]} />
  if (parts[0]) return <HuntDetail key={parts[0]} id={parts[0]} />
  return <JournalHome />
}

function JournalHome() {
  const running = useRunningHunt()
  const hunts = useLiveQuery(() => db.hunts.orderBy('start').reverse().filter((h) => h.status === 'done').toArray(), [])
  const sightings = useLiveQuery(() => db.sightings.toArray(), []) ?? []
  const [sheet, setSheet] = useState<'start' | 'past' | null>(null)

  const countByHunt = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sightings) if (s.huntId) m.set(s.huntId, (m.get(s.huntId) ?? 0) + s.count)
    return m
  }, [sightings])

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto p-4 pt-safe">
        <h1 className="mb-4 text-2xl font-bold">Ansitz-Tagebuch</h1>

        {running ? (
          <RunningCard hunt={running} count={countByHunt.get(running.id) ?? 0} />
        ) : (
          running === undefined && (
            <div className="mb-6 grid gap-2">
              <button className="btn btn-primary !min-h-20 text-xl" onClick={() => setSheet('start')}>
                <Play /> Ansitz starten
              </button>
              <button className="btn" onClick={() => setSheet('past')}>
                <CalendarPlus /> Vergangenen Ansitz nachtragen
              </button>
            </div>
          )
        )}

        {hunts && hunts.length > 0 && (
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-dim">Bisherige Ansitze ({hunts.length})</h2>
        )}
        <div className="grid gap-2 pb-4">
          {hunts?.map((h) => <HuntRow key={h.id} h={h} count={countByHunt.get(h.id) ?? 0} />)}
          {hunts && !hunts.length && !running && (
            <p className="text-ink-dim">Noch keine Einträge. Starte deinen ersten Ansitz oder trage einen vergangenen nach.</p>
          )}
        </div>
      </div>
      {sheet === 'start' && <StartHuntSheet onClose={() => setSheet(null)} />}
      {sheet === 'past' && <PastHuntSheet onClose={() => setSheet(null)} />}
    </div>
  )
}

function RunningCard({ hunt, count }: { hunt: Hunt; count: number }) {
  const now = useNow(15000)
  const toast = useToast()
  const [sighting, setSighting] = useState<Sighting | null>(null)
  const pos = { lat: hunt.lat, lng: hunt.lng }

  return (
    <div className="mb-6 rounded-2xl border-2 border-accent bg-panel p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Ansitz läuft</p>
      <p className="text-2xl font-bold">{hunt.standName}</p>
      <p className="mb-4 text-ink-dim">
        seit {fmtTime(new Date(hunt.start))} Uhr · {fmtDuration(now - hunt.start)} · Anblick: {count}
      </p>
      <div className="grid gap-2">
        <button className="btn !min-h-16" onClick={() => setSighting(newSighting(hunt, pos, hunt.targetSpecies[0] ?? 'rehwild'))}>
          <Telescope /> Anblick erfassen
        </button>
        <button
          className="btn btn-primary !min-h-20 text-xl"
          onClick={async () => {
            await endHunt(hunt.id)
            navigate('tagebuch', hunt.id, 'bearbeiten')
          }}
        >
          <Square /> Ansitz beenden
        </button>
        <button
          className="mt-1 text-sm text-ink-dim underline"
          onClick={async () => {
            if (!confirm('Laufenden Ansitz verwerfen (wird nicht gespeichert)?')) return
            await deleteHunt(hunt.id)
            toast('Ansitz verworfen')
          }}
        >
          Versehentlich gestartet? Verwerfen
        </button>
      </div>
      {sighting && <SightingEditor initial={sighting} isNew standPos={pos} onClose={() => setSighting(null)} />}
    </div>
  )
}

function HuntRow({ h, count }: { h: Hunt; count: number }) {
  const w = h.env?.weather
  const moon = h.env?.moon
  return (
    <button className="card flex items-center gap-3 text-left active:scale-[0.99]" onClick={() => navigate('tagebuch', h.id)}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold">
          {h.standName}
          {h.success && <Target className="ml-2 inline size-5 text-good" aria-label="Erfolg" />}
        </p>
        <p className="text-ink-dim">
          {fmtDate(new Date(h.start))}, {fmtTime(new Date(h.start))}
          {h.end ? `–${fmtTime(new Date(h.end))}` : ''}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-dim">
          <span>Anblick: {count}</span>
          {w && w.windCompass && (
            <span>
              Wind {w.windCompass} {Math.round(w.windSpeed ?? 0)} km/h
            </span>
          )}
          {w && w.temperature != null && <span>{Math.round(w.temperature)} °C</span>}
          {moon && (
            <span className="inline-flex items-center gap-1">
              <Moon className="size-4" /> {moon.illumination} %
            </span>
          )}
          {h.weatherStatus !== 'ok' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-hint/60 px-2 text-hint">
              <CloudOff className="size-4" /> Wetter ausstehend
            </span>
          )}
        </p>
        {h.rating != null && (
          <div className="mt-1">
            <Stars value={h.rating} size="sm" />
          </div>
        )}
      </div>
      <ChevronRight className="shrink-0 text-ink-dim" />
    </button>
  )
}
