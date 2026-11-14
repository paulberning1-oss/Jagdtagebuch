// Wind über dem ganzen Revier: Richtung als rotes Kürzel + Pfeile auf der Karte, darunter alle Sitze geprüft.
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../components/ui'
import { db } from '../db/db'
import { revierBounds, type Bounds } from '../db/ownData'
import { useSetting } from '../db/settings'
import { centerOf, checkAllStands, upwindLabelPos, windArrowGrid, windLetter } from '../domain/revierWind'
import { COMPASS_8, compass16, destination, fromPos, type LatLng } from '../lib/geo'
import { eveningStart, morningStart } from '../lib/sun'
import { fmtDateTime, fromBerlinLocal, toBerlinLocal } from '../lib/time'
import { fetchWindAt, type WindAt } from '../services/openMeteo'

export interface RevierWindOverlay {
  windFrom: number
  arrows: LatLng[]
  labelPos: LatLng
  letter: string
}

/** Ausschnitt so erweitern, dass das Richtungs-Kürzel in jeder Windrichtung sichtbar bleibt */
function withLabelMargin(b: Bounds): Bounds {
  const pts = [0, 90, 180, 270].map((d) => destination(upwindLabelPos(b, d), d, 120))
  return {
    south: Math.min(b.south, ...pts.map((p) => p.lat)),
    north: Math.max(b.north, ...pts.map((p) => p.lat)),
    west: Math.min(b.west, ...pts.map((p) => p.lng)),
    east: Math.max(b.east, ...pts.map((p) => p.lng)),
  }
}

type WindState ={ status: 'idle' } | { status: 'loading' } | { status: 'ok'; wind: WindAt } | { status: 'error'; message: string }

export function RevierWindPanel({
  onOverlay,
  onFitRevier,
  onPickStand,
  onClose,
}: {
  onOverlay: (o: RevierWindOverlay | null) => void
  /** Karte auf das ganze Revier ausrichten */
  onFitRevier: (b: Bounds) => void
  /** Einzelnen Sitz genauer prüfen (Witterungskegel, Anmarschwege) */
  onPickStand: (standId: string) => void
  onClose: () => void
}) {
  const facilities = useLiveQuery(() => db.facilities.toArray(), [])
  const boundaries = useLiveQuery(() => db.boundaries.toArray(), [])
  const scentLength = useSetting('scentLength') ?? 300
  const scentWidth = useSetting('scentWidth') ?? 40

  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [time, setTime] = useState(() => toBerlinLocal(new Date()))
  const [wind, setWind] = useState<WindState>({ status: 'idle' })
  const [manual, setManual] = useState<number | null>(null)
  const [reload, setReload] = useState(0)

  // Revier-Umriss bestimmen und einmal ganz ins Bild holen
  useEffect(() => {
    if (!facilities || !boundaries) return
    revierBounds().then((r) => {
      if (!r) return
      setBounds((old) => {
        if (!old) onFitRevier(withLabelMargin(r.bounds))
        return r.bounds
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, boundaries])

  const center = bounds ? centerOf(bounds) : null

  // Wind für die Reviermitte laden
  useEffect(() => {
    if (!center) return
    let cancelled = false
    setWind({ status: 'loading' })
    const t = setTimeout(() => {
      fetchWindAt(center.lat, center.lng, fromBerlinLocal(time))
        .then((w) => !cancelled && setWind({ status: 'ok', wind: w }))
        .catch((e) => !cancelled && setWind({ status: 'error', message: (e as Error).message }))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng, time, reload])

  const windFrom = manual ?? (wind.status === 'ok' ? wind.wind.direction : null)

  // Pfeile nur innerhalb der eigenen Grenze (sonst aller Grenzen bzw. des Umrisses)
  const rings = useMemo(() => {
    const list = boundaries ?? []
    const own = list.filter((b) => !b.demo)
    return (own.length ? own : list).flatMap((b) =>
      (b.geometry.type === 'Polygon' ? [b.geometry.coordinates] : b.geometry.coordinates).map((poly) => poly[0].map(fromPos)),
    )
  }, [boundaries])

  useEffect(() => {
    if (!bounds || windFrom == null) {
      onOverlay(null)
      return
    }
    let arrows = windArrowGrid(bounds, rings)
    if (arrows.length < 6) arrows = windArrowGrid(bounds) // sehr kleine/ungewöhnliche Grenze: ganzes Rechteck
    onOverlay({ windFrom, arrows, labelPos: upwindLabelPos(bounds, windFrom), letter: windLetter(windFrom) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, windFrom, rings])
  useEffect(() => () => onOverlay(null), [onOverlay])

  const rows = useMemo(
    () => (facilities && windFrom != null ? checkAllStands(facilities, windFrom, { length: scentLength, width: scentWidth }) : []),
    [facilities, windFrom, scentLength, scentWidth],
  )

  const preset = (d: Date) => {
    setManual(null)
    setTime(toBerlinLocal(d))
  }

  if (facilities && boundaries && !bounds && !facilities.length && !boundaries.length) {
    return (
      <Sheet title="Wind im Revier" onClose={onClose}>
        <p className="text-ink-dim">Zeichne zuerst deine Reviergrenze oder Sitze ein.</p>
      </Sheet>
    )
  }

  return (
    <Sheet title="Wind im Revier" onClose={onClose}>
      <div className="card mb-3">
        {manual != null ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-lg font-semibold">
              Wind aus {compass16(manual)} ({Math.round(manual)}°) <span className="text-sm font-normal text-ink-dim">– selbst eingestellt</span>
            </p>
            <button className="btn !min-h-12 !px-3 !text-base" onClick={() => setManual(null)}>
              Wetterdaten
            </button>
          </div>
        ) : wind.status === 'ok' ? (
          <div>
            <p className="text-lg font-semibold">
              Wind aus <span className="text-warn">{compass16(wind.wind.direction)}</span> ({Math.round(wind.wind.direction)}°) · {Math.round(wind.wind.speed)} km/h
              {wind.wind.gusts != null && <span className="text-ink-dim"> · Böen {Math.round(wind.wind.gusts)} km/h</span>}
            </p>
            <p className="text-sm text-ink-dim">{fmtDateTime(fromBerlinLocal(wind.wind.time))} Uhr · Reviermitte · Quelle: Open-Meteo</p>
          </div>
        ) : wind.status === 'error' ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-hint">{wind.message} Stell den Wind unten selbst ein.</p>
            <button className="btn-round" onClick={() => setReload((r) => r + 1)} aria-label="Erneut laden">
              <RefreshCw />
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-ink-dim">
            <Loader2 className="animate-spin" /> Lade Wind…
          </p>
        )}
        {windFrom != null && (
          <p className="mt-1 text-sm text-ink-dim">
            Rotes „{windLetter(windFrom)}“ auf der Karte = woher der Wind kommt, Pfeile = wohin er weht.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mb-4">
          <span className="label">Alle Sitze bei diesem Wind (geeignete zuerst)</span>
          <div className="grid gap-2">
            {rows.map((r) => (
              <button
                key={r.stand.id}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left ${
                  r.status === 'warn' ? 'border-warn/60 bg-[#3a1a12]' : r.status === 'hint' ? 'border-hint/60 bg-[#33290f]' : 'border-good/60 bg-[#14301a]'
                }`}
                onClick={() => onPickStand(r.stand.id)}
              >
                {r.status === 'ok' ? (
                  <CheckCircle2 className="shrink-0 text-good" />
                ) : (
                  <AlertTriangle className={`shrink-0 ${r.status === 'warn' ? 'text-warn' : 'text-hint'}`} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {r.stand.name || 'Sitz'}
                    {r.stand.demo && <span className="ml-2 text-xs font-normal text-ink-dim">Beispiel</span>}
                  </span>
                  <span className="block text-sm text-ink-dim">{r.reason}</span>
                </span>
                <ChevronRight className="shrink-0 text-ink-dim" />
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-dim">Sitz antippen für den genauen Check mit Witterungskegel und Anmarschwegen.</p>
        </div>
      )}

      <label className="mb-2 block">
        <span className="label">Zeitpunkt</span>
        <input className="input" type="datetime-local" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
      </label>
      {center && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button className="btn !px-2 !text-base" onClick={() => preset(new Date())}>
            Jetzt
          </button>
          <button className="btn !px-2 !text-base" onClick={() => preset(eveningStart(center.lat, center.lng))}>
            Heute Abend
          </button>
          <button className="btn !px-2 !text-base" onClick={() => preset(morningStart(center.lat, center.lng))}>
            Morgen früh
          </button>
        </div>
      )}

      <span className="label">Wind selbst einstellen (woher er kommt)</span>
      <div className="mb-2 grid grid-cols-4 gap-2">
        {COMPASS_8.map((c, i) => (
          <button key={c} className={`btn !px-0 ${manual === i * 45 ? 'btn-primary' : ''}`} onClick={() => setManual(i * 45)}>
            {c}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
