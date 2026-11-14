import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../components/ui'
import { db } from '../db/db'
import { useSetting } from '../db/settings'
import { typeInfo } from '../domain/facilityTypes'
import { analyzeScent, type ScentMessage } from '../domain/scent'
import { standFacing } from '../domain/shootingField'
import { atText, checkRoutes, routeLine, type RouteCheck } from '../domain/approach'
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
  /** Gewählter Anmarschweg und Witterungskegel entlang des Wegs */
  route?: LatLng[]
  routeCones?: LatLng[][]
}

type WindState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; wind: WindAt }
  | { status: 'error'; message: string }

export function WindPanel({
  initialStandId,
  initialRouteId,
  onOverlay,
  onFocusStand,
  onClose,
}: {
  initialStandId: string | null
  /** Diesen Anmarschweg gleich auswählen */
  initialRouteId?: string
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
  const [routeId, setRouteId] = useState<string | null>(initialRouteId ?? null)

  useEffect(() => setStandId(initialStandId), [initialStandId])
  useEffect(() => setRouteId(initialRouteId ?? null), [initialRouteId])
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
        standBearing: standFacing(stand),
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

  // Anmarschwege dieses Sitzes bei diesem Wind prüfen (bester zuerst)
  const routeChecks = useMemo(
    () => (stand && windFrom != null ? checkRoutes(stand, windFrom, facilities, { length: scentLength, width: scentWidth }) : []),
    [stand, windFrom, facilities, scentLength, scentWidth],
  )
  const selectedRoute = routeChecks.find((c) => c.route.id === routeId) ?? null

  useEffect(() => {
    if (!result || !standPos) {
      onOverlay(null)
      return
    }
    const warnIds = [
      ...result.messages.filter((m) => m.facilityId && m.severity === 'warn').map((m) => m.facilityId!),
      ...(selectedRoute?.hits.filter((h) => h.facilityId && h.severity === 'warn').map((h) => h.facilityId!) ?? []),
    ]
    onOverlay({
      fitKey: `${stand!.id}|${Math.round(result.scentDir / 45)}|${selectedRoute?.route.id ?? ''}`,
      cone: result.cone,
      stand: standPos,
      highlightIds: new Set(warnIds),
      route: selectedRoute ? routeLine(selectedRoute.route) : undefined,
      routeCones: selectedRoute?.cones,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, selectedRoute])

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

      {routeChecks.length > 0 && (
        <RouteSection checks={routeChecks} selectedId={routeId} onSelect={(id) => setRouteId(id === routeId ? null : id)} />
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

/** z. B. „3 Warnungen, 1 Hinweis“ oder „keine Warnung“ */
function describe(c: RouteCheck) {
  const warn = c.hits.filter((h) => h.severity === 'warn').length
  const hint = c.hits.length - warn
  const parts = [warn ? `${warn} Warnung${warn > 1 ? 'en' : ''}` : '', hint ? `${hint} Hinweis${hint > 1 ? 'e' : ''}` : ''].filter(Boolean)
  return parts.length ? parts.join(', ') : 'keine Warnung'
}

/** Anmarschwege des Sitzes: Status je Weg, Empfehlung, Details des gewählten Wegs */
function RouteSection({ checks, selectedId, onSelect }: { checks: RouteCheck[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const best = checks[0]
  const selected = checks.find((c) => c.route.id === selectedId) ?? null
  const better = selected && selected.score > 0 && best.route.id !== selected.route.id && best.score < selected.score ? best : null
  return (
    <div className="mb-5">
      <span className="label">Anmarschwege bei diesem Wind {checks.length > 1 && '(bester zuerst)'}</span>
      <div className="mb-2 grid gap-2">
        {checks.map((c) => {
          const warn = c.hits.filter((h) => h.severity === 'warn').length
          const hint = c.hits.length - warn
          const active = c.route.id === selectedId
          return (
            <button
              key={c.route.id}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left ${active ? 'border-accent bg-panel-2' : 'border-line'}`}
              onClick={() => onSelect(c.route.id)}
            >
              {warn ? <AlertTriangle className="shrink-0 text-warn" /> : hint ? <AlertTriangle className="shrink-0 text-hint" /> : <CheckCircle2 className="shrink-0 text-good" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.route.name || 'Anmarschweg'}</span>
                <span className="block text-sm text-ink-dim">
                  {Math.round(c.lengthM)} m · {describe(c)}
                  {c === best && checks.length > 1 && c.score < checks[checks.length - 1].score ? ' · empfohlen' : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {better && (
        <div className="mb-2 flex items-start gap-3 rounded-xl border border-good/60 bg-[#14301a] p-3">
          <CheckCircle2 className="shrink-0 text-good" />
          <span>
            Besser bei diesem Wind: <b>{better.route.name || 'anderer Weg'}</b> ({describe(better)} statt {describe(selected!)}).
          </span>
        </div>
      )}
      {selected && (
        <div className="grid gap-2">
          {!selected.hits.length && (
            <Message m={{ severity: 'good', text: 'Auf diesem Weg zieht deine Witterung über keine bekannten Wechsel, Einstände, Kirrungen oder ins Schussfeld.' }} />
          )}
          {selected.hits.map((h, i) => (
            <Message key={i} m={{ severity: h.severity, text: `${atText(h.atM)[0].toUpperCase()}${atText(h.atM).slice(1)}: ${h.text}` }} />
          ))}
          <p className="text-sm text-ink-dim">Die hellroten Kegel auf der Karte zeigen, wohin deine Witterung unterwegs zieht.</p>
        </div>
      )}
      {!selected && <p className="text-sm text-ink-dim">Weg antippen für Details und Witterung entlang des Wegs.</p>}
    </div>
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
