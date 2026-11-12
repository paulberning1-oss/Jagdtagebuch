import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../components/ui'
import { db } from '../db/db'
import { useSetting } from '../db/settings'
import { typeInfo } from '../domain/facilityTypes'
import { analyzeScent, type ScentMessage } from '../domain/scent'
import { COMPASS_8, compass16, fromPos, type LatLng } from '../lib/geo'
import { eveningStart, morningStart } from '../lib/sun'
import { fmtDateTime, fromBerlinLocal, toBerlinLocal } from '../lib/time'
import { fetchWindAt, type WindAt } from '../services/openMeteo'

export interface ConeOverlay {
  /** Ändert sich der Schlüssel (anderer Sitz / andere Windrichtung), wird die Karte neu ausgerichtet */
  fitKey: string
  cone: LatLng[]
  stand: LatLng
  highlightIds: Set<string>
}

type WindState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; wind: WindAt }
  | { status: 'error'; message: string }

export function WindPanel({
  initialStandId,
  onOverlay,
  onFocusStand,
  onClose,
}: {
  initialStandId: string | null
  onOverlay: (o: ConeOverlay | null) => void
  onFocusStand: (p: LatLng) => void
  onClose: () => void
}) {
  const facilities = useLiveQuery(() => db.facilities.toArray(), []) ?? []
  const stands = useMemo(
    () => facilities.filter((f) => typeInfo(f.type).isStand).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [facilities],
  )
  const scentLength = useSetting('scentLength') ?? 300
  const scentWidth = useSetting('scentWidth') ?? 40

  const [standId, setStandId] = useState<string | null>(initialStandId)
  const [time, setTime] = useState(() => toBerlinLocal(new Date()))
  const [wind, setWind] = useState<WindState>({ status: 'idle' })
  const [manual, setManual] = useState<number | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => setStandId(initialStandId), [initialStandId])
  // Ohne Vorauswahl den ersten Sitz nehmen
  useEffect(() => {
    if (!standId && stands.length) setStandId(stands[0].id)
  }, [standId, stands])

  const stand = stands.find((s) => s.id === standId)
  const standPos = stand && stand.geometry.type === 'Point' ? fromPos(stand.geometry.coordinates) : null

  useEffect(() => {
    if (standPos) onFocusStand(standPos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standId])

  // Wind von Open-Meteo holen, wenn Sitz oder Zeit wechseln
  useEffect(() => {
    if (!standPos) return
    let cancelled = false
    setWind({ status: 'loading' })
    const at = fromBerlinLocal(time)
    const t = setTimeout(() => {
      fetchWindAt(standPos.lat, standPos.lng, at)
        .then((w) => !cancelled && setWind({ status: 'ok', wind: w }))
        .catch((e) => !cancelled && setWind({ status: 'error', message: (e as Error).message }))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standPos?.lat, standPos?.lng, time, reload])

  const windFrom = manual ?? (wind.status === 'ok' ? wind.wind.direction : null)
  const result = useMemo(() => {
    if (!standPos || !stand || windFrom == null) return null
    return analyzeScent(
      {
        stand: standPos,
        standBearing: stand.bearing,
        windFrom,
        windSpeed: manual == null && wind.status === 'ok' ? wind.wind.speed : null,
        gusts: manual == null && wind.status === 'ok' ? wind.wind.gusts : null,
        length: scentLength,
        width: scentWidth,
      },
      facilities,
      stand.id,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standPos?.lat, standPos?.lng, stand, windFrom, wind, manual, facilities, scentLength, scentWidth])

  useEffect(() => {
    if (!result || !standPos) {
      onOverlay(null)
      return
    }
    onOverlay({
      fitKey: `${stand!.id}|${Math.round(result.scentDir / 45)}`,
      cone: result.cone,
      stand: standPos,
      highlightIds: new Set(result.messages.filter((m) => m.facilityId && m.severity === 'warn').map((m) => m.facilityId!)),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  useEffect(() => () => onOverlay(null), [onOverlay])

  if (!stands.length) {
    return (
      <Sheet title="Wind & Witterung" onClose={onClose}>
        <p className="text-ink-dim">Lege zuerst einen Sitz an (Hochsitz, Kanzel, Leiter oder Drückjagdbock).</p>
      </Sheet>
    )
  }

  const preset = (d: Date) => {
    setManual(null)
    setTime(toBerlinLocal(d))
  }

  return (
    <Sheet title={stand ? `Wind · ${stand.name || typeInfo(stand.type).label}` : 'Wind & Witterung'} onClose={onClose}>
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
        ) : wind.status === 'loading' ? (
          <p className="flex items-center gap-2 text-ink-dim">
            <Loader2 className="animate-spin" /> Lade Wind von Open-Meteo…
          </p>
        ) : wind.status === 'ok' ? (
          <div>
            <p className="text-lg font-semibold">
              Wind aus {compass16(wind.wind.direction)} ({Math.round(wind.wind.direction)}°) · {Math.round(wind.wind.speed)} km/h
              {wind.wind.gusts != null && <span className="text-ink-dim"> · Böen {Math.round(wind.wind.gusts)} km/h</span>}
            </p>
            <p className="text-sm text-ink-dim">
              {fmtDateTime(fromBerlinLocal(wind.wind.time))} Uhr · Quelle: Open-Meteo
            </p>
          </div>
        ) : wind.status === 'error' ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-hint">{wind.message} Stell den Wind unten selbst ein.</p>
            <button className="btn-round" onClick={() => setReload((r) => r + 1)} aria-label="Erneut laden">
              <RefreshCw />
            </button>
          </div>
        ) : null}
      </div>

      {result && (
        <div className="mb-5 grid gap-2">
          {result.messages.map((m, i) => (
            <Message key={i} m={m} />
          ))}
        </div>
      )}

      <label className="mb-3 block">
        <span className="label">Sitz (oder auf der Karte antippen)</span>
        <select className="input" value={standId ?? ''} onChange={(e) => setStandId(e.target.value)}>
          {stands.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || typeInfo(s.type).label}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-2 block">
        <span className="label">Zeitpunkt</span>
        <input className="input" type="datetime-local" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
      </label>
      {standPos && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button className="btn !px-2 !text-base" onClick={() => preset(new Date())}>
            Jetzt
          </button>
          <button className="btn !px-2 !text-base" onClick={() => preset(eveningStart(standPos.lat, standPos.lng))}>
            Heute Abend
          </button>
          <button className="btn !px-2 !text-base" onClick={() => preset(morningStart(standPos.lat, standPos.lng))}>
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
      <input
        type="range"
        className="mb-2 h-10 w-full accent-[#d4a72c]"
        min={0}
        max={355}
        step={5}
        value={windFrom ?? 0}
        onChange={(e) => setManual(Number(e.target.value))}
      />
      <p className="text-sm text-ink-dim">
        Der rote Kegel zeigt, wohin deine Witterung zieht ({scentLength} m, {scentWidth}° breit – änderbar unter „Mehr“).
      </p>
    </Sheet>
  )
}

function Message({ m }: { m: ScentMessage }) {
  const style = {
    warn: { cls: 'border-warn/70 bg-[#3a1a12]', icon: <AlertTriangle className="shrink-0 text-warn" /> },
    hint: { cls: 'border-hint/60 bg-[#33290f]', icon: <AlertTriangle className="shrink-0 text-hint" /> },
    good: { cls: 'border-good/60 bg-[#14301a]', icon: <CheckCircle2 className="shrink-0 text-good" /> },
    info: { cls: 'border-line bg-panel-2', icon: <Info className="shrink-0 text-ink-dim" /> },
  }[m.severity]
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 text-base ${style.cls}`}>
      {style.icon}
      <span>{m.text}</span>
    </div>
  )
}
