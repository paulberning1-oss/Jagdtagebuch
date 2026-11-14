import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, ChevronRight, CloudOff, Moon, Play, Square, Telescope, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { confirmTrash, SelectActions, SelectButton, SelectCheck, SelectToolbar, TRASH_HINT, useSelection } from '../components/Selection'
import { Stars, useToast } from '../components/ui'
import { db } from '../db/db'
import { trashHunts } from '../db/trash'
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
  const sel = useSelection()
  const toast = useToast()

  const countByHunt = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sightings) if (s.huntId) m.set(s.huntId, (m.get(s.huntId) ?? 0) + s.count)
    return m
  }, [sightings])

  const removeSelected = async () => {
    const ids = [...sel.sel].filter((id) => hunts?.some((h) => h.id === id))
    if (!ids.length || !confirmTrash(ids.length, 'Die Sichtungen dieser Ansitze werden mitgelöscht.')) return
    const n = await trashHunts(ids)
    toast(`${ids.length} Ansitz(e) gelöscht (mit Sichtungen ${n} Einträge) – ${TRASH_HINT}`, 'success')
    sel.stop()
  }

  return (
    <div className="relative h-full">
      <div className={`h-full overflow-y-auto p-4 pt-safe ${sel.selecting ? 'pb-24' : ''}`}>
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
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-ink-dim">
              {sel.selecting ? `${sel.sel.size} ausgewählt` : `Bisherige Ansitze (${hunts.length})`}
            </h2>
            {!sel.selecting && <SelectButton s={sel} />}
          </div>
        )}
        {sel.selecting && hunts && (
          <SelectToolbar s={sel} allKeys={hunts.map((h) => h.id)} demoKeys={hunts.filter((h) => h.demo).map((h) => h.id)} />
        )}
        <div className="grid gap-2 pb-4">
          {hunts?.map((h) => (
            <HuntRow
              key={h.id}
              h={h}
              count={countByHunt.get(h.id) ?? 0}
              selecting={sel.selecting}
              selected={sel.sel.has(h.id)}
              onToggle={() => sel.toggle(h.id)}
            />
          ))}
          {hunts && !hunts.length && !running && (
            <p className="text-ink-dim">Noch keine Einträge. Starte deinen ersten Ansitz oder trage einen vergangenen nach.</p>
          )}
        </div>
      </div>
      {sel.selecting && (
        <div className="absolute inset-x-0 bottom-0 z-[900] flex gap-2 border-t border-line bg-panel p-3">
          <SelectActions s={sel} onDelete={removeSelected} />
        </div>
      )}
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
            if (!confirm('Laufenden Ansitz verwerfen? (Landet in „Mehr → Zuletzt gelöscht“)')) return
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

function HuntRow({
  h,
  count,
  selecting = false,
  selected = false,
  onToggle,
}: {
  h: Hunt
  count: number
  selecting?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const w = h.env?.weather
  const moon = h.env?.moon
  return (
    <button
      className={`card flex items-center gap-3 text-left active:scale-[0.99] ${selected ? '!border-accent' : ''}`}
      onClick={() => (selecting ? onToggle?.() : navigate('tagebuch', h.id))}
      aria-pressed={selecting ? selected : undefined}
    >
      {selecting && <SelectCheck on={selected} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold">
          {h.standName}
          {h.demo && <span className="ml-2 text-xs font-normal text-ink-dim">Beispiel</span>}
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
      {!selecting && <ChevronRight className="shrink-0 text-ink-dim" />}
    </button>
  )
}
